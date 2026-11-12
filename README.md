# ConChordia

A CRM for musicians and music professionals (CSE 4050 Web Application Development group project, Fall 2026).

```
frontend/   HTML, CSS and js/api.js (the pages people see)
backend/    Node.js + Express API and PostgreSQL database
```

The backend serves the frontend, so the whole app runs at **http://localhost:3000**.

---

## Run it on your computer (first time, ~15 min)

### 1. Install these
- **Node.js** (LTS version): https://nodejs.org
- **PostgreSQL 16**: https://www.postgresql.org/download/
  During install, set a password for the `postgres` user and **write it down**. Keep the default port (5432).
- **Git** and **VS Code** if you don't have them.

### 2. Get the code
In VS Code: `Ctrl+Shift+P` → **Git: Clone** → paste `https://github.com/AsadMus/Concordia` → pick a folder → **Open**.

### 3. Create the database
Open **pgAdmin** (installed with PostgreSQL), log in with your postgres password,
right-click **Databases → Create → Database...**, name it `conchordia`, Save.

### 4. Configure and install
In VS Code open a terminal (`Ctrl+``) and run:
```bash
cd backend
npm install
copy .env.example .env       # Mac/Linux: cp .env.example .env
```
Open `backend/.env` and replace the **second** `postgres` in `DATABASE_URL` with your postgres password:
```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/conchordia
```

### 5. Create the tables and demo data
```bash
npm run db:init
npm run db:seed
```

### 6. Start it
```bash
npm run dev
```
Open **http://localhost:3000**. Demo login: `demo@conchordia.test` / `password123`.
`npm run dev` restarts the server whenever you save a file. Stop it with `Ctrl+C`.

---

## Every time after that
```bash
git pull
cd backend
npm install          # only needed if package.json changed
npm run db:init      # only if sql/schema.sql changed (this wipes your local data)
npm run db:seed
npm run dev
```

## Git workflow
1. `git pull` before you start.
2. Make a branch for your task: `git checkout -b contacts-page`
3. Commit, push, and open a Pull Request on GitHub. Someone else reviews, then merge.
4. Never commit `.env` (it's already in `.gitignore`).

## Troubleshooting
| Problem | Fix |
|---|---|
| `password authentication failed` | Wrong password in `backend/.env` |
| `database "conchordia" does not exist` | Do step 3 |
| `ECONNREFUSED 5432` | PostgreSQL isn't running: open Windows Services, start `postgresql-x64-16` |
| `EADDRINUSE 3000` | The server is already running in another terminal |
| `npm` not recognized | Restart VS Code after installing Node.js |
| Page says "Not implemented yet" | That API route is still a TODO |

## Optional: one shared database
Each person has their own local database by default, and `schema.sql` in git keeps the table structure the same for everyone.
If the team wants to share the same data, one person creates a free hosted Postgres (Neon, Supabase, or Azure Database for PostgreSQL)
and shares its connection string. Everyone puts it in `DATABASE_URL` and skips steps 3 and 5. Only one person runs `db:init`, because it wipes the shared data.
We'll need a hosted database for deployment anyway.

More backend details (API list, auth, code pattern): [backend/README.md](backend/README.md)
