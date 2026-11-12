// TODO - Dashboard summary -> dashboard.html (one request fills all four cards)
// GET / returns {
//   user: { firstName },
//   upcomingEvents: next 5 bookings,
//   projects: 5 most recent active projects,
//   followUps: next 5 incomplete follow-ups,
//   revenue: { profit, soonestBalanceDue }
// }  Reuse the queries written for bookings / projects / followUps / transactions.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));

module.exports = router;
