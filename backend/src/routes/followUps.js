// ===================================================================
// FOLLOW-UPS - Follow-up reminders (feature vi) -> dashboard, calendar.html
// GET    /api/follow-ups?completed=false  list with contact name + role
// POST   /api/follow-ups                  create reminder
// PUT    /api/follow-ups/:id              update reminder
// PATCH  /api/follow-ups/:id/complete     mark reminder done
// DELETE /api/follow-ups/:id              delete reminder
// ===================================================================
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

const FIELDS = {
  contactId: 'contact_id',
  dueDate: 'due_date',
  reason: 'reason',
  completed: 'completed',
};

const toJson = (r) => ({
  id: r.id,
  contactId: r.contact_id,
  contactName: r.contact_name,
  contactStageName: r.contact_stage_name,
  contactRole: r.contact_role,
  dueDate: r.due_date,
  reason: r.reason,
  completed: r.completed,
  createdAt: r.created_at,
});

const SELECT_WITH_CONTACT = `
SELECT f.*,
  c.name AS contact_name,
  c.stage_name AS contact_stage_name,
  c.role AS contact_role
FROM follow_ups f
JOIN contacts c ON c.id = f.contact_id
`;

async function verifyContactOwner(userId, contactId) {
  const res = await db.query(
    'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
    [contactId, userId]
  );
  if (!res.rows.at(0)) {
    throw httpError(404, 'Contact not found');
  }
}

// GET /api/follow-ups?completed=false&contactId=
router.get('/', asyncHandler(async (req, res) => {
  const { completed, contactId } = req.query;
  const where = ['f.user_id = $1'];
  const params = [req.user.id];

  if (completed !== undefined && completed !== '') {
    params.push(completed === 'true');
    where.push(`f.completed = $${params.length}`);
  }

  if (contactId) {
    params.push(contactId);
    where.push(`f.contact_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE ${where.join(' AND ')}
     ORDER BY f.completed ASC, f.due_date ASC, f.id ASC`,
    params
  );
  res.json(rows.map(toJson));
}));

// POST /api/follow-ups -> body { contactId, dueDate, reason, completed? }
router.post('/', asyncHandler(async (req, res) => {
  const { contactId, dueDate } = req.body;
  if (!contactId) throw httpError(400, 'contactId is required');
  if (!dueDate) throw httpError(400, 'dueDate is required');

  await verifyContactOwner(req.user.id, contactId);

  const cols = ['user_id'];
  const vals = [req.user.id];
  for (const [field, col] of Object.entries(FIELDS)) {
    if (req.body[field] !== undefined) {
      cols.push(col);
      vals.push(req.body[field] === '' ? null : req.body[field]);
    }
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const inserted = await db.query(
    `INSERT INTO follow_ups (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    vals
  );

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE f.id = $1 AND f.user_id = $2`,
    [inserted.rows.at(0).id, req.user.id]
  );
  res.status(201).json(toJson(full.rows.at(0)));
}));

// PUT /api/follow-ups/:id
router.put('/:id', asyncHandler(async (req, res) => {
  if (req.body.contactId !== undefined) {
    await verifyContactOwner(req.user.id, req.body.contactId);
  }

  const sets = [];
  const vals = [];
  for (const [field, col] of Object.entries(FIELDS)) {
    if (req.body[field] !== undefined) {
      vals.push(req.body[field] === '' ? null : req.body[field]);
      sets.push(`${col} = $${vals.length}`);
    }
  }

  if (!sets.length) throw httpError(400, 'Nothing to update');

  vals.push(req.params.id, req.user.id);
  const updated = await db.query(
    `UPDATE follow_ups
     SET ${sets.join(', ')}
     WHERE id = $${vals.length - 1} AND user_id = $${vals.length}
     RETURNING id`,
    vals
  );
  if (!updated.rows.at(0)) throw httpError(404, 'Follow-up not found');

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE f.id = $1 AND f.user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json(toJson(full.rows.at(0)));
}));

// PATCH /api/follow-ups/:id/complete -> marks one done (or accepts { completed: boolean })
router.patch('/:id/complete', asyncHandler(async (req, res) => {
  const completed = req.body?.completed !== undefined ? Boolean(req.body.completed) : true;

  const updated = await db.query(
    `UPDATE follow_ups
     SET completed = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id`,
    [completed, req.params.id, req.user.id]
  );
  if (!updated.rows.at(0)) throw httpError(404, 'Follow-up not found');

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE f.id = $1 AND f.user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json(toJson(full.rows.at(0)));
}));

// DELETE /api/follow-ups/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM follow_ups WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw httpError(404, 'Follow-up not found');
  res.status(204).end();
}));

module.exports = router;
