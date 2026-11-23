// ===================================================================
// OPPORTUNITIES - Opportunity pipeline (feature v) -> opportunities.html
// GET    /api/opportunities?stage=&type=  list cards
// GET    /api/opportunities/:id           one opportunity
// POST   /api/opportunities               create opportunity
// PUT    /api/opportunities/:id           update opportunity
// PATCH  /api/opportunities/:id/stage     move card between stages
// DELETE /api/opportunities/:id           delete opportunity
// ===================================================================
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

const VALID_STAGES = [
  'Just Found',
  'Applied',
  'Under Review',
  'Accepted',
  'Booked',
  'Rejected',
];

const FIELDS = {
  title: 'title',
  type: 'type',
  source: 'source',
  stage: 'stage',
  deadline: 'deadline',
  contactId: 'contact_id',
  notes: 'notes',
  estimatedValue: 'estimated_value',
  organization: 'organization',
  opportunityLink: 'opportunity_link',
};

const toJson = (r) => ({
  id: r.id,
  title: r.title,
  type: r.type,
  source: r.source,
  stage: r.stage,
  deadline: r.deadline,
  contactId: r.contact_id,
  contactName: r.contact_name,
  contactStageName: r.contact_stage_name,
  notes: r.notes,
  createdAt: r.created_at,
  estimatedValue: r.estimated_value,
  organization: r.organization,
  opportunityLink: r.opportunity_link,
});

const SELECT_WITH_CONTACT = `
SELECT o.*,
  c.name AS contact_name,
  c.stage_name AS contact_stage_name
FROM opportunities o
LEFT JOIN contacts c ON c.id = o.contact_id
`;

async function verifyContactOwner(userId, contactId) {
  if (!contactId) return;
  const res = await db.query(
    'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
    [contactId, userId]
  );
  if (!res.rows.at(0)) {
    throw httpError(400, 'Linked contact not found');
  }
}

// GET /api/opportunities?stage=&type=
router.get('/', asyncHandler(async (req, res) => {
  const { stage, type } = req.query;
  const where = ['o.user_id = $1'];
  const params = [req.user.id];

  if (stage) {
    params.push(stage);
    where.push(`o.stage = $${params.length}`);
  }

  if (type) {
    params.push(type);
    where.push(`o.type = $${params.length}`);
  }

  const { rows } = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE ${where.join(' AND ')}
     ORDER BY o.deadline ASC NULLS LAST, o.created_at DESC`,
    params
  );
  res.json(rows.map(toJson));
}));

// GET /api/opportunities/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const resOpp = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE o.id = $1 AND o.user_id = $2`,
    [req.params.id, req.user.id]
  );
  const row = resOpp.rows.at(0);
  if (!row) throw httpError(404, 'Opportunity not found');
  res.json(toJson(row));
}));

// POST /api/opportunities
router.post('/', asyncHandler(async (req, res) => {
  if (!req.body.title || !String(req.body.title).trim()) {
    throw httpError(400, 'Title is required');
  }
  if (req.body.stage !== undefined && !VALID_STAGES.includes(req.body.stage)) {
    throw httpError(400, `stage must be one of: ${VALID_STAGES.join(', ')}`);
  }

  await verifyContactOwner(req.user.id, req.body.contactId);

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
    `INSERT INTO opportunities (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    vals
  );

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE o.id = $1 AND o.user_id = $2`,
    [inserted.rows.at(0).id, req.user.id]
  );
  res.status(201).json(toJson(full.rows.at(0)));
}));

// PUT /api/opportunities/:id
router.put('/:id', asyncHandler(async (req, res) => {
  if (req.body.stage !== undefined && !VALID_STAGES.includes(req.body.stage)) {
    throw httpError(400, `stage must be one of: ${VALID_STAGES.join(', ')}`);
  }
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
    `UPDATE opportunities
     SET ${sets.join(', ')}
     WHERE id = $${vals.length - 1} AND user_id = $${vals.length}
     RETURNING id`,
    vals
  );
  if (!updated.rows.at(0)) throw httpError(404, 'Opportunity not found');

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE o.id = $1 AND o.user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json(toJson(full.rows.at(0)));
}));

// PATCH /api/opportunities/:id/stage -> body { stage }
router.patch('/:id/stage', asyncHandler(async (req, res) => {
  const { stage } = req.body;
  if (!stage || !VALID_STAGES.includes(stage)) {
    throw httpError(400, `stage must be one of: ${VALID_STAGES.join(', ')}`);
  }

  const updated = await db.query(
    `UPDATE opportunities
     SET stage = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id`,
    [stage, req.params.id, req.user.id]
  );
  if (!updated.rows.at(0)) throw httpError(404, 'Opportunity not found');

  const full = await db.query(
    `${SELECT_WITH_CONTACT}
     WHERE o.id = $1 AND o.user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json(toJson(full.rows.at(0)));
}));

// DELETE /api/opportunities/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM opportunities WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw httpError(404, 'Opportunity not found');
  res.status(204).end();
}));

module.exports = router;
