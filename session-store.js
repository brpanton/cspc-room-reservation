/**
 * PostgreSQL-backed session store for express-session.
 *
 * The default in-memory store loses every login whenever the server
 * process restarts (and `npm run dev` restarts on every saved file).
 * Keeping sessions in the same PostgreSQL database the app already uses
 * means a user who signed in stays signed in across page refreshes AND
 * server restarts. The browser only ever holds the HttpOnly "cspc.sid"
 * cookie; all session data stays server-side in this table.
 *
 * Uses the pg Pool from db.js.
 */
const session = require('express-session');
const pool = require('./db');

/** Matches cookie.maxAge in server.js (8-hour working session). */
const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 8;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    sid     VARCHAR(128) NOT NULL PRIMARY KEY,
    -- Absolute expiry as epoch milliseconds (UTC) - avoids every timezone
    -- ambiguity that TIMESTAMPTZ columns would introduce here.
    expires BIGINT NOT NULL,
    data    TEXT   NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);`;

/** Absolute expiry (epoch ms) for a session about to be written. */
function expiryOf(sess) {
  if (sess && sess.cookie && sess.cookie.expires) {
    const t = new Date(sess.cookie.expires).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (sess && sess.cookie && Number(sess.cookie.maxAge) > 0) {
    return Date.now() + Number(sess.cookie.maxAge);
  }
  return Date.now() + DEFAULT_MAX_AGE_MS;
}

class PgSessionStore extends session.Store {
  constructor() {
    super();
    this._ready = null; // lazily-created table promise (retried on failure)
  }

  /** Creates the sessions table once; safe on existing databases. */
  _ensure() {
    if (!this._ready) {
      this._ready = pool.query(CREATE_TABLE_SQL).catch((err) => {
        this._ready = null;
        throw err;
      });
    }
    return this._ready;
  }

  /** express-session: load a session by id (null when missing/expired). */
  get(sid, cb) {
    this._ensure()
      .then(() => pool.query('SELECT data, expires FROM sessions WHERE sid = $1', [sid]))
      .then(({ rows }) => {
        if (!rows.length) return cb(null, null);
        if (Number(rows[0].expires) <= Date.now()) {
          // Expired row: clean it up and report "no session".
          pool.query('DELETE FROM sessions WHERE sid = $1', [sid]).catch(() => {});
          return cb(null, null);
        }
        try {
          cb(null, JSON.parse(rows[0].data));
        } catch (err) {
          console.error('[sessions] dropped corrupt session row:', err.message);
          pool.query('DELETE FROM sessions WHERE sid = $1', [sid]).catch(() => {});
          cb(null, null);
        }
      })
      .catch((err) => cb(err));
  }

  /** express-session: persist a session (insert or replace). */
  set(sid, sess, cb) {
    this._ensure()
      .then(() =>
        pool.query(
          `INSERT INTO sessions (sid, expires, data) VALUES ($1, $2, $3)
           ON CONFLICT (sid) DO UPDATE SET expires = EXCLUDED.expires, data = EXCLUDED.data`,
          [sid, expiryOf(sess), JSON.stringify(sess)]
        )
      )
      .then(() => {
        // Opportunistic sweep so expired rows never accumulate.
        pool.query('DELETE FROM sessions WHERE expires <= $1', [Date.now()]).catch(() => {});
        if (cb) cb(null);
      })
      .catch((err) => (cb ? cb(err) : console.error('[sessions] set failed:', err.message)));
  }

  /** express-session: extend expiry of an unmodified session (resave: false). */
  touch(sid, sess, cb) {
    this._ensure()
      .then(() => pool.query('UPDATE sessions SET expires = $1 WHERE sid = $2', [expiryOf(sess), sid]))
      .then(() => {
        if (cb) cb(null);
      })
      .catch((err) => (cb ? cb(err) : console.error('[sessions] touch failed:', err.message)));
  }

  /** express-session: remove a session (logout / session regeneration). */
  destroy(sid, cb) {
    this._ensure()
      .then(() => pool.query('DELETE FROM sessions WHERE sid = $1', [sid]))
      .then(() => {
        if (cb) cb(null);
      })
      .catch((err) => (cb ? cb(err) : console.error('[sessions] destroy failed:', err.message)));
  }
}

module.exports = PgSessionStore;
