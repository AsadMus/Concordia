// TODO - Professional connection mapping (feature ix) -> network.html
// GET / returns graph data for D3 / React Flow / vis-network:
//   { nodes: [{ id, label, role }], edges: [{ from, to, label }] }
// Edges come from: contact_connections (manual "knows through" links)
//   + contacts who share a project (project_collaborators) or booking (booking_performers).
// POST /connections body { contactA, contactB, description } adds a manual link.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');


router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const { rows: contactRows } = await db.query(
        `SELECT id, name, stage_name, role FROM contacts WHERE user_id = $1 ORDER BY name`, 
        [userId]
    );

    const nodes = contactRows.map((c) => ({
        id: c.id,
        label: c.stage_name ? `${c.name} (${c.stage_name})` : c.name,
        role: c.role || 'Contact',



    }));

    const { rows: manualRows } = await db.query(
        `SELECT id, contact_a, contact_b, description
        FROM contact_connections
        WHERE user_id = $1`,
        [userId]
    );

    const edges = manualRows.map((r) => ({
        id: r.id,
        from: r.contact_a,
        to: r.contact_b,
        label: r.description || 'Connected',
        type: 'manual',
    }));

    const { rows: projectEdges } = await db.query(
        `SELECT DISTINCT
            LEAST(pc1.contact_id, pc2.contact_id) AS contact_a,
            GREATEST(pc1.contact_id, pc2.contact_id) AS contact_b,
            p.title AS project_title
        FROM project_collaborators pc1
        JOIN project_collaborators pc2
            ON pc1.project_id = pc2.project_id 
            AND pc1.contact_id != pc2.contact_id
        JOIN projects p ON p.id = pc1.project_id
        WHERE p.user_id = $1`,
        [userId]

    );

    for (const r of projectEdges) {
        edges.push({
            from: r.contact_a,
            to: r.contact_b,
            label: `Project: ${r.project_title}`,
            type: 'project',
        });
    }

    const { rows: bookingEdges } = await db.query(
    `SELECT DISTINCT
        LEAST(bp1.contact_id, bp2.contact_id) AS contact_a,
        GREATEST(bp1.contact_id, bp2.contact_id) AS contact_b,
        b.title AS booking_title
    FROM booking_performers bp1
    JOIN booking_performers bp2 ON bp1.booking_id = bp2.booking_id
    JOIN bookings b ON b.id = bp1.booking_id
    WHERE b.user_id = $1
        AND bp1.contact_id != bp2.contact_id`,
    [userId]
  );

    for (const r of bookingEdges) {
        edges.push({
            from: r.contact_a,
            to: r.contact_b,
            label: `Booking: ${r.booking_title}`,
            type: 'booking',
        });
    }

    res.json({ nodes, edges })
}));

router.post('/connections', asyncHandler(async (req, res) => {
    const contactA = Number(req.body.contactA);
    const contactB = Number(req.body.contactB);
    const { description } = req.body;
    
    if (!Number.isInteger(contactA) || !Number.isInteger(contactB)) {
        throw httpError(400, 'contactA and contactB must be valid contact IDs');
    }
    if (contactA === contactB) {
        throw httpError(400, 'Cannot connect a contact to themselves');
    }

    const result = await db.query(
        `INSERT INTO contact_connections (user_id, contact_a, contact_b, description)
        VALUES ($1, $2, $3, $4)
        RETURNING id, contact_a, contact_b, description`,
        [req.user.id, contactA, contactB, description || null]
    );

    const row = result.rows.at(0);
    res.status(201).json({
        id: row.id,
        from: row.contact_a,
        to: row.contact_b,
        label: row.description || 'Connected',
        type: 'manual',
  });
}));

router.delete('/connections/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM contact_connections WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
    );
    if(!rowCount) throw httpError(404, 'Connection not found');
    res.status(204).end();
}));

module.exports = router;
