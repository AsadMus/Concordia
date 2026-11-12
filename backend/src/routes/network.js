// TODO - Professional connection mapping (feature ix) -> network.html
// GET / returns graph data for D3 / React Flow / vis-network:
//   { nodes: [{ id, label, role }], edges: [{ from, to, label }] }
// Edges come from: contact_connections (manual "knows through" links)
//   + contacts who share a project (project_collaborators) or booking (booking_performers).
// POST /connections body { contactA, contactB, description } adds a manual link.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.post('/connections', todo('POST /connections'));
router.delete('/connections/:id', todo('DELETE /connections/:id'));

module.exports = router;
