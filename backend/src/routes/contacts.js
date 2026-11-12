// ===================================================================
// CONTACTS - the fully working reference route.
// Copy this file's pattern for every other resource:
//   1. Every query filters by user_id = req.user.id  (users can't see each other's data)
//   2. Map camelCase request fields -> snake_case columns
//   3. Return 404 when a row doesn't exist OR belongs to someone else
// ===================================================================
//
// GET    /api/contacts?search=&role=&status=   list (with optional filters)
// GET    /api/contacts/:id                      one contact
// POST   /api/contacts                          create
// PUT    /api/contacts/:id                      update (only fields you send)
// DELETE /api/contacts/:id                      delete
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

// request field -> database column
const FIELDS = {
  name: 'name', stageName: 'stage_name', role: 'role', genres: 'genres',
  email: 'email', phone: 'phone', socials: 'socials', location: 'location',
  relationshipStatus: 'relationship_status', notes: 'notes',
};

const toJson = (r) => ({
  id: r.id, name: r.name, stageName: r.stage_name, role: r.role, genres: r.genres,
  email: r.email, phone: r.phone, socials: r.socials, location: r.location,
  relationshipStatus: r.relationship_status, notes: r.notes, createdAt: r.created_at,
});

router.get('/', asyncHandler(async (req, res) => {
  const { search, role, status } = req.query;
  const where = ['user_id = $1'];
  const params = [req.user.id];
  if (search) { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR stage_name ILIKE $${params.length})`); }
  if (role) { params.push(role); where.push(`role = $${params.length}`); }
  if (status) { params.push(status); where.push(`relationship_status = $${params.length}`); }

  const { rows } = await db.query(
    `SELECT * FROM contacts WHERE ${where.join(' AND ')} ORDER BY name`, params
  );
  res.json(rows.map(toJson));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM contacts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
  );
  if (!rows[0]) throw httpError(404, 'Contact not found');
  res.json(toJson(rows[0]));
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.name) throw httpError(400, 'Name is required');
  const cols = ['user_id'];
  const vals = [req.user.id];
  for (const [field, col] of Object.entries(FIELDS)) {
    if (req.body[field] !== undefined) { cols.push(col); vals.push(req.body[field]); }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `INSERT INTO contacts (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`, vals
  );
  res.status(201).json(toJson(rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const sets = [];
  const vals = [];
  for (const [field, col] of Object.entries(FIELDS)) {
    if (req.body[field] !== undefined) { vals.push(req.body[field]); sets.push(`${col} = $${vals.length}`); }
  }
  if (!sets.length) throw httpError(400, 'Nothing to update');
  vals.push(req.params.id, req.user.id);
  const { rows } = await db.query(
    `UPDATE contacts SET ${sets.join(', ')}
     WHERE id = $${vals.length - 1} AND user_id = $${vals.length} RETURNING *`, vals
  );
  if (!rows[0]) throw httpError(404, 'Contact not found');
  res.json(toJson(rows[0]));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM contacts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
  );
  if (!rowCount) throw httpError(404, 'Contact not found');
  res.status(204).end();
}));

module.exports = router;
