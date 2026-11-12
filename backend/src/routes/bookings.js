// TODO - Booking tracker (feature iv) -> calendar.html, dashboard "Upcoming Events" card
// Tables: bookings, booking_performers.
// GET / supports ?from=&to= date range (for a calendar month) and ?upcoming=true.
// Include performers (contact names) and venue in each result - the dashboard table shows Date / Performer(s) / Venue.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

router.get('/', todo('GET /'));
router.get('/:id', todo('GET /:id'));
router.post('/', todo('POST /'));
router.put('/:id', todo('PUT /:id'));
router.delete('/:id', todo('DELETE /:id'));
router.post('/:id/performers', todo('POST /:id/performers'));
router.delete('/:id/performers/:contactId', todo('DELETE /:id/performers/:contactId'));

module.exports = router;
