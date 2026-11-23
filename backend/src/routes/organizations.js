
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
            `SELECT u.id, u.email, m.member_role
             FROM organization_members m
             JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = $1`,
            [org.id]
        );

        const owner = org.owner_id === userId;
        const admin = members.some(
            m => m.id === userId && m.member_role === "admin"
        );

        organizations.push({
            id: org.id,
            name: org.name,
            type: org.type,
            ownerId: org.owner_email,
            ownerName: org.owner_display_name,
            artistCode: owner ? org.artist_code : null,
            adminCode: owner ? org.admin_code : null,
            members: members
                .filter(m => m.member_role === "artist" &&
                    (owner || admin || m.id === userId))
                .map(m => m.email),
            admins: members
                .filter(m => m.member_role === "admin" &&
                    (owner || admin))
                .map(m => m.email),
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

    const role = user.account_type === "manager"
        ? "admin"
        : "artist";

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

// Remove an artist or administrator
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
         AND (
             o.owner_id = $4
             OR (
                 $3 = 'artist'
                 AND EXISTS (
                     SELECT 1
                     FROM organization_members a
                     WHERE a.organization_id = o.id
                     AND a.user_id = $4
                     AND a.member_role = 'admin'
                 )
             )
         )`,
        [req.params.id, email, role, req.user.id]
    );

    if (!rowCount) {
        throw httpError(404, "Member not found or permission denied");
    }

    res.status(204).end();
}));

module.exports = router;
