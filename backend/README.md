# ConChordia Backend

Node.js + Express REST API with PostgreSQL. It also serves the HTML pages in the repo root, so the whole app runs from one address: **http://localhost:3000**.

## Setup (one time)

1. Install [Node.js 20+](https://nodejs.org) and [PostgreSQL 16](https://www.postgresql.org/download/) (remember the password you set for the `postgres` user).
2. Create the database:
   ```bash
   psql -U postgres -c "CREATE DATABASE conchordia;"
   ```
3. Install and configure:
   ```bash
   cd backend
   npm install
   cp .env.example .env        # Windows: copy .env.example .env
   ```
   Edit `.env`: put your postgres password in `DATABASE_URL` and change `JWT_SECRET` to any long random string.
4. Create the tables and the demo data:
   ```bash
   npm run db:init     # WARNING: wipes and recreates all tables
   npm run db:seed     # demo login: demo@conchordia.test / password123
   ```
5. Run it: `npm run dev` (restarts automatically when you save), then open http://localhost:3000

## Project layout

```
backend/
  sql/schema.sql          all tables (users, contacts, projects, bookings, follow_ups,
                          interactions, opportunities, transactions, connections)
  src/server.js           app setup + route mounting
  src/middleware/auth.js  JWT check -> req.user.id / req.user.role
  src/middleware/errors.js asyncHandler, httpError, DB error -> JSON
  src/routes/auth.js      DONE  signup / login / me
  src/routes/contacts.js  DONE  full CRUD: the pattern to copy
  src/routes/*.js         TODO  stubs that return 501 until built
js/api.js                 front-end fetch helper (token handling included)
```

## How auth works

`POST /api/auth/login` with `{ "login": "<email or phone>", "password": "..." }` returns `{ token, user }`.
Every other `/api/*` request must send the header `Authorization: Bearer <token>`. `js/api.js` handles this for you.

**Rule for every route:** each query must include `user_id = req.user.id`. That's how one artist can't see another's data (success criterion #6).

## API

| Status | Endpoint | Page |
|---|---|---|
| DONE | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | signup / login |
| DONE | `GET/POST /api/contacts`, `GET/PUT/DELETE /api/contacts/:id` (`?search=&role=&status=`) | contacts.html |
| TODO | `/api/projects` + `/:id/collaborators` | projects.html |
| TODO | `/api/bookings` + `/:id/performers` | calendar.html |
| TODO | `/api/follow-ups`, `/api/interactions` | calendar / contact detail |
| TODO | `/api/opportunities` + `PATCH /:id/stage` | opportunities.html |
| TODO | `/api/transactions` + `GET /summary` | revenue.html |
| TODO | `/api/network` | network.html |
| TODO | `/api/dashboard` | dashboard.html |
| TODO | `/api/admin/users` | admin |

Each stub file has comments at the top describing exactly what it should return.

## Quick test without the front end

Use Thunder Client / Postman, or:
```bash
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"login":"demo@conchordia.test","password":"password123"}'
```
