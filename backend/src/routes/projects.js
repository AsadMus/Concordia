// TODO - Collaboration tracker (feature iii) -> projects.html, dashboard "Projects" card
// Tables: projects, project_collaborators. Follow the pattern in contacts.js.
// GET  /           list; support ?status= filter. Include collaborators (names + credit) for each project.
// POST /:id/collaborators  body { contactId, credit }  - check the contact belongs to req.user.id first!
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

const FIELDS = {
    title: 'title',
    type: 'type',
    status: 'status',
    deadline: 'deadline',
    notes: 'notes',
    fee: 'fee',
    paymentStatus: 'payment_status',
    manualCollaborators: 'manual_collaborators',
};

const toJson = (r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    deadline: r.deadline,
    notes: r.notes,
    collaborators: r.collaborators || [],
    createdAt: r.created_at,
    fee: r.fee,
    paymentStatus: r.payment_status,
    manualCollaborators: r.manual_collaborators || [],
});

const SELECT_WITH_COLLABS = `SELECT p.*, COALESCE(JSON_AGG(JSON_BUILD_OBJECT('contactId', c.id, 'name', c.name, 'stageName', c.stage_name, 'credit', pc.credit) ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]') AS collaborators FROM projects p LEFT JOIN project_collaborators pc ON p.id = pc.project_id LEFT JOIN contacts c ON pc.contact_id = c.id`;

router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const where = ['p.user_id = $1'];
    const params = [req.user.id];

    if (status) {
        params.push(status);
        where.push(`p.status = $${params.length}`);
    }

    const { rows } = await db.query(`${SELECT_WITH_COLLABS} WHERE ${where.join(' AND ')} GROUP BY p.id ORDER BY p.deadline ASC NULLS LAST, p.created_at DESC`, params);
    res.json(rows.map(toJson));
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`${SELECT_WITH_COLLABS} WHERE p.id = $1 AND p.user_id = $2 GROUP BY p.id`, [req.params.id, req.user.id]);
    if (!rows[0]) throw httpError(404, 'Project not found');
    res.json(toJson(rows[0]));
}));

router.post('/', asyncHandler(async (req, res) => {
    if (!req.body.title) throw httpError(400, 'Title is required');

    const cols = ['user_id'];
    const vals = [req.user.id];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            cols.push(col);
            const input = req.body[field];
            vals.push(
                field === 'manualCollaborators'
                    ? JSON.stringify(input ?? [])
                    : input === '' ? null : input
            );
        }
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
        `INSERT INTO projects (${cols.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING *`, 
        vals
    );
    res.status(201).json(toJson(rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const sets = [];
    const vals = [];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            const input = req.body[field];
            vals.push(
                field === 'manualCollaborators'
                    ? JSON.stringify(input ?? [])
                    : input === '' ? null : input
            );
            sets.push(`${col} = $${vals.length}`);
        }
    }
    if (sets.length === 0) throw httpError(400, 'Nothing to update');

    vals.push(req.params.id, req.user.id);
    const { rows } = await db.query(
        `UPDATE projects 
        SET ${sets.join(', ')} 
        WHERE id = $${vals.length - 1} AND user_id = $${vals.length} 
        RETURNING id`, 
        vals
    );
    if (!rows[0]) throw httpError(404, 'Project not found');

    const full = await db.query(
        `${SELECT_WITH_COLLABS} 
        WHERE p.id = $1 AND p.user_id = $2 
        GROUP BY p.id`, 
        [req.params.id, req.user.id]
    );

    res.json(toJson(full.rows[0]));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM projects WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!rowCount) throw httpError(404, 'Project not found');
    res.status(204).end();
}));

router.post('/:id/collaborators', asyncHandler(async (req, res) => {
    const { contactId, credit } = req.body;
    if (!contactId) throw httpError(400, 'contactId is required');

    const proj = await db.query(
        `SELECT id FROM projects 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!proj.rows[0]) throw httpError(404, 'Project not found');

    const contact = await db.query(
        `SELECT id, name, stage_name 
        FROM contacts 
        WHERE id = $1 AND user_id = $2`, 
        [contactId, req.user.id]
    );
    if (!contact.rows[0]) throw httpError(404, 'Contact not found');

    await db.query(
        `INSERT INTO project_collaborators (project_id, contact_id, credit) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (project_id, contact_id) 
        DO UPDATE SET credit = EXCLUDED.credit`, 
        [req.params.id, contactId, credit || null]
    );

    res.status(201).json({
        contactId: contact.rows[0].id,
        name: contact.rows[0].name,
        stageName: contact.rows[0].stage_name,
        credit: credit || null,
    });
}));

router.delete('/:id/collaborators/:contactId', asyncHandler(async (req, res) => {
    const proj = await db.query(
        `SELECT id 
        FROM projects 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!proj.rows[0]) throw httpError(404, 'Project not found');

    const { rowCount } = await db.query(
        `DELETE FROM project_collaborators 
        WHERE project_id = $1 AND contact_id = $2`, 
        [req.params.id, req.params.contactId]
    );
    if (!rowCount) throw httpError(404, 'Collaborator not found on project');
    res.status(204).end();
}));

module.exports = router;
