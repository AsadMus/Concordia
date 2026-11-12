-- ConChordia database schema (PostgreSQL)
-- Every CRM table has a user_id so one artist can never see another's data.
-- Run with: npm run db:init

DROP TABLE IF EXISTS transactions, opportunities, interactions, follow_ups,
  booking_performers, bookings, project_collaborators, projects,
  contact_connections, contacts, users CASCADE;

-- ---------- Accounts (signup.html / login.html) ----------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  phone         VARCHAR(30)  UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  stage_name    VARCHAR(150),            -- artist-profile.html
  genres        TEXT[],
  bio           TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- Contacts + relationship status (features i, vii) ----------
CREATE TABLE contacts (
  id                  SERIAL PRIMARY KEY,
  user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(150) NOT NULL,
  stage_name          VARCHAR(150),
  role                VARCHAR(50),   -- artist, producer, engineer, DJ, promoter, venue, manager...
  genres              TEXT[],
  email               VARCHAR(255),
  phone               VARCHAR(30),
  socials             JSONB DEFAULT '{}',  -- {"instagram": "...", "spotify": "..."}
  location            VARCHAR(150),
  relationship_status VARCHAR(30) NOT NULL DEFAULT 'New Contact'
    CHECK (relationship_status IN ('New Contact', 'Warm Lead', 'Active Partner', 'Frequent Collaborator')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Who I know through whom" edges (feature ix, network.html)
CREATE TABLE contact_connections (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_a   INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b   INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  description VARCHAR(255),            -- "introduced me to", "same label", ...
  CHECK (contact_a <> contact_b)
);

-- ---------- Collaboration tracker (feature iii, projects.html) ----------
CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  type        VARCHAR(30) NOT NULL DEFAULT 'Song',   -- Song, Album, EP, Video, ...
  status      VARCHAR(30) NOT NULL DEFAULT 'Not Started'
    CHECK (status IN ('Not Started', 'In Progress', 'On Hold', 'Completed')),
  deadline    DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_collaborators (
  project_id  INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  credit      VARCHAR(100),           -- "ft.", "producer", "mix engineer"
  PRIMARY KEY (project_id, contact_id)
);

-- ---------- Booking tracker (feature iv, calendar.html "Upcoming Events") ----------
CREATE TABLE bookings (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  venue_name  VARCHAR(200),
  venue_city  VARCHAR(150),
  venue_contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  status      VARCHAR(30) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Inquiry', 'Pending', 'Confirmed', 'Completed', 'Cancelled')),
  fee         NUMERIC(10, 2) DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_performers (
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, contact_id)
);

-- ---------- Communication + follow-ups (feature vi) ----------
CREATE TABLE follow_ups (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  reason      VARCHAR(255),
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE interactions (               -- meeting notes / communication history
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel     VARCHAR(30),              -- email, text, call, DM, in person
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary     TEXT NOT NULL
);

-- ---------- Opportunity pipeline (feature v) ----------
CREATE TABLE opportunities (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  type        VARCHAR(50),              -- gig, sponsorship, feature, playlist, audition...
  source      VARCHAR(200),
  stage       VARCHAR(30) NOT NULL DEFAULT 'Just Found'
    CHECK (stage IN ('Just Found', 'Applied', 'Under Review', 'Accepted', 'Booked', 'Rejected')),
  deadline    DATE,
  contact_id  INT REFERENCES contacts(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Revenue tracking (feature viii) ----------
CREATE TABLE transactions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(10) NOT NULL CHECK (kind IN ('income', 'expense')),
  amount      NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  description VARCHAR(255),
  booking_id  INT REFERENCES bookings(id) ON DELETE SET NULL,
  project_id  INT REFERENCES projects(id) ON DELETE SET NULL,
  contact_id  INT REFERENCES contacts(id) ON DELETE SET NULL,
  due_date    DATE,                     -- for outstanding balances
  paid        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON contacts (user_id);
CREATE INDEX ON projects (user_id);
CREATE INDEX ON bookings (user_id, starts_at);
CREATE INDEX ON follow_ups (user_id, due_date);
CREATE INDEX ON opportunities (user_id, stage);
CREATE INDEX ON transactions (user_id);
