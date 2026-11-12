// Adds a demo account with sample data that matches the placeholder rows in dashboard.html.
// Login: demo@conchordia.test / password123
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');

(async () => {
  const q = (t, p) => pool.query(t, p).then((r) => r.rows);
  const hash = await bcrypt.hash('password123', 10);
  const [user] = await q(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash, stage_name)
     VALUES ('Demo', 'User', 'demo@conchordia.test', '9095550100', $1, 'Demo') RETURNING id`, [hash]);
  const u = user.id;

  const contact = async (name, role, status) =>
    (await q(`INSERT INTO contacts (user_id, name, role, relationship_status) VALUES ($1,$2,$3,$4) RETURNING id`,
      [u, name, role, status]))[0].id;
  const kosmo = await contact('Kosmo', 'Producer', 'Frequent Collaborator');
  const kehlani = await contact('Kehlani', 'R&B Artist', 'Warm Lead');
  const leon = await contact('Leon Thomas', 'R&B Artist', 'New Contact');
  const art = await contact('Art the Clown', 'Artist', 'Active Partner');
  const lyssa = await contact('LyssaKay', 'Artist', 'Active Partner');
  await q(`INSERT INTO contact_connections (user_id, contact_a, contact_b, description) VALUES ($1,$2,$3,'introduced me to')`, [u, kosmo, leon]);

  const [falling] = await q(`INSERT INTO projects (user_id, title, type, status) VALUES ($1,'Falling','Song','In Progress') RETURNING id`, [u]);
  await q(`INSERT INTO project_collaborators VALUES ($1,$2,'ft.')`, [falling.id, kosmo]);
  await q(`INSERT INTO projects (user_id, title, type, status) VALUES ($1,'Nevermind','Album','Not Started')`, [u]);

  const booking = async (title, venue, city, when, performer, fee) => {
    const [b] = await q(`INSERT INTO bookings (user_id, title, venue_name, venue_city, starts_at, status, fee)
                         VALUES ($1,$2,$3,$4,$5,'Confirmed',$6) RETURNING id`, [u, title, venue, city, when, fee]);
    await q('INSERT INTO booking_performers VALUES ($1,$2)', [b.id, performer]);
    return b.id;
  };
  const b1 = await booking('Halloween Show', 'Universal Studios', 'Hollywood, CA', '2026-10-31T19:00:00-07:00', art, 1500);
  await booking('New Year Show', 'Glen Helen Amphitheater', 'San Bernardino, CA', '2026-12-30T19:00:00-08:00', lyssa, 2000);

  await q(`INSERT INTO follow_ups (user_id, contact_id, due_date, reason) VALUES ($1,$2,'2026-10-15','Feature request'), ($1,$3,'2026-10-15','Studio session')`, [u, kehlani, leon]);
  await q(`INSERT INTO opportunities (user_id, title, type, stage, deadline) VALUES ($1,'Spotify editorial playlist','playlist','Just Found','2026-12-01')`, [u]);
  await q(`INSERT INTO transactions (user_id, kind, amount, description, booking_id) VALUES ($1,'income',3000,'Halloween show fee',$2)`, [u, b1]);
  await q(`INSERT INTO transactions (user_id, kind, amount, description) VALUES ($1,'expense',550,'Studio time')`, [u]);
  await q(`INSERT INTO transactions (user_id, kind, amount, description, due_date, paid) VALUES ($1,'expense',500,'Mixing balance','2026-12-01',false)`, [u]);

  console.log('Seeded demo account: demo@conchordia.test / password123');
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
