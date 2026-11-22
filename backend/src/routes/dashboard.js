// ===================================================================
// DASHBOARD - Summary endpoint -> dashboard.html
// GET /api/dashboard -> fills all four dashboard cards in one request
// ===================================================================
const router = require('express').Router();
const db = require('../db/pool');
const { asyncHandler, httpError } = require('../middleware/errors');

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const userQuery = db.query(
    'SELECT first_name FROM users WHERE id = $1',
    [userId]
  );

  const upcomingEventsQuery = db.query(
    `SELECT b.id, b.title,
       COALESCE(b.venue_name, vc.name) AS venue_name,
       b.venue_city, b.starts_at, b.status, b.fee,
       COALESCE(
         json_agg(
           json_build_object('contactId', c.id, 'name', c.name, 'stageName', c.stage_name)
           ORDER BY c.name
         ) FILTER (WHERE c.id IS NOT NULL),
         '[]'
       ) AS performers
     FROM bookings b
     LEFT JOIN contacts vc ON vc.id = b.venue_contact_id
     LEFT JOIN booking_performers bp ON bp.booking_id = b.id
     LEFT JOIN contacts c ON c.id = bp.contact_id
     WHERE b.user_id = $1
       AND b.starts_at >= NOW()
       AND b.status != 'Cancelled'
     GROUP BY b.id, vc.name
     ORDER BY b.starts_at ASC
     LIMIT 5`,
    [userId]
  );

  const projectsQuery = db.query(
    `SELECT p.id, p.title, p.type, p.status, p.deadline, p.created_at,
       COALESCE(
         json_agg(
           json_build_object('contactId', c.id, 'name', c.name, 'stageName', c.stage_name, 'credit', pc.credit)
           ORDER BY c.name
         ) FILTER (WHERE c.id IS NOT NULL),
         '[]'
       ) AS collaborators
     FROM projects p
     LEFT JOIN project_collaborators pc ON pc.project_id = p.id
     LEFT JOIN contacts c ON c.id = pc.contact_id
     WHERE p.user_id = $1
       AND p.status != 'Completed'
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT 5`,
    [userId]
  );

  const followUpsQuery = db.query(
    `SELECT f.id, f.contact_id, c.name AS contact_name, c.stage_name AS contact_stage_name,
       f.due_date, f.reason, f.completed
     FROM follow_ups f
     JOIN contacts c ON c.id = f.contact_id
     WHERE f.user_id = $1
       AND f.completed = FALSE
     ORDER BY f.due_date ASC, f.id ASC
     LIMIT 5`,
    [userId]
  );

  const totalsQuery = db.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
       COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expenses
     FROM transactions
     WHERE user_id = $1`,
    [userId]
  );

  const soonestDueQuery = db.query(
    `SELECT amount, due_date
     FROM transactions
     WHERE user_id = $1
       AND kind = 'income'
       AND paid = FALSE
     ORDER BY due_date ASC NULLS LAST, created_at ASC
     LIMIT 1`,
    [userId]
  );

  const [userRes, eventsRes, projectsRes, followUpsRes, totalsRes, soonestRes] =
    await Promise.all([
      userQuery,
      upcomingEventsQuery,
      projectsQuery,
      followUpsQuery,
      totalsQuery,
      soonestDueQuery,
    ]);

  const userRow = userRes.rows.at(0);
  if (!userRow) throw httpError(404, 'User not found');

  const totalsRow = totalsRes.rows.at(0);
  const income = Number(totalsRow.income);
  const expenses = Number(totalsRow.expenses);
  const soonestRow = soonestRes.rows.at(0);

  res.json({
    user: {
      firstName: userRow.first_name,
    },
    upcomingEvents: eventsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      venueName: r.venue_name,
      venueCity: r.venue_city,
      startsAt: r.starts_at,
      status: r.status,
      fee: r.fee != null ? Number(r.fee) : 0,
      performers: r.performers || [],
    })),
    projects: projectsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      deadline: r.deadline,
      collaborators: r.collaborators || [],
      createdAt: r.created_at,
    })),
    followUps: followUpsRes.rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactStageName: r.contact_stage_name,
      dueDate: r.due_date,
      reason: r.reason,
      completed: r.completed,
    })),
    revenue: {
      profit: Number((income - expenses).toFixed(2)),
      soonestBalanceDue: soonestRow
        ? { amount: Number(soonestRow.amount), dueDate: soonestRow.due_date }
        : null,
    },
  });
}));

module.exports = router;
