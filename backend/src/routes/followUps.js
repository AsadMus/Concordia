// TODO - Follow-up reminders (feature vi) -> dashboard "Follow-Ups" card, calendar.html
// Table: follow_ups. GET / supports ?completed=false and returns contact name + role (dashboard shows Contact / Role / Follow-Up Date).
// PATCH /:id/complete marks one done.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.patch('/:id/complete', todo('PATCH /:id/complete'));
router.delete('/:id', todo('DELETE /:id'));

module.exports = router;
