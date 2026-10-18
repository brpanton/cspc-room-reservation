-- =============================================================
--  CSPC Lab & Room Reservation System - Database Schema
--  Run with:  npm run init-db   (or: mysql -u root -p < schema.sql)
-- =============================================================

CREATE DATABASE IF NOT EXISTS cspc_reservation
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cspc_reservation;

-- -------------------------------------------------------------
-- Users: students, faculty, custodians and admins all live here
-- and are separated by the `role` column.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
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
  role          ENUM('student','faculty','custodian','admin') NOT NULL DEFAULT 'student',
  admin_level   ENUM('Super Admin','Assistant Admin') DEFAULT NULL,
  department    VARCHAR(120) DEFAULT NULL,
  avatar_url    VARCHAR(255) DEFAULT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_by_admin_id INT DEFAULT NULL,
  -- Google subject ("sub") claim for "Sign in with CSPC Google Account".
  google_sub    VARCHAR(64) DEFAULT NULL UNIQUE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  CONSTRAINT fk_users_created_by_admin FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_level ENUM('Super Admin','Assistant Admin') DEFAULT NULL AFTER role,
  ADD COLUMN IF NOT EXISTS recovery_email VARCHAR(150) DEFAULT NULL AFTER email,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) DEFAULT NULL AFTER department,
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN IF NOT EXISTS created_by_admin_id INT DEFAULT NULL AFTER must_change_password,
  ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0 AFTER created_by_admin_id,
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) DEFAULT NULL AFTER login_count;

-- Backfill for databases created before the first-login greeting existed:
-- accounts that have existed for a while but never logged in under the new
-- counter (login_count = 0) are treated as returning users, so their next
-- login shows "Welcome back". Brand-new rows created within the last few
-- minutes keep login_count = 0 so their first login shows "Welcome".
UPDATE users SET login_count = 1 WHERE login_count = 0 AND created_at < (NOW() - INTERVAL 5 MINUTE);

-- -------------------------------------------------------------
-- Password recovery ("Forgot password?"): 6-digit OTP codes sent
-- by email. Only a bcrypt HASH of the code is stored - never the
-- code itself. After the OTP verifies, `reset_token_hash` holds a
-- sha256 of the one-time token that authorises the final password
-- change. Codes expire after 10 minutes, are limited to 5 wrong
-- attempts, and are single-use (`used_at`).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  email            VARCHAR(150) NOT NULL,
  otp_hash         VARCHAR(255) NOT NULL,
  reset_token_hash VARCHAR(64)  DEFAULT NULL,
  attempts         INT NOT NULL DEFAULT 0,
  expires_at       DATETIME NOT NULL,
  verified_at      DATETIME DEFAULT NULL,
  used_at          DATETIME DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prc_email (email),
  CONSTRAINT fk_prc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Buildings are seeded by scripts/init-db.js.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL UNIQUE,
  location   VARCHAR(160) DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Rooms / Laboratories belonging to a building.
-- `capacity` is enforced when a reservation is submitted.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT          NOT NULL,
  name        VARCHAR(120) NOT NULL,
  room_type   ENUM('laboratory','classroom','hall','office') NOT NULL DEFAULT 'laboratory',
  capacity    INT          NOT NULL DEFAULT 40,
  -- Free-text floor label shown to users, e.g. "2nd Floor".
  floor       VARCHAR(50)  DEFAULT NULL,
  -- Optional photo shown on room cards, e.g. "/img/btvded-lab.jpg".
  image_url   VARCHAR(255) DEFAULT NULL,
  has_projector  TINYINT(1) NOT NULL DEFAULT 0,
  has_aircon     TINYINT(1) NOT NULL DEFAULT 0,
  has_sound      TINYINT(1) NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rooms_building
    FOREIGN KEY (building_id) REFERENCES buildings (id)
    ON DELETE CASCADE,
  UNIQUE KEY uq_room_per_building (building_id, name)
) ENGINE=InnoDB;

-- Backfill for databases created before floor labels / room photos existed.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS floor     VARCHAR(50)  DEFAULT NULL AFTER capacity,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT NULL AFTER floor;

-- -------------------------------------------------------------
-- Reservations. status starts as 'Pending' and is moved to
-- 'Approved' / 'Rejected' / 'Cancelled' by the custodian or admin.
-- `approved_by` records which staff member acted on the request.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  room_id       INT       NOT NULL,
  user_id       INT       NOT NULL,
  res_date      DATE      NOT NULL,
  start_time    TIME      NOT NULL,
  end_time      TIME      NOT NULL,
  purpose       TEXT      NOT NULL,
  attendees     INT       NOT NULL DEFAULT 1,
  status        ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  approved_by   INT       DEFAULT NULL,
  remarks       VARCHAR(255) DEFAULT NULL,
  decided_at    DATETIME  DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_res_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_res_date (res_date),
  INDEX idx_res_status (status),
  INDEX idx_res_room_date (room_id, res_date),
  -- Cheap guard against records where the end is not after the start.
  CONSTRAINT chk_res_time CHECK (end_time > start_time)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Equipment requested per reservation (multi-select checkboxes).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_equipment (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  equipment      ENUM('Projector','Extension Cord','Aircon Access','Microphone','Sound System','Whiteboard Markers') NOT NULL,
  CONSTRAINT fk_eq_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Audit trail for approvals / rejections / cancellations.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_logs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT NOT NULL,
  actor_id       INT DEFAULT NULL,
  action         VARCHAR(40) NOT NULL,
  remarks        VARCHAR(255) DEFAULT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_reservation FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
  CONSTRAINT fk_log_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Support requests submitted from the public login / help desk form.
-- Keep sensitive credentials out of the ticket content and store only the
-- operational details needed for triage.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(120) NOT NULL,
  role_department VARCHAR(120) NOT NULL,
  contact         VARCHAR(180) NOT NULL,
  category        ENUM('Password Reset','Login Error','Room Booking Issue','Other') NOT NULL,
  status          ENUM('Open','In Progress','Resolved') NOT NULL DEFAULT 'Open',
  description     TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_category (category),
  INDEX idx_support_created (created_at)
) ENGINE=InnoDB;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS status ENUM('Open','In Progress','Resolved') NOT NULL DEFAULT 'Open' AFTER category,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  actor_admin_id    INT NOT NULL,
  target_admin_id   INT DEFAULT NULL,
  action           VARCHAR(80) NOT NULL,
  details          TEXT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_admin_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_target FOREIGN KEY (target_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_actor (actor_admin_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;


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
  data    MEDIUMTEXT   NOT NULL,
  INDEX idx_sessions_expires (expires)
) ENGINE=InnoDB;
