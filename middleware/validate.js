/**
 * Small, dependency-free validation helpers shared by every route.
 * Each throws an Error with `status = 400` on failure so the central
 * error handler can turn it into a clean JSON response.
 */

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === ''
  );
  if (missing.length) throw fail(`Missing required field(s): ${missing.join(', ')}`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Accepts "YYYY-MM-DD" and confirms it is a real calendar date. */
function parseDate(value, fieldName = 'date') {
  if (!DATE_RE.test(String(value || ''))) {
    throw fail(`${fieldName} must be in YYYY-MM-DD format.`);
  }
  const [y, m, d] = String(value).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw fail(`${fieldName} is not a valid calendar date.`);
  }
  return String(value);
}

/** Accepts "HH:MM" or "HH:MM:SS" and normalises it to "HH:MM:SS". */
function parseTime(value, fieldName = 'time') {
  const str = String(value || '').trim();
  if (!TIME_RE.test(str)) {
    throw fail(`${fieldName} must be in HH:MM (24-hour) format.`);
  }
  return str.length === 5 ? `${str}:00` : str;
}

/** Minutes since midnight - convenient for range overlap arithmetic. */
function toMinutes(hhmmss) {
  const [h, m] = String(hhmmss).split(':').map(Number);
  return h * 60 + m;
}

/** Today in local time as "YYYY-MM-DD" (avoids UTC off-by-one-day bugs). */
function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Rejects reservations in the past. */
function assertNotPast(dateIso, fieldName = 'date') {
  if (dateIso < todayIso()) throw fail(`The ${fieldName} cannot be in the past.`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw fail('Please enter a valid email address.');
  return email;
}

function parseIntInRange(value, { min = 1, max = 10000, fieldName = 'value' } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw fail(`${fieldName} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

/** Student/Faculty ID: letters, digits, dashes, 4-50 chars. */
function parseSchoolId(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,50}$/.test(id)) {
    throw fail('ID number may only contain letters, digits and dashes (4-50 characters).');
  }
  return id;
}

function parsePassword(value) {
  const pw = String(value || '');
  if (pw.length < 8) throw fail('Password must be at least 8 characters long.');
  if (pw.length > 72) throw fail('Password must be 72 characters or fewer.');
  return pw;
}

/**
 * Stricter policy for self-service password changes (Security settings):
 * at least 8 characters, 1 uppercase letter, 1 number and 1 special character.
 */
function parseStrongPassword(value) {
  const pw = parsePassword(value);
  if (!/[A-Z]/.test(pw)) throw fail('New password must contain at least one uppercase letter.');
  if (!/[0-9]/.test(pw)) throw fail('New password must contain at least one number.');
  if (!/[^A-Za-z0-9]/.test(pw)) throw fail('New password must contain at least one special character.');
  return pw;
}

/** Only ever allow these values into an ENUM column. */
function oneOf(value, allowed, fieldName = 'value') {
  const v = String(value || '').trim();
  if (!allowed.includes(v)) {
    throw fail(`${fieldName} must be one of: ${allowed.join(', ')}.`);
  }
  return v;
}

const ROLES = ['student', 'faculty', 'custodian', 'admin'];
const EQUIPMENT_TYPES = [
  'Projector',
  'Extension Cord',
  'Aircon Access',
  'Microphone',
  'Sound System',
  'Whiteboard Markers'
];
const ROOM_TYPES = ['laboratory', 'classroom', 'hall', 'office'];
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

module.exports = {
  fail,
  requireFields,
  parseDate,
  parseTime,
  toMinutes,
  todayIso,
  assertNotPast,
  parseEmail,
  parseIntInRange,
  parseSchoolId,
  parsePassword,
  parseStrongPassword,
  oneOf,
  ROLES,
  EQUIPMENT_TYPES,
  ROOM_TYPES,
  STATUSES
};
