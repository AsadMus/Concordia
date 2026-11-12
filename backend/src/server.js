// ConChordia API server.
// - Serves the existing HTML/CSS pages from the repo root (so login.html, dashboard.html work at http://localhost:3000)
// - Exposes the REST API under /api
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Public routes ----------
app.use('/api/auth', require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- Protected routes (must be logged in) ----------
app.use('/api', requireAuth);
app.use('/api/contacts', require('./routes/contacts'));            // DONE - use as the pattern
app.use('/api/projects', require('./routes/projects'));            // TODO
app.use('/api/bookings', require('./routes/bookings'));            // TODO
app.use('/api/follow-ups', require('./routes/followUps'));         // TODO
app.use('/api/interactions', require('./routes/interactions'));    // TODO
app.use('/api/opportunities', require('./routes/opportunities'));  // TODO
app.use('/api/transactions', require('./routes/transactions'));    // TODO
app.use('/api/network', require('./routes/network'));              // TODO
app.use('/api/dashboard', require('./routes/dashboard'));          // TODO
app.use('/api/admin', require('./routes/admin'));                  // TODO

app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route' }));
app.use(errorHandler);

// ---------- Front end ----------
const frontendDir = path.join(__dirname, '../../frontend');
app.use(express.static(frontendDir, { index: 'login.html' }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`ConChordia running at http://localhost:${PORT}`));
}
module.exports = app;
