// TODO - Revenue tracking (feature viii) -> revenue.html, dashboard "Revenue" card
// Table: transactions (kind = income | expense, paid = false means outstanding balance).
// GET /summary returns { income, expenses, profit, outstanding, soonestBalanceDue: { amount, dueDate } }
//   - do the math in SQL (SUM ... FILTER (WHERE ...)) and unit test it; the proposal calls out financial calcs for testing.
// NOTE: define /summary BEFORE /:id or Express will treat 'summary' as an id.
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

const FIELDS = {
    kind: 'kind',
    amount: 'amount',
    description: 'description',
    bookingId: 'booking_id',
    projectId: 'project_id',
    contactId: 'contact_id',
    dueDate: 'due_date',
    paid: 'paid',
    category: 'category',
    date: 'transaction_date',
    method: 'payment_method',
    notes: 'notes',
    status: 'payment_status',
};

const toJson = (r) => ({
    id: r.id,
    kind: r.kind,
    type: r.kind === 'income' ? 'Income' : 'Expense',
    amount: Number(r.amount),
    description: r.description,
    bookingId: r.booking_id,
    projectId: r.project_id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    dueDate: r.due_date,
    paid: r.paid,
    category: r.category,
    date: r.transaction_date,
    method: r.payment_method,
    notes: r.notes,
    status: r.payment_status || (r.paid ? 'Paid' : 'Pending'),
});

const SELECT_WITH_LINKS = 
    `SELECT t.*, 
    b.title AS booking_title,
     p.title AS project_title, 
     c.name AS contact_name 
     FROM transactions t 
     LEFT JOIN bookings b ON t.booking_id = b.id 
     LEFT JOIN projects p ON t.project_id = p.id 
     LEFT JOIN contacts c ON t.contact_id = c.id`
     ;

async function verifyOwnedLinks(userId, { bookingId, projectId, contactId }) {
    if (bookingId) {
        const b = await db.query(
            'SELECT id FROM bookings WHERE id = $1 AND user_id = $2', [bookingId, userId]);
        if (!b.rows[0]) throw httpError(400, 'Linked booking not found');
    }
    if (projectId) {
        const p = await db.query(
            'SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (!p.rows[0]) throw httpError(400, 'Linked project not found');
    }
    if (contactId) {
        const c = await db.query(
            'SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [contactId, userId]);
        if (!c.rows[0]) throw httpError(400, 'Linked contact not found');
    }
}
router.get('/summary', asyncHandler(async (req, res) => {
    const totalsQuery = db.query(
        `SELECT
            COALESCE(SUM(amount) FILTER (
                WHERE kind = 'income' AND paid = TRUE
            ), 0) AS income,

            COALESCE(SUM(amount) FILTER (
                WHERE kind = 'expense' AND paid = TRUE
            ), 0) AS expenses,

            COALESCE(SUM(amount) FILTER (
                WHERE kind = 'income'
                AND paid = FALSE
                AND COALESCE(payment_status, 'Pending') IN ('Pending', 'Overdue')
            ), 0) AS outstanding

        FROM transactions
        WHERE user_id = $1`,
        [req.user.id]
    );

    const soonestQuery = db.query(
        `SELECT amount, transaction_date AS due_date
        FROM transactions
        WHERE user_id = $1
        AND kind = 'expense'
        AND paid = FALSE
        AND COALESCE(payment_status, 'Pending') IN ('Pending', 'Overdue')
        ORDER BY transaction_date ASC NULLS LAST, created_at ASC
        LIMIT 1`,
        [req.user.id]
    );

    const [totalsRes, soonestRes] = await Promise.all([totalsQuery, soonestQuery]);
    const income = Number(totalsRes.rows[0].income);
    const expenses = Number(totalsRes.rows[0].expenses);
    const outstanding = Number(totalsRes.rows[0].outstanding);
    const soonestRow = soonestRes.rows[0];

    res.json({
        income,
        expenses,
        profit: Number((income - expenses).toFixed(2)),
        outstanding,
        soonestBalanceDue: soonestRow  ? { amount: Number(soonestRow.amount), dueDate: soonestRow.due_date } : null,
    });
}));

router.get('/', asyncHandler(async (req, res) => {
    const { kind, paid } = req.query;
    const where = ['t.user_id = $1'];
    const params = [req.user.id];

    if (kind) {
        params.push(kind);
        where.push(`t.kind = $${params.length}`);
    }
    if (paid !== undefined && paid !== '') {
        params.push(paid === 'true');
        where.push(`t.paid = $${params.length}`);
    }

    const { rows } = await db.query(
        `${SELECT_WITH_LINKS} 
        WHERE ${where.join(' AND ')} 
        ORDER BY t.created_at DESC`,
        params
    );
    res.json(rows.map(toJson));
}));

router.post('/', asyncHandler(async (req, res) => {
   if (!req.body.kind || !['income', 'expense'].includes(req.body.kind)) {
    throw httpError(400, "kind is must be 'income' or 'expense'");
    }
    if (req.body.amount == undefined || Number(req.body.amount) < 0) {
        throw httpError(400, 'amount is must be non-negative');
    }

    await verifyOwnedLinks(req.user.id, req.body);
    if (req.body.status !== undefined) {
        if (!['Paid', 'Pending', 'Overdue', 'Cancelled'].includes(req.body.status)) {
            throw httpError(400, 'Invalid payment status');
        }
        req.body.paid = req.body.status === 'Paid';
    }

    const  cols = ['user_id'];
    const vals = [req.user.id];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            cols.push(col);
            vals.push(req.body[field] === '' ? null : req.body[field]);
        }
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
        `INSERT INTO transactions (${cols.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING id`, 
        vals
    );

    const full = await db.query(
        `${SELECT_WITH_LINKS} 
        WHERE t.id = $1 AND t.user_id = $2`, 
        [rows[0].id, req.user.id]
    );
    res.status(201).json(toJson(full.rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
    await verifyOwnedLinks(req.user.id, req.body);
    if (req.body.status !== undefined) {
        if (!['Paid', 'Pending', 'Overdue', 'Cancelled'].includes(req.body.status)) {
            throw httpError(400, 'Invalid payment status');
        }
        req.body.paid = req.body.status === 'Paid';
    }

    const sets = [];
    const vals = [];
    for (const [field, col] of Object.entries(FIELDS)) {
        if (req.body[field] !== undefined) {
            vals.push(req.body[field] === '' ? null : req.body[field]);
            sets.push(`${col} = $${vals.length}`);
        }
    }
    if (sets.length === 0) throw httpError(400, 'Nothing to update');

    vals.push(req.params.id, req.user.id);
    const { rows } = await db.query(
        `UPDATE transactions SET ${sets.join(', ')} 
        WHERE id = $${vals.length - 1} AND user_id = $${vals.length} 
        RETURNING id`,
        vals
    );
    if (!rows[0]) throw httpError(404, 'Transaction not found');

    const full = await db.query(
        `${SELECT_WITH_LINKS} 
        WHERE t.id = $1 AND t.user_id = $2`, 
        [req.params.id, req.user.id]
    );
    res.json(toJson(full.rows[0]));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM transactions 
        WHERE id = $1 AND user_id = $2`, 
        [req.params.id, req.user.id]
    );
    if (!rowCount) throw httpError(404, 'Transaction not found');
    res.status(204).end();
}));

module.exports = router;
