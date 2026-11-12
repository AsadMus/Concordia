// TODO - Communication history / meeting notes (feature vi) -> shown on a contact's detail page
// Table: interactions. GET / should support ?contactId= to show one contact's history, newest first.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.delete('/:id', todo('DELETE /:id'));

module.exports = router;
