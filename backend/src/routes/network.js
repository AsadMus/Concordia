
const router = require("express").Router();
const db = require("../db/pool");
const { asyncHandler, httpError } = require("../middleware/errors");

function contactId(value) {
    if (value === "self" || value === null) return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw httpError(400, "Invalid contact ID");
    }
    return id;
}

function connectionResponse(row) {
    return {
        id: row.id,
        from: row.contact_a === null ? "self" : String(row.contact_a),
        to: row.contact_b === null ? "self" : String(row.contact_b),
        type: row.connection_type,
        strength: row.strength,
        date: row.connected_date
            ? String(row.connected_date).slice(0, 10)
            : "",
        notes: row.notes || row.description || ""
    };
}

async function verifyContacts(userId, ids) {
    const contactIds = ids.filter(id => id !== null);

    if (!contactIds.length) {
        throw httpError(400, "At least one contact is required");
    }

    const { rows } = await db.query(
        `SELECT id FROM contacts
         WHERE user_id = $1 AND id = ANY($2::int[])`,
        [userId, contactIds]
    );

    if (rows.length !== new Set(contactIds).size) {
        throw httpError(400, "Contact not found in your account");
    }
}

// Get network graph and saved connections
router.get("/", asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { rows: contacts } = await db.query(
        `SELECT id, name, stage_name, role
         FROM contacts
         WHERE user_id = $1
         ORDER BY name`,
        [userId]
    );

    const nodes = contacts.map(contact => ({
        id: String(contact.id),
        label: contact.stage_name
            ? `${contact.name} (${contact.stage_name})`
            : contact.name,
        role: contact.role || "Contact"
    }));

    const { rows } = await db.query(
        `SELECT id, contact_a, contact_b, description,
                strength, connected_date, connection_type, notes
         FROM contact_connections
         WHERE user_id = $1
         ORDER BY id`,
        [userId]
    );

    const connections = rows.map(connectionResponse);

    // Automatic connections from shared projects
    const { rows: projectRows } = await db.query(
        `SELECT DISTINCT
            LEAST(pc1.contact_id, pc2.contact_id) AS contact_a,
            GREATEST(pc1.contact_id, pc2.contact_id) AS contact_b,
            p.title
        FROM project_collaborators pc1
        JOIN project_collaborators pc2
            ON pc1.project_id = pc2.project_id
            AND pc1.contact_id < pc2.contact_id
        JOIN projects p ON p.id = pc1.project_id
        JOIN contacts c1 ON c1.id = pc1.contact_id
        JOIN contacts c2 ON c2.id = pc2.contact_id
        WHERE p.user_id = $1
        AND c1.user_id = $1
        AND c2.user_id = $1`,
        [userId]
    );

    // Automatic connections from shared bookings
    const { rows: bookingRows } = await db.query(
        `SELECT DISTINCT
            LEAST(bp1.contact_id, bp2.contact_id) AS contact_a,
            GREATEST(bp1.contact_id, bp2.contact_id) AS contact_b,
            b.title
        FROM booking_performers bp1
        JOIN booking_performers bp2
            ON bp1.booking_id = bp2.booking_id
            AND bp1.contact_id < bp2.contact_id
        JOIN bookings b ON b.id = bp1.booking_id
        JOIN contacts c1 ON c1.id = bp1.contact_id
        JOIN contacts c2 ON c2.id = bp2.contact_id
        WHERE b.user_id = $1
        AND c1.user_id = $1
        AND c2.user_id = $1`,
        [userId]
    );

    const automaticEdges = [
        ...projectRows.map((row, index) => ({
            id: `project-${index}-${row.contact_a}-${row.contact_b}`,
            from: String(row.contact_a),
            to: String(row.contact_b),
            type: "project",
            strength: "Active",
            date: "",
            notes: `Shared project: ${row.title}`,
            automatic: true
        })),
        ...bookingRows.map((row, index) => ({
            id: `booking-${index}-${row.contact_a}-${row.contact_b}`,
            from: String(row.contact_a),
            to: String(row.contact_b),
            type: "booking",
            strength: "Active",
            date: "",
            notes: `Shared booking: ${row.title}`,
            automatic: true
        }))
    ];

    res.json({
        nodes,
        edges: [...connections, ...automaticEdges],
        connections,
        automaticEdges
    });
}));

// Create connection
router.post("/connections", asyncHandler(async (req, res) => {
    const from = contactId(req.body.from);
    const to = contactId(req.body.to);

    if (from === to) {
        throw httpError(400, "Choose two different people");
    }

    await verifyContacts(req.user.id, [from, to]);

    const type = req.body.type || "Introduced";
    const strength = req.body.strength || "New";

    if (!["Introduced", "Met Directly"].includes(type)) {
        throw httpError(400, "Invalid connection type");
    }

    if (!["New", "Warm", "Active", "Frequent"].includes(strength)) {
        throw httpError(400, "Invalid relationship strength");
    }

    if (type === "Met Directly" && from !== null) {
        throw httpError(400, "Direct meetings must start from your profile");
    }

    const { rows } = await db.query(
        `INSERT INTO contact_connections
         (user_id, contact_a, contact_b, description,
          strength, connected_date, connection_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
            req.user.id,
            from,
            to,
            req.body.notes || null,
            strength,
            req.body.date || null,
            type,
            req.body.notes || null
        ]
    );

    res.status(201).json(connectionResponse(rows[0]));
}));

// Edit connection
router.put("/connections/:id", asyncHandler(async (req, res) => {
    const from = contactId(req.body.from);
    const to = contactId(req.body.to);

    if (from === to) {
        throw httpError(400, "Choose two different people");
    }

    await verifyContacts(req.user.id, [from, to]);

    const type = req.body.type || "Introduced";
    const strength = req.body.strength || "New";

    if (!["Introduced", "Met Directly"].includes(type)) {
        throw httpError(400, "Invalid connection type");
    }

    if (!["New", "Warm", "Active", "Frequent"].includes(strength)) {
        throw httpError(400, "Invalid relationship strength");
    }

    if (type === "Met Directly" && from !== null) {
        throw httpError(400, "Direct meetings must start from your profile");
    }

    const { rows } = await db.query(
        `UPDATE contact_connections
         SET contact_a = $1,
             contact_b = $2,
             description = $3,
             strength = $4,
             connected_date = $5,
             connection_type = $6,
             notes = $7
         WHERE id = $8 AND user_id = $9
         RETURNING *`,
        [
            from,
            to,
            req.body.notes || null,
            strength,
            req.body.date || null,
            type,
            req.body.notes || null,
            req.params.id,
            req.user.id
        ]
    );

    if (!rows.length) {
        throw httpError(404, "Connection not found");
    }

    res.json(connectionResponse(rows[0]));
}));

// Delete connection
router.delete("/connections/:id", asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM contact_connections
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
    );

    if (!rowCount) {
        throw httpError(404, "Connection not found");
    }

    res.status(204).end();
}));

module.exports = router;
