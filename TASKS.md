# ConChordia – Remaining Work

The foundation is done: database schema, server, login/signup API, and **Contacts** as a fully working example.
Everything below is open. Put your name next to a task when you take it.

Backend devs: copy the pattern in `backend/src/routes/contacts.js`. Every query filters by `user_id = req.user.id`.
Frontend devs: load `<script src="js/api.js"></script>` and call `api.get('/contacts')`, `api.post(...)`, etc.

---

## Backend A: Projects, Bookings, Dashboard
- [ ] `routes/projects.js`: CRUD + add/remove collaborators (check the contact belongs to the user)
- [ ] `routes/bookings.js`: CRUD, `?from=&to=` / `?upcoming=true`, performers
- [ ] `routes/followUps.js`: CRUD + `PATCH /:id/complete`, include contact name + role
- [ ] `routes/dashboard.js`: one endpoint that fills all 4 dashboard cards
- [ ] Profile update `PUT /api/auth/me` (stage name, genres, bio) for artist-profile.html

## Backend B: Opportunities, Revenue, Network, Admin
- [ ] `routes/opportunities.js`: CRUD + `PATCH /:id/stage` for the pipeline
- [ ] `routes/transactions.js`: CRUD + `GET /summary` (income, expenses, profit, outstanding, soonest balance due)
- [ ] `routes/interactions.js`: meeting notes / communication history per contact
- [ ] `routes/network.js`: `{ nodes, edges }` graph built from connections + shared projects/bookings
- [ ] `routes/admin.js`: list users, change role, delete user
- [ ] Unit tests for the revenue summary math (proposal 6g), e.g. with Jest + Supertest

## Frontend
- [ ] Wire `login.html` and `signup.html` forms to `api.login()` / `api.signup()`, show errors, redirect to dashboard
- [ ] `dashboard.html`: replace hard-coded rows with data from `GET /api/dashboard`, real user name, logout button
- [ ] Build missing pages linked in the sidebar: `artist-profile.html`, `contacts.html`, `projects.html`,
      `calendar.html`, `opportunities.html`, `revenue.html`, `network.html`, `settings.html`
- [ ] `contacts.html` first, since its API already works and the page can be built and tested today
- [ ] Network diagram (vis-network or D3 via CDN) using `GET /api/network`
- [ ] Add the missing `images/logo.png` (pages reference it but it's not in the repo)
- [ ] Mobile/responsive check on every page

## Shared / later
- [ ] Integration tests for key flows (add contact, track booking, move opportunity stage)
- [ ] Deployment (e.g. Render / Railway with their managed Postgres) by Nov 30
- [ ] User/developer documentation
