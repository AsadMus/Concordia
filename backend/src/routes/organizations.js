
const router = require("express").Router();
const db = require("../db/pool");
const crypto = require("crypto");
const { asyncHandler, httpError } = require("../middleware/errors");

function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return "CC-" + Array.from(
        { length: 8 },
        () => alphabet[crypto.randomInt(alphabet.length)]
    ).join("");
}

async function getAccount(userId) {
    const { rows } = await db.query(
        "SELECT * FROM users WHERE id = $1",
        [userId]
    );

    if (!rows.length) {
        throw httpError(404, "Account not found");
    }

    return rows[0];
}

// Get organizations belonging to the current user
router.get("/", asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { rows } = await db.query(
        `SELECT o.*, u.email AS owner_email,
            COALESCE(
                NULLIF(TRIM(u.stage_name), ''),
                CONCAT_WS(' ', u.first_name, u.last_name)
            ) AS owner_display_name
         FROM organizations o
         JOIN users u ON u.id = o.owner_id
         WHERE o.owner_id = $1
         OR EXISTS (
             SELECT 1 FROM organization_members m
             WHERE m.organization_id = o.id
             AND m.user_id = $1
         )
         ORDER BY o.created_at DESC`,
        [userId]
    );

    const organizations = [];

    for (const org of rows) {
        const { rows: members } = await db.query(
            `SELECT u.id, u.email, m.member_role,
                COALESCE(
                    NULLIF(TRIM(u.stage_name), ''),
                    CONCAT_WS(' ', u.first_name, u.last_name)
                ) AS display_name
             FROM organization_members m
             JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = $1`,
            [org.id]
        );

        const owner = org.owner_id === userId;
        const admin = members.some(
            m => m.id === userId && m.member_role === "admin"
        );
        const { rows: assignments } = await db.query(
            `SELECT admin_id, artist_id
            FROM organization_assignments
            WHERE organization_id = $1`,
            [org.id]
        );
        const assignedArtistIds = new Set(
            assignments
                .filter(a => a.admin_id === userId)
                .map(a => a.artist_id)
        );
        const visibleMembers = members.filter(m =>
            owner ||
            m.id === userId ||
            (
                admin &&
                m.member_role === "artist" &&
                assignedArtistIds.has(m.id)
            )
        );
        organizations.push({
            id: org.id,
            name: org.name,
            type: org.type,
            ownerId: org.owner_email,
            ownerName: org.owner_display_name,
            artistCode: owner ? org.artist_code : null,
            adminCode: owner ? org.admin_code : null,
            members: visibleMembers
                .filter(m => m.member_role === "artist")
                .map(m => m.email),

            admins: visibleMembers
                .filter(m => m.member_role === "admin")
                .map(m => m.email),

            memberNames: Object.fromEntries(
                visibleMembers.map(m => [m.email, m.display_name])
            ),
            createdAt: org.created_at
        });
    }

    res.json(organizations);
}));

// Create an organization
router.post("/", asyncHandler(async (req, res) => {
    const user = await getAccount(req.user.id);

    if (user.account_type !== "manager") {
        throw httpError(403, "Manager account required");
    }

    const name = String(req.body.name || "").trim();
    const type = req.body.type;

    if (!name || name.length > 100) {
        throw httpError(400, "Invalid organization name");
    }

    if (!["team", "collective"].includes(type)) {
        throw httpError(400, "Invalid organization type");
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const artistCode = generateCode();
        const adminCode = type === "collective"
            ? generateCode()
            : null;

        if (artistCode === adminCode) continue;

        try {
            const { rows } = await db.query(
                `INSERT INTO organizations
                 (owner_id, name, type, artist_code, admin_code)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, name, type`,
                [user.id, name, type, artistCode, adminCode]
            );

            return res.status(201).json(rows[0]);
        } catch (error) {
            if (error.code !== "23505") throw error;
        }
    }

    throw httpError(500, "Unable to generate invitation code");
}));

// Join an organization using an invitation code
router.post("/join", asyncHandler(async (req, res) => {
    const user = await getAccount(req.user.id);
    const code = String(req.body.code || "").trim().toUpperCase();

    const role = req.body.role ||
        (user.account_type === "manager" ? "admin" : "artist");

    if (!["artist", "admin"].includes(role)) {
        throw httpError(400, "Invalid membership role");
    }

    if (role === "artist" && user.account_type !== "artist") {
        throw httpError(403, "Artist account required");
    }

    const { rows } = await db.query(
        `SELECT id, name, owner_id
         FROM organizations
         WHERE (
             $2 = 'artist' AND artist_code = $1
         ) OR (
             $2 = 'admin'
             AND type = 'collective'
             AND admin_code = $1
         )`,
        [code, role]
    );

    if (!rows.length) {
        throw httpError(404, "Invalid invitation code");
    }

    const org = rows[0];

    if (org.owner_id === user.id) {
        throw httpError(400, "You already own this organization");
    }

    const result = await db.query(
        `INSERT INTO organization_members
         (organization_id, user_id, member_role)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [org.id, user.id, role]
    );

    if (!result.rowCount) {
        throw httpError(400, "You already belong to this organization");
    }

    res.status(201).json({
        message: "Joined " + org.name
    });
}));

// Leave an organization
router.delete("/:id/leave", asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM organization_members
         WHERE organization_id = $1
         AND user_id = $2`,
        [req.params.id, req.user.id]
    );

    if (!rowCount) {
        throw httpError(404, "Membership not found");
    }

    res.status(204).end();
}));

// Remove an artist or administrator (owner only)
router.delete("/:id/members", asyncHandler(async (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();
    const role = req.query.role;

    if (!["artist", "admin"].includes(role)) {
        throw httpError(400, "Invalid member role");
    }

    const { rowCount } = await db.query(
        `DELETE FROM organization_members m
         USING organizations o, users u
         WHERE m.organization_id = o.id
         AND m.user_id = u.id
         AND o.id = $1
         AND LOWER(u.email) = $2
         AND m.member_role = $3
         AND o.owner_id = $4`,
        [req.params.id, email, role, req.user.id]
    );

    if (!rowCount) {
        throw httpError(404, "Member not found or permission denied");
    }

    res.status(204).end();
}));

// Rename an organization
router.put("/:id", asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (!name || name.length > 100) {
        throw httpError(400, "Invalid organization name");
    }

    const { rows } = await db.query(
        `UPDATE organizations
         SET name = $1
         WHERE id = $2 AND owner_id = $3
         RETURNING id, name`,
        [name, req.params.id, req.user.id]
    );

    if (!rows.length) {
        throw httpError(404, "Organization not found or permission denied");
    }

    res.json(rows[0]);
}));

// Delete an organization
router.delete("/:id", asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM organizations
         WHERE id = $1 AND owner_id = $2`,
        [req.params.id, req.user.id]
    );

    if (!rowCount) {
        throw httpError(404, "Organization not found or permission denied");
    }

    res.status(204).end();
}));

// Assign an artist to an administrator (owner only)
router.post("/:id/assignments", asyncHandler(async (req, res) => {
    const orgId = req.params.id;
    const { adminEmail, artistEmail } = req.body;

    const owner = await db.query(
        `SELECT id FROM organizations
         WHERE id = $1 AND owner_id = $2`,
        [orgId, req.user.id]
    );

    if (!owner.rowCount) {
        throw httpError(403, "Only the owner can assign artists");
    }

    const { rows } = await db.query(
        `INSERT INTO organization_assignments
         (organization_id, admin_id, artist_id)
         SELECT $1, a.user_id, ar.user_id
         FROM organization_members a
         JOIN users au ON au.id = a.user_id
         JOIN organization_members ar
             ON ar.organization_id = a.organization_id
         JOIN users aru ON aru.id = ar.user_id
         WHERE a.organization_id = $1
         AND a.member_role = 'admin'
         AND ar.member_role = 'artist'
         AND LOWER(au.email) = LOWER($2)
         AND LOWER(aru.email) = LOWER($3)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [orgId, adminEmail, artistEmail]
    );

    if (!rows.length) {
        throw httpError(400, "Invalid or existing assignment");
    }

    res.status(201).json(rows[0]);
}));

// Get administrator assignments
router.get("/:id/assignments", asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `SELECT
            au.email AS "adminEmail",
            aru.email AS "artistEmail",
            a.assigned_at AS "assignedAt"
         FROM organization_assignments a
         JOIN organizations o ON o.id = a.organization_id
         JOIN users au ON au.id = a.admin_id
         JOIN users aru ON aru.id = a.artist_id
         JOIN organization_members am
             ON am.organization_id = a.organization_id
             AND am.user_id = a.admin_id
         WHERE a.organization_id = $1
         AND (
             o.owner_id = $2
             OR (
                 a.admin_id = $2
                 AND am.member_role = 'admin'
             )
         )`,
        [req.params.id, req.user.id]
    );

    res.json(rows);
}));

// Remove an administrator assignment (owner only)
router.delete("/:id/assignments", asyncHandler(async (req, res) => {
    const { adminEmail, artistEmail } = req.query;

    const { rowCount } = await db.query(
        `DELETE FROM organization_assignments a
         USING organizations o, users au, users aru
         WHERE a.organization_id = o.id
         AND a.admin_id = au.id
         AND a.artist_id = aru.id
         AND o.id = $1
         AND o.owner_id = $2
         AND LOWER(au.email) = LOWER($3)
         AND LOWER(aru.email) = LOWER($4)`,
        [
            req.params.id,
            req.user.id,
            adminEmail,
            artistEmail
        ]
    );

    if (!rowCount) {
        throw httpError(404, "Assignment not found or access denied");
    }

    res.status(204).end();
}));

// Verify access to an artist within an organization
async function getArtistAccess(orgId, userId, artistEmail) {
    const { rows } = await db.query(
        `SELECT
            m.user_id AS artist_id,
            m.permissions,
            (o.owner_id = $2) AS is_owner
         FROM organization_members m
         JOIN organizations o
            ON o.id = m.organization_id
         JOIN users u
            ON u.id = m.user_id
         WHERE m.organization_id = $1
         AND m.member_role = 'artist'
         AND LOWER(u.email) = LOWER($3)
         AND (
             o.owner_id = $2
             OR EXISTS (
                 SELECT 1
                 FROM organization_assignments a
                 JOIN organization_members am
                    ON am.organization_id = a.organization_id
                    AND am.user_id = a.admin_id
                 WHERE a.organization_id = m.organization_id
                 AND a.artist_id = m.user_id
                 AND a.admin_id = $2
                 AND am.member_role = 'admin'
             )
         )`,
        [orgId, userId, artistEmail]
    );

    if (!rows.length) {
        throw httpError(403, "Artist access denied");
    }

    return rows[0];
}

// Get an artist's permissions
router.get("/:id/permissions", asyncHandler(async (req, res) => {
    const access = await getArtistAccess(
        req.params.id,
        req.user.id,
        req.query.email
    );

    res.json(access.permissions);
}));

// Update an artist's permissions
router.put("/:id/permissions", asyncHandler(async (req, res) => {
    const access = await getArtistAccess(
        req.params.id,
        req.user.id,
        req.body.email
    );

    const categories = [
        "contacts",
        "projects",
        "bookings",
        "opportunities",
        "revenue"
    ];

    const allowed = ["none", "view", "edit"];
    const permissions = {};

    for (const category of categories) {
        const value = req.body.permissions?.[category];

        if (!allowed.includes(value)) {
            throw httpError(400, "Invalid permission");
        }

        permissions[category] = value;
    }

    const { rows } = await db.query(
        `UPDATE organization_members m
         SET permissions = $1::jsonb
         WHERE m.organization_id = $2
         AND m.user_id = $3
         AND m.member_role = 'artist'
         AND EXISTS (
             SELECT 1 FROM organizations o
             WHERE o.id = m.organization_id
             AND (
                 o.owner_id = $4
                 OR EXISTS (
                     SELECT 1
                     FROM organization_assignments a
                     JOIN organization_members am
                         ON am.organization_id = a.organization_id
                         AND am.user_id = a.admin_id
                     WHERE a.organization_id = m.organization_id
                     AND a.artist_id = m.user_id
                     AND a.admin_id = $4
                     AND am.member_role = 'admin'
                 )
             )
         )
         RETURNING permissions`,
        [
            JSON.stringify(permissions),
            req.params.id,
            access.artist_id,
            req.user.id
        ]
    );

    if (!rows.length) {
        throw httpError(403, "Artist access denied");
    }

    res.json(rows[0].permissions);
}));

// View an artist's profile
router.get("/:id/artist/profile", asyncHandler(async (req, res) => {
    const access = await getArtistAccess(
        req.params.id,
        req.user.id,
        req.query.email
    );

    const { rows } = await db.query(
        `SELECT id, first_name, last_name, stage_name,
                email, phone, genres, bio, location, socials
         FROM users
         WHERE id = $1`,
        [access.artist_id]
    );

    res.json(rows[0]);
}));

// View authorized artist CRM records
router.get("/:id/artist/:category", asyncHandler(async (req, res) => {
    const tables = {
        contacts: "contacts",
        projects: "projects",
        bookings: "bookings",
        opportunities: "opportunities",
        revenue: "transactions"
    };

    const category = req.params.category;

    if (!Object.prototype.hasOwnProperty.call(tables, category)) {
        throw httpError(400, "Invalid category");
    }

    const access = await getArtistAccess(
        req.params.id,
        req.user.id,
        req.query.email
    );

    const permission = access.permissions?.[category];
    if (access.is_owner && category === "contacts") {
        throw httpError(403, "Artist contacts are private");
    }

    if (!access.is_owner && !["view", "edit"].includes(permission)) {
        throw httpError(403, "Permission denied");
    }

    const { rows } = await db.query(
        `SELECT *
         FROM ${tables[category]}
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [access.artist_id]
    );

    res.json({
        category,
        permission: access.is_owner ? "edit" : permission,
        records: rows
    });
}));

module.exports = router;
