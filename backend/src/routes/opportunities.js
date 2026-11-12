// TODO - Opportunity pipeline (feature v) -> opportunities.html
// Table: opportunities. Stages: Just Found -> Applied -> Under Review -> Accepted/Booked/Rejected.
// PATCH /:id/stage body { stage } moves a card between columns.
// Stretch: when stage becomes 'Booked' and type is 'gig', offer to create a booking automatically.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.get('/:id', todo('GET /:id'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.patch('/:id/stage', todo('PATCH /:id/stage'));
router.delete('/:id', todo('DELETE /:id'));

module.exports = router;
