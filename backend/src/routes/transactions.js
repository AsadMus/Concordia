// TODO - Revenue tracking (feature viii) -> revenue.html, dashboard "Revenue" card
// Table: transactions (kind = income | expense, paid = false means outstanding balance).
// GET /summary returns { income, expenses, profit, outstanding, soonestBalanceDue: { amount, dueDate } }
//   - do the math in SQL (SUM ... FILTER (WHERE ...)) and unit test it; the proposal calls out financial calcs for testing.
// NOTE: define /summary BEFORE /:id or Express will treat 'summary' as an id.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/summary', todo('GET /summary'));
router.get('/', todo('GET /'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.delete('/:id', todo('DELETE /:id'));

module.exports = router;
