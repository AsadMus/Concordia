// TODO - Booking tracker (feature iv) -> calendar.html, dashboard "Upcoming Events" card
// Tables: bookings, booking_performers.
// GET / supports ?from=&to= date range (for a calendar month) and ?upcoming=true.
// Include performers (contact names) and venue in each result - the dashboard table shows Date / Performer(s) / Venue.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');
const todo = require('./_todo');

const FIELDS = {
    title: 'title',
    venueName: 'venue_name',
    venueCity: 'venue_city',
    venueContactId: 'venue_contact_id',
    startsAt: 'starts_at',
    status: 'status',
    fee: 'fee',
    notes: 'notes',
};

const toJson = (r) => ({
    id: r.id,
    title: r.title,
    venueName: r.venue_name,
    venueCity: r.venue_city,
    venueContactId: r.venue_contact_id,
    startsAt: r.starts_at,
    status: r.status,
    fee: r.fee != null ? Number(r.fee) : 0,
    notes: r.notes,
    performers: r.performers || [],
    createdAt: r.created_at,
});

const SELECT_WITH_PERFORMERS = `
SELECT b.*,
COALESCE(b.venue_name, vc.name) AS venue_name,
    COALESCE(
        json_agg(json_build_object('contactId', c.id, 'name', c.name, 'stageName', c.stage_name) ORDER BY c.name)
        FILTER (WHERE c.id IS NOT NULL), '[]') AS performers
FROM bookings b
LEFT JOIN contacts vc ON vc.id = b.venue_contact_id
LEFT JOIN booking_performers bp ON bp.booking_id = b.id
LEFT JOIN contacts c ON c.id = bp.contact_id
`;

router.get('/', asyncHandler(async (req, res) => {
    const { from, to, upcoming, status } = req.query;
    const where = ['b.user_id = $1'];
    const params = [req.user.id];
    
    if (from) {
        params.push(from);
        where.push(`b.starts_at >= $${params.length}`);
    }

    if (to) {
        params.push(to);
        where.push(`b.starts_at <= $${params.length}`);
    }

    if(upcoming === 'true') {
        where.push("b.starts_at >= NOW() AND b.status <> 'Cancelled'");
    }

    if (status) {
        params.push(status);
        where.push(`b.status = $${params.length}`);
    }

    const { rows } = await db.query(
        `${SELECT_WITH_PERFORMERS} 
        WHERE ${where.join(' AND ')} 
        GROUP BY b.id, vc.name 
        ORDER BY b.starts_at ASC`, 
        params
    );
    res.json(rows.map(toJson));
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
        `${SELECT_WITH_PERFORMERS} 
        WHERE b.id = $1 AND b.user_id = $2
        GROUP BY b.id, vc.name`,
        [req.params.id, req.user.id]
    );
    if (!rows[0]) throw httpError(404, 'Booking not found');
    res.json(toJson(rows[0]));
}));

router.post('/', asyncHandler(async (req, res) => {
    if(!req.body.title) throw httpError(400, 'Title is required');
    if(!req.body.startsAt) throw httpError(400, 'startsAt is required');

    if(req.body.venueContactId) {
        const vc = await db.query(
            `SELECT id 
            FROM contacts 
            WHERE id = $1 AND user_id = $2`, 
            [req.body.venueContactId, req.user.id]
        );
        if(!vc.rows[0]) throw httpError(400, 'Venue contact not found or does not belong to user');
    }

    const cols = ['user_id'];
    const vals = [req.user.id];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            cols.push(col);
            vals.push(req.body[field] === '' ? null : req.body[field]);
        }

    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
        `INSERT INTO bookings (${cols.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING id`, 
        vals
    );

    const full = await db.query(
        `${SELECT_WITH_PERFORMERS} 
        WHERE b.id = $1 AND b.user_id = $2 
        GROUP BY b.id, vc.name`,
        [rows[0].id, req.user.id]
    );
    res.status(201).json(toJson(full.rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
    if (req.body.venueContactId) {
        const vc = await db.query(
            `SELECT id 
            FROM contacts 
            WHERE id = $1 AND user_id = $2`,
            [req.body.venueContactId, req.user.id]
        );
        if (!vc.rows[0]) throw httpError(404, 'Venue contact not found');
    }

    const sets = [];
    const vals =[];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            vals.push(req.body[field] === '' ? null : req.body[field]);
            sets.push(`${col} = $${vals.length}`);
        }
    }
    if (!sets.length) throw httpError(400, 'Nothing to update');

    vals.push(req.params.id, req.user.id);
    const { rows } = await db.query(
        `UPDATE bookings 
        SET ${sets.join(', ')} 
        WHERE id = $${vals.length - 1} AND user_id = $${vals.length} 
        RETURNING id`, 
        vals
    );
    if (!rows[0]) throw httpError(404, 'Booking not found');

    const full = await db.query(
        `${SELECT_WITH_PERFORMERS} 
        WHERE b.id = $1 AND b.user_id = $2 
        GROUP BY b.id, vc.name`, 
        [req.params.id, req.user.id]
    );
    res.json(toJson(full.rows[0]));
}));

router.delete('/:id', asyncHandler(async (req,res) => {
    const { rowCount } = await db.query(
        `DELETE FROM bookings 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!rowCount) throw httpError(404, 'Booking not found');
    res.status(204).end();
}));

router.post('/:id/performers', asyncHandler(async (req, res) => {
    const { contactId } = req.body;
    if (!contactId) throw httpError(400, 'contactId is required');

    const booking = await db.query(
        `SELECT id FROM bookings 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!booking.rows[0]) throw httpError(404, 'Booking not found');

    const contact = await db.query(
        `SELECT id, name, stage_name 
        FROM contacts 
        WHERE id = $1 AND user_id = $2`, 
        [contactId, req.user.id]
    );
    if (!contact.rows[0]) throw httpError(404, 'Contact not found');

    await db.query(
        `INSERT INTO booking_performers (booking_id, contact_id) 
        VALUES ($1, $2) ON CONFLICT (booking_id, contact_id) 
        DO NOTHING`, 
        [req.params.id, contactId]
    );

    res.status(201).json({ contactId: contact.rows[0].id, name: contact.rows[0].name, stageName: contact.rows[0].stage_name });
}));
router.delete('/:id/performers/:contactId', asyncHandler(async (req, res) => {
    const booking = await db.query(
        `SELECT id FROM bookings 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]);
    if (!booking.rows[0]) throw httpError(404, 'Booking not found');

    const { rowCount } = await db.query(
        `DELETE FROM booking_performers 
        WHERE booking_id = $1 AND contact_id = $2`, 
        [req.params.id, req.params.contactId]
    );
    if (!rowCount) throw httpError(404, 'Performer not found on booking');
    res.status(204).end();
}));

module.exports = router;
