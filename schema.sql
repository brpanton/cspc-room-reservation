-- =============================================================
--  CSPC Lab & Room Reservation System - Database Schema (PostgreSQL)
--  Run with:  npm run init-db
-- =============================================================

-- -------------------------------------------------------------
-- Users: students, faculty, custodians and admins all live here
-- and are separated by the `role` column.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  -- Student/Faculty ID number, e.g. "2021-00123" or "FAC-0098"
  school_id     VARCHAR(50)  NOT NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  -- Primary LOGIN email. This is the account's identity and is NEVER
  -- changed by the password-recovery flow (only admins can edit it).
  email         VARCHAR(150) NOT NULL UNIQUE,
  -- Optional alternate address that only RECEIVES password-reset OTP codes.
  -- Kept completely separate from `email` so recovery can never change login.
  recovery_email VARCHAR(150) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)   NOT NULL DEFAULT 'student' CHECK (role IN ('student','faculty','custodian','admin')),
  admin_level   VARCHAR(30)   DEFAULT NULL CHECK (admin_level IS NULL OR admin_level IN ('Super Admin','Assistant Admin')),
  department    VARCHAR(120) DEFAULT NULL,
  avatar_url    VARCHAR(255) DEFAULT NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_admin_id INT DEFAULT NULL,
  -- Google subject ("sub") claim for "Sign in with CSPC Google Account".
  google_sub    VARCHAR(64) DEFAULT NULL UNIQUE,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  login_count   INT           NOT NULL DEFAULT 0,
  CONSTRAINT fk_users_created_by_admin FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Add columns for existing databases (safe to re-run)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_level VARCHAR(30) DEFAULT NULL CHECK (admin_level IS NULL OR admin_level IN ('Super Admin','Assistant Admin')),
  ADD COLUMN IF NOT EXISTS recovery_email VARCHAR(150) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by_admin_id INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) DEFAULT NULL;

-- Backfill for databases created before the first-login greeting existed:
-- accounts that have existed for a while but never logged in under the new
-- counter (login_count = 0) are treated as returning users, so their next
-- login shows "Welcome back". Brand-new rows created within the last few
-- minutes keep login_count = 0 so their first login shows "Welcome".
UPDATE users SET login_count = 1 WHERE login_count = 0 AND created_at < (NOW() - INTERVAL '5 MINUTE');

-- -------------------------------------------------------------
-- Password recovery ("Forgot password?"): 6-digit OTP codes sent
-- by email. Only a bcrypt HASH of the code is stored - never the
-- code itself. After the OTP verifies, `reset_token_hash` holds a
-- sha256 of the one-time token that authorises the final password
-- change. Codes expire after 10 minutes, are limited to 5 wrong
-- attempts, and are single-use (`used_at`).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL,
  email            VARCHAR(150) NOT NULL,
  otp_hash         VARCHAR(255) NOT NULL,
  reset_token_hash VARCHAR(64)  DEFAULT NULL,
  attempts         INT NOT NULL DEFAULT 0,
  expires_at       TIMESTAMP NOT NULL,
  verified_at      TIMESTAMP DEFAULT NULL,
  used_at          TIMESTAMP DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prc_email ON password_reset_codes(email);

-- -------------------------------------------------------------
-- Buildings are seeded by scripts/init-db.js.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL UNIQUE,
  location   VARCHAR(160) DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- Rooms / Laboratories belonging to a building.
-- `capacity` is enforced when a reservation is submitted.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  building_id INT          NOT NULL,
  name        VARCHAR(120) NOT NULL,
  room_type   VARCHAR(20)   NOT NULL DEFAULT 'laboratory' CHECK (room_type IN ('laboratory','classroom','hall','office')),
  capacity    INT          NOT NULL DEFAULT 40,
  -- Free-text floor label shown to users, e.g. "2nd Floor".
  floor       VARCHAR(50)  DEFAULT NULL,
  -- Optional photo shown on room cards, e.g. "/img/btvded-lab.jpg".
  image_url   VARCHAR(255) DEFAULT NULL,
  has_projector  BOOLEAN NOT NULL DEFAULT FALSE,
  has_aircon     BOOLEAN NOT NULL DEFAULT FALSE,
  has_sound      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rooms_building
    FOREIGN KEY (building_id) REFERENCES buildings (id)
    ON DELETE CASCADE,
  UNIQUE (building_id, name)
);

-- Backfill for databases created before floor labels / room photos existed.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS floor     VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT NULL;

-- -------------------------------------------------------------
-- Reservations. status starts as 'Pending' and is moved to
-- 'Approved' / 'Rejected' / 'Cancelled' by the custodian or admin.
-- `approved_by` records which staff member acted on the request.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id            SERIAL PRIMARY KEY,
  room_id       INT       NOT NULL,
  user_id       INT       NOT NULL,
  res_date      DATE      NOT NULL,
  start_time    TIME      NOT NULL,
  end_time      TIME      NOT NULL,
  purpose       TEXT      NOT NULL,
  attendees     INT       NOT NULL DEFAULT 1,
  status        VARCHAR(20)   NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Cancelled')),
  transaction_code  VARCHAR(30) UNIQUE,
  approved_by   INT       DEFAULT NULL,
  remarks       VARCHAR(255) DEFAULT NULL,
  decided_at    TIMESTAMP  DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_res_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_res_time CHECK (end_time > start_time)
);

-- Add transaction_code column to existing databases (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'transaction_code'
  ) THEN
    ALTER TABLE reservations ADD COLUMN transaction_code VARCHAR(30) UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_res_date ON reservations(res_date);
CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_res_room_date ON reservations(room_id, res_date);

-- -------------------------------------------------------------
-- Equipment requested per reservation (multi-select checkboxes).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_equipment (
  id             SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL,
  equipment      VARCHAR(40) NOT NULL CHECK (equipment IN ('Projector','Extension Cord','Aircon Access','Microphone','Sound System','Whiteboard Markers')),
  CONSTRAINT fk_eq_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations (id)
    ON DELETE CASCADE
);

-- -------------------------------------------------------------
-- Audit trail for approvals / rejections / cancellations.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_logs (
  id             SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL,
  actor_id       INT DEFAULT NULL,
  action         VARCHAR(40) NOT NULL,
  remarks        VARCHAR(255) DEFAULT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
  CONSTRAINT fk_log_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);

-- -------------------------------------------------------------
-- Support requests submitted from the public login / help desk form.
-- Keep sensitive credentials out of the ticket content and store only the
-- operational details needed for triage.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(120) NOT NULL,
  role_department VARCHAR(120) NOT NULL,
  contact         VARCHAR(180) NOT NULL,
  category        VARCHAR(40)   NOT NULL DEFAULT 'Password Reset' CHECK (category IN ('Password Reset','Login Error','Room Booking Issue','Other')),
  status          VARCHAR(40)   NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  description     TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_created ON support_tickets(created_at);

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id               SERIAL PRIMARY KEY,
  actor_admin_id    INT NOT NULL,
  target_admin_id   INT DEFAULT NULL,
  action           VARCHAR(80) NOT NULL,
  details          TEXT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_admin_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_target FOREIGN KEY (target_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_logs(actor_admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at);


-- -------------------------------------------------------------
-- Server-side session store for express-session (session-store.js).
-- The browser only ever holds the HttpOnly "cspc.sid" cookie; the actual
-- login state lives here so users stay signed in across page refreshes
-- and server restarts. `expires` is epoch milliseconds (UTC); rows are
-- swept opportunistically by the store.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  sid     VARCHAR(128) NOT NULL PRIMARY KEY,
  expires BIGINT       NOT NULL,
  data    TEXT   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
