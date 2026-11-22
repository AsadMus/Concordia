// ===================================================================
// INTERACTIONS - Communication history / meeting notes (feature vi)
// GET    /api/interactions?contactId=  list history, newest first
// POST   /api/interactions             create interaction note
// PUT    /api/interactions/:id         update interaction note
// DELETE /api/interactions/:id         delete interaction note
// ===================================================================
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

const FIELDS = {
  contactId: 'contact_id',
  channel: 'channel',
  occurredAt: 'occurred_at',
  summary: 'summary',
};

const toJson = (r) => ({
  id: r.id,
  contactId: r.contact_id,
  contactName: r.contact_name,
  contactStageName: r.contact_stage_name,
  channel: r.channel,
  occurredAt: r.occurred_at,
  summary: r.summary,
});

const SELECT_WITH_CONTACT = `
SELECT i.*,
  c.name AS contact_name,
  c.stage_name AS contact_stage_name
FROM interactions i
JOIN contacts c ON c.id = i.contact_id
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

// GET /api/interactions?contactId=
router.get('/', asyncHandler(async (req, res) => {
  const { contactId } = req.query;
  const where = ['i.user_id = $1'];
  const params = [req.user.id];

  if (contactId) {
    params.push(contactId);
    where.push(`i.contact_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE ${where.join(' AND ')}
     ORDER BY i.occurred_at DESC, i.id DESC`,
    params
  );
  res.json(rows.map(toJson));
}));

// POST /api/interactions -> body { contactId, channel, occurredAt?, summary }
router.post('/', asyncHandler(async (req, res) => {
  const { contactId, summary } = req.body;
  if (!contactId) throw httpError(400, 'contactId is required');
  if (!summary || !String(summary).trim()) throw httpError(400, 'summary is required');

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
    `INSERT INTO interactions (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    vals
  );

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE i.id = $1 AND i.user_id = $2`,
    [inserted.rows.at(0).id, req.user.id]
  );
  res.status(201).json(toJson(full.rows.at(0)));
}));

// PUT /api/interactions/:id
router.put('/:id', asyncHandler(async (req, res) => {
  if (req.body.contactId !== undefined) {
    await verifyContactOwner(req.user.id, req.body.contactId);
  }
  if (req.body.summary !== undefined && !String(req.body.summary).trim()) {
    throw httpError(400, 'summary cannot be empty');
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
    `UPDATE interactions
     SET ${sets.join(', ')}
     WHERE id = $${vals.length - 1} AND user_id = $${vals.length}
     RETURNING id`,
    vals
  );
  if (!updated.rows.at(0)) throw httpError(404, 'Interaction not found');

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE i.id = $1 AND i.user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json(toJson(full.rows.at(0)));
}));

// DELETE /api/interactions/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM interactions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw httpError(404, 'Interaction not found');
  res.status(204).end();
}));

module.exports = router;
