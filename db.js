const { Pool, types } = require('pg');

// PostgreSQL returns BIGINT (OID 20) -- which is what COUNT(*) produces -- as a
// string by default, so counts reached the frontend as "0", "12", etc. and
// broke numeric comparisons / addition. Parse them as JS numbers instead
// (counts and ids here are far below Number.MAX_SAFE_INTEGER).
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

/**
 * Decide whether to use SSL for a given connection string.
 * - DATABASE_SSL=true/false in .env forces it on/off.
 * - Otherwise SSL is used for remote hosts (e.g. Render) and skipped for
 *   localhost, since a default local PostgreSQL install has SSL disabled.
 */
function sslFor(connectionString) {
  const flag = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return { rejectUnauthorized: false };
  if (flag === 'false' || flag === '0') return false;
  try {
    const host = new URL(connectionString).hostname;
    if (['localhost', '127.0.0.1', '::1', ''].includes(host)) return false;
  } catch (_) {
    /* fall through to SSL on */
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslFor(process.env.DATABASE_URL)
});

module.exports = pool;
module.exports.sslFor = sslFor;
