// POST /api/auth/signup   - matches the fields on signup.html
// POST /api/auth/login    - login.html accepts email OR phone number
// GET  /api/auth/me       - current user (dashboard welcome message, artist-profile.html)
// PUT  /api/auth/me       - update account/artist profile (artist-profile.html)
// PUT  /api/auth/password - change password (needs the current password)
// POST /api/auth/forgot-password - start a password reset (forgot-password.html)
// POST /api/auth/reset-password  - finish it with the token from the link (reset-password.html)
const crypto = require('crypto');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');

const SALT_ROUNDS = 10;
const MIN_PASSWORD = 8;
const SOCIAL_KEYS = ['instagram', 'tiktok', 'youtube', 'spotify'];
const ACCOUNT_TYPES = ['artist', 'manager'];
const RESET_MINUTES = 30;

// ---------- helpers ----------

const publicUser = (u) => ({
  id: u.id, firstName: u.first_name, lastName: u.last_name,
  email: u.email, phone: u.phone, role: u.role, accountType: u.account_type,
  stageName: u.stage_name, genres: u.genres || [], bio: u.bio,
  location: u.location, socials: u.socials || {},
});

const makeToken = (u) =>
  jwt.sign({ sub: u.id, role: u.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// "(909) 555-0100" and "909-555-0100" are both stored as "9095550100",
// so a user can log in with their phone typed any way.
const normalizePhone = (p) => (p ? String(p).replace(/[^\d+]/g, '') : '') || null;

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Empty string -> null, otherwise trimmed text.
const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function checkNewPassword(password, confirmPassword) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD)
    throw httpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  if (confirmPassword !== undefined && password !== confirmPassword)
    throw httpError(400, 'Passwords do not match');
}

// ---------- signup / login ----------

router.post('/signup', asyncHandler(async (req, res) => {
  const { password, confirmPassword, accountType } = req.body;
  const firstName = clean(req.body.firstName);
  const lastName = clean(req.body.lastName);
  const email = clean(req.body.email);
  const phone = normalizePhone(req.body.phone);

  if (!firstName || !lastName || !email || !password)
    throw httpError(400, 'First name, last name, email and password are required');
  if (!isEmail(email)) throw httpError(400, 'Please enter a valid email address');
  checkNewPassword(password, confirmPassword);
  if (!ACCOUNT_TYPES.includes(accountType)) throw httpError(400, 'Please select Artist or Manager');

  // Friendlier duplicate message than the generic 409 from the error handler.
  const { rows: taken } = await db.query(
    'SELECT email, phone FROM users WHERE email = LOWER($1) OR phone = $2',
    [email, phone]
  );
  if (taken.length) {
    const field = taken.some((u) => u.email === email.toLowerCase()) ? 'email' : 'phone number';
    throw httpError(409, `An account with that ${field} already exists`);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, phone, email, password_hash, account_type)
     VALUES ($1, $2, $3, LOWER($4), $5, $6) RETURNING *`,
    [firstName, lastName, phone, email, hash, accountType]
  );
  res.status(201).json({ token: makeToken(rows[0]), user: publicUser(rows[0]) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { login, password } = req.body; // login = email or phone
  if (!login || !password) throw httpError(400, 'Email/phone and password are required');

  const value = String(login).trim();
  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = LOWER($1) OR phone = $2',
    [value, normalizePhone(value)]
  );
  const user = rows[0];
  // Same message for "no such user" and "wrong password" so attackers can't tell which.
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    throw httpError(401, 'Incorrect email/phone or password');

  res.json({ token: makeToken(user), user: publicUser(user) });
}));

// ---------- current user ----------

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw httpError(404, 'User not found');
  res.json(publicUser(rows[0]));
}));

// Only the fields that are sent get changed; anything left out keeps its old value.
router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows: found } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const cur = found[0];
  if (!cur) throw httpError(404, 'User not found');
  const b = req.body;
  const has = (k) => b[k] !== undefined;

  const firstName = has('firstName') ? clean(b.firstName) : cur.first_name;
  const lastName = has('lastName') ? clean(b.lastName) : cur.last_name;
  const email = has('email') ? clean(b.email) : cur.email;
  if (!firstName || !lastName) throw httpError(400, 'First and last name are required');
  if (!email || !isEmail(email)) throw httpError(400, 'Please enter a valid email address');

  let genres = cur.genres;
  if (has('genres')) {
    const list = Array.isArray(b.genres) ? b.genres : String(b.genres || '').split(',');
    genres = list.map((g) => String(g).trim()).filter(Boolean);
  }

  // Social links must be real http(s) URLs (blocks things like "javascript:" links).
  let socials = cur.socials || {};
  if (has('socials')) {
    socials = {};
    for (const key of SOCIAL_KEYS) {
      const url = clean(b.socials?.[key]);
      if (!url) continue;
      if (!/^https?:\/\//i.test(url)) throw httpError(400, `${key} must be a link starting with https://`);
      socials[key] = url;
    }
  }

  const { rows } = await db.query(
    `UPDATE users SET first_name = $1, last_name = $2, email = LOWER($3), phone = $4,
       stage_name = $5, genres = $6, bio = $7, location = $8, socials = $9
     WHERE id = $10 RETURNING *`,
    [
      firstName, lastName, email,
      has('phone') ? normalizePhone(b.phone) : cur.phone,
      has('stageName') ? clean(b.stageName) : cur.stage_name,
      genres,
      has('bio') ? clean(b.bio) : cur.bio,
      has('location') ? clean(b.location) : cur.location,
      socials,
      req.user.id,
    ]
  ); // a duplicate email/phone hits the UNIQUE constraint -> 409 from errorHandler
  res.json(publicUser(rows[0]));
}));

router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) throw httpError(400, 'Current and new password are required');
  checkNewPassword(newPassword, confirmPassword);

  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw httpError(404, 'User not found');
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash)))
    throw httpError(400, 'Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ ok: true });
}));

// ---------- forgot / reset password ----------

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = clean(req.body.email);
  if (!email || !isEmail(email)) throw httpError(400, 'Please enter a valid email address');

  // Always the same answer, so nobody can use this form to find out who has an account.
  const reply = { message: 'If an account exists for that email, a reset link has been sent.' };

  const { rows } = await db.query('SELECT id, email FROM users WHERE email = LOWER($1)', [email]);
  const user = rows[0];
  if (!user) return res.json(reply);

  // Random, unguessable token. The user gets the token; the database only keeps its hash.
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]); // old links stop working
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${RESET_MINUTES} minutes')`,
    [user.id, sha256(token)]
  );

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.headers.host}`;
  const link = `${appUrl}/reset-password.html?token=${token}`;
  // TODO: send this by email once the team picks an email service (e.g. Nodemailer + Gmail).
  console.log(`[password reset] ${user.email}: ${link}`);

  if (process.env.SHOW_RESET_LINK === 'true') reply.devResetLink = link;
  res.json(reply);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;
  if (!token) throw httpError(400, 'This reset link is invalid');
  checkNewPassword(newPassword, confirmPassword);

  const { rows } = await db.query(
    'SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > NOW()',
    [sha256(String(token))]
  );
  if (!rows[0]) throw httpError(400, 'This reset link is invalid or has expired. Please request a new one.');

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
  await db.query('DELETE FROM password_resets WHERE user_id = $1', [rows[0].user_id]); // link is single-use
  res.json({ ok: true });
}));

module.exports = router;
