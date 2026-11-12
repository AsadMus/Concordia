// POST /api/auth/signup  - matches the fields on signup.html
// POST /api/auth/login   - login.html accepts email OR phone number
// GET  /api/auth/me      - current user (for "Welcome back, <name>!" on the dashboard)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const publicUser = (u) => ({
  id: u.id, firstName: u.first_name, lastName: u.last_name,
  email: u.email, phone: u.phone, role: u.role,
});

const makeToken = (u) =>
  jwt.sign({ sub: u.id, role: u.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

router.post('/signup', asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, email, password, confirmPassword } = req.body;
  if (!firstName || !lastName || !email || !password)
    throw httpError(400, 'First name, last name, email and password are required');
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  if (confirmPassword !== undefined && password !== confirmPassword)
    throw httpError(400, 'Passwords do not match');

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, phone, email, password_hash)
     VALUES ($1, $2, $3, LOWER($4), $5) RETURNING *`,
    [firstName, lastName, phone || null, email, hash]
  );
  res.status(201).json({ token: makeToken(rows[0]), user: publicUser(rows[0]) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { login, password } = req.body; // login = email or phone
  if (!login || !password) throw httpError(400, 'Email/phone and password are required');

  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = LOWER($1) OR phone = $1', [login.trim()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    throw httpError(401, 'Incorrect email/phone or password');

  res.json({ token: makeToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw httpError(404, 'User not found');
  res.json(publicUser(rows[0]));
}));

// TODO (backend): PUT /api/auth/me - update artist profile (stage_name, genres, bio) for artist-profile.html
// TODO (backend): PUT /api/auth/password - change password for settings.html

module.exports = router;
