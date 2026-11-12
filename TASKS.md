# ConChordia: Task Breakdown

**Already done (foundation):** database schema for every feature, Express server, signup/login/logout API with JWT,
**Contacts** API (full working example), demo seed data, and `frontend/js/api.js` helper.

Put your name next to your role. Work on your own branch and open a Pull Request when a task works.
Due dates follow the proposal timeline: integration and testing by **Nov 22**, deployment by **Nov 30**.

---

## Frontend: ____________

Use `<script src="js/api.js"></script>` then e.g. `const contacts = await api.get('/contacts');`

**Week 1 (APIs already exist for these)**
- [ ] `login.html`: on submit call `api.login(emailOrPhone, password)`, show the error message if it fails, redirect to `dashboard.html`
- [ ] `signup.html`: call `api.signup({ firstName, lastName, phone, email, password, confirmPassword })`, then redirect
- [ ] Add `api.requireLogin()` to the top of every logged-in page and a **Logout** button (`api.logout()`)
- [ ] `dashboard.html`: show the real user name from `api.get('/auth/me')`
- [ ] `contacts.html`: list, search, filter by relationship status, add/edit/delete form
- [ ] Add the missing `frontend/images/logo.png`

**Week 2 (build each page as the matching backend route is finished)**
- [ ] `projects.html` (Backend 1) · `calendar.html` (Backend 1) · `artist-profile.html` (Backend 1)
- [ ] `opportunities.html` as a column/kanban board (Backend 2) · `revenue.html` (Backend 2)
- [ ] `network.html` diagram using vis-network or D3 from a CDN (Backend 2) · `settings.html`
- [ ] Replace hard-coded dashboard rows with `api.get('/dashboard')` (Backend 1)
- [ ] Check every page on a phone-sized screen

---

## Backend 1: ____________ (Projects, Bookings, Follow-ups, Dashboard)

Copy the pattern in `backend/src/routes/contacts.js`. **Every query must filter by `user_id = req.user.id`.**
When a body includes a `contactId`, first check that contact belongs to the user.

- [ ] `routes/projects.js`: CRUD, `?status=` filter, add/remove collaborators, include collaborator names in results
- [ ] `routes/bookings.js`: CRUD, `?from=&to=` and `?upcoming=true`, add/remove performers, include performer names
- [ ] `routes/followUps.js`: CRUD, `PATCH /:id/complete`, include contact name + role
- [ ] `routes/dashboard.js`: one `GET` that returns everything the 4 dashboard cards need (do this last)
- [ ] `PUT /api/auth/me` in `routes/auth.js`: update stage name, genres, bio (artist profile page)
- [ ] Add a few rows to `db/seed.js` for anything new you add

---

## Backend 2: ____________ (Opportunities, Revenue, Notes, Network, Admin, Tests)

Same rules as Backend 1.

- [ ] `routes/opportunities.js`: CRUD and `PATCH /:id/stage` (Just Found → Applied → Under Review → Accepted/Booked/Rejected)
- [ ] `routes/transactions.js`: CRUD and `GET /summary` → `{ income, expenses, profit, outstanding, soonestBalanceDue }`
- [ ] `routes/interactions.js`: meeting notes / communication history, `?contactId=` filter
- [ ] `routes/network.js`: `GET /` → `{ nodes, edges }` from manual connections + shared projects/bookings; add/remove connections
- [ ] `routes/admin.js`: list users (no password hashes), change role, delete user
- [ ] Tests with Jest + Supertest: revenue summary math, and that user A can't read user B's data

---

## Whole team (after Nov 19)
- [ ] Integration testing of key flows: sign up → add contact → add booking → move an opportunity → check revenue
- [ ] Set up one hosted PostgreSQL database and deploy (e.g. Render or Railway)
- [ ] Testing documentation and user/developer docs (deliverables xi and xiii)
