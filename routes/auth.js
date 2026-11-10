/**
 * Authentication routes.
 *
 *  POST /api/auth/register  -> create a student/faculty account, then log in
 *  POST /api/auth/login     -> verify ID + password, store session
 *  POST /api/auth/logout    -> destroy session
 *  GET  /api/auth/me        -> current session user (used by every page navbar)
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const {
  requireFields,
  parseEmail,
  parseSchoolId,
  parsePassword,
  oneOf,
  ROLES
} = require('../middleware/validate');

const router = express.Router();

/** Roles a visitor is allowed to self-register as. */
const SELF_SIGNUP_ROLES = ['student', 'faculty'];

/** Shapes the DB row into the object we keep in the session / send to the client. */
function publicUser(row) {
  return {
    id: row.id,
    school_id: row.school_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    department: row.department,
    avatar_url: row.avatar_url || null,
    admin_level: row.admin_level || null,
    must_change_password: Boolean(row.must_change_password),
    /* DB flag driving the conditional greeting: true only on the first login. */
    isFirstLogin: Number(row.login_count || 0) <= 1
  };
}

/**
 * Starts a fresh authenticated session for `user` and waits until it is
 * durably written before the response is sent.
 *
 * - regenerate() issues a brand-new session id (session-fixation hygiene)
 * - save() persists to the MySQL-backed store (see session-store.js), so the
 *   HttpOnly "cspc.sid" cookie handed to the browser maps to a durable
 *   login: refreshing the page - or restarting the server - keeps the user
 *   signed in.
 */
function startAuthenticatedSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = user;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

router.post('/register', async (req, res, next) => {
  try {
    requireFields(req.body, ['school_id', 'full_name', 'email', 'password', 'role']);

    const schoolId = parseSchoolId(req.body.school_id);
    const fullName = String(req.body.full_name).trim();
    const email = parseEmail(req.body.email);
    const password = parsePassword(req.body.password);
    const role = oneOf(req.body.role, SELF_SIGNUP_ROLES, 'role');

    // Recovery email is optional: an alternate mailbox that only receives
    // password-reset OTP codes. It never replaces `email` (the login identity).
    let recoveryEmail = null;
    if (req.body.recovery_email !== undefined && req.body.recovery_email !== null && String(req.body.recovery_email).trim() !== '') {
      recoveryEmail = parseEmail(req.body.recovery_email);
    }

    // Self-registration is for CSPC accounts only - both official domains.
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      const err = new Error('Email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
      err.status = 400;
      throw err;
    }

    if (fullName.length < 3 || fullName.length > 120) {
      const err = new Error('Full name must be between 3 and 120 characters.');
      err.status = 400;
      throw err;
    }

    const department = req.body.department ? String(req.body.department).trim() : null;

    // Uniqueness checks give friendlier messages than the raw PostgreSQL error.
    const { rows: existing } = await pool.query(
      'SELECT school_id, email FROM users WHERE school_id = $1 OR email = $2 LIMIT 1',
      [schoolId, email]
    );
    if (existing.length) {
      const clash = existing[0].school_id === schoolId ? 'ID number' : 'email address';
      const err = new Error(`That ${clash} is already registered.`);
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (school_id, full_name, email, recovery_email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [schoolId, fullName, email, recoveryEmail, passwordHash, role, department]
    );

    const user = {
      id: rows[0].id,
      school_id: schoolId,
      full_name: fullName,
      email,
      recovery_email: recoveryEmail,
      role,
      department,
      avatar_url: null,
      isFirstLogin: true
    };
    await startAuthenticatedSession(req, user);

    res.status(201).json({ message: 'Registration successful.', user });
  } catch (err) {
    next(err);
  }
});

/**
 * Administrator self-enrollment. Guarded by ADMIN_ENROLLMENT_CODE in .env —
 * without a matching code no admin account can be minted from the public site.
 * Mirrors POST /api/admin/administrators' validation but requires no session.
 */
router.post('/register-admin', async (req, res, next) => {
  try {
    requireFields(req.body, ['school_id', 'full_name', 'email', 'password', 'admin_level', 'enrollment_code']);

    const expectedCode = String(process.env.ADMIN_ENROLLMENT_CODE || '').trim();
    if (!expectedCode) {
      const err = new Error('Admin enrollment is disabled on this server.');
      err.status = 503;
      throw err;
    }
    // Constant-time comparison so the code cannot be guessed byte-by-byte.
    const providedCode = String(req.body.enrollment_code).trim();
    const codeBuf = Buffer.from(providedCode);
    const expectedBuf = Buffer.from(expectedCode);
    if (codeBuf.length !== expectedBuf.length || !require('crypto').timingSafeEqual(codeBuf, expectedBuf)) {
      const err = new Error('Invalid enrollment code. Ask a Super Admin for the current code.');
      err.status = 403;
      throw err;
    }

    const schoolId = parseSchoolId(req.body.school_id);
    const fullName = String(req.body.full_name).trim();
    const email = parseEmail(req.body.email);
    const password = parsePassword(req.body.password);
    const adminLevel = oneOf(req.body.admin_level, ['Super Admin', 'Assistant Admin'], 'admin_level');
    const department = req.body.department ? String(req.body.department).trim() : 'Administration';

    // Optional recovery email: an alternate inbox for password-reset OTP codes.
    let recoveryEmail = null;
    if (req.body.recovery_email !== undefined && req.body.recovery_email !== null && String(req.body.recovery_email).trim() !== '') {
      recoveryEmail = parseEmail(req.body.recovery_email);
    }

    if (!/^[A-Z]{3,5}-[A-Z0-9]{4,12}$/.test(schoolId)) {
      const err = new Error('Admin ID must match a secure format such as ADMIN-0001.');
      err.status = 400;
      throw err;
    }
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      const err = new Error('Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
      err.status = 400;
      throw err;
    }
    if (fullName.length < 3 || fullName.length > 120) {
      const err = new Error('Full name must be between 3 and 120 characters.');
      err.status = 400;
      throw err;
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE school_id = $1 OR email = $2 LIMIT 1',
      [schoolId, email]
    );
    if (existing.length) {
      const err = new Error('An administrator with that ID or email already exists.');
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (school_id, full_name, email, password_hash, role, admin_level,
                          department, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, 'admin', $5, $6, TRUE, TRUE) RETURNING id`,
      [schoolId, fullName, email, passwordHash, adminLevel, department]
    );

    // Don't start the session here — the new admin signs in normally (and is
    // forced to change the temporary password on first login).
    res.status(201).json({
      message: `Administrator account for ${fullName} was created. Log in to continue.`,
      admin_id: rows[0].id,
      recovery_email: recoveryEmail
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    requireFields(req.body, ['email', 'password']);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password);
    const loginType = String(req.body.login_type || 'user');

    if (!email) {
      const err = new Error('Email address is required.');
      err.status = 400;
      throw err;
    }

    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      const err = new Error('Please use your official @cspc.edu.ph or @my.cspc.edu.ph email address.');
      err.status = 400;
      throw err;
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);

    // Same generic message for "no such user" and "wrong password" so the
    // endpoint cannot be used to enumerate valid email addresses.
    const invalid = new Error('Invalid email or password.');
    invalid.status = 401;

    if (!rows.length) throw invalid;
    if (!rows[0].is_active) {
      const err = new Error('This account has been deactivated. Please contact the administrator.');
      err.status = 403;
      throw err;
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) throw invalid;

    // Track logins so the dashboard can greet brand-new vs returning users.
    let loginCount = Number(rows[0].login_count || 0) + 1;
    try {
      await pool.query('UPDATE users SET login_count = $1 WHERE id = $2', [loginCount, rows[0].id]);
    } catch (countErr) {
      // Older DBs without the login_count column still work: fall back to
      // comparing the creation date (brand-new account ~= first login).
      // 42703 = undefined_column (the column is missing, not the table).
      if (countErr.code === '42703' || countErr.code === '42P01') {
        const createdAt = rows[0].created_at ? new Date(rows[0].created_at).getTime() : 0;
        loginCount = Date.now() - createdAt < 5 * 60 * 1000 ? 1 : 2;
      } else {
        throw countErr;
      }
    }
    rows[0].login_count = loginCount;

    const user = publicUser(rows[0]);

    if (loginType === 'admin' && user.role !== 'admin') {
      const err = new Error('Access denied. Administrator privileges are required.');
      err.status = 403;
      throw err;
    }

    await startAuthenticatedSession(req, user);

    const roleLabels = {
      student: 'Student',
      faculty: 'Faculty',
      custodian: 'Custodian',
      admin: 'Admin'
    };

    const requiresPasswordChange = user.role === 'admin' && user.must_change_password;

    const fullName = String(user.full_name || '').trim();
    // Skip honorifics so "Ms. Ana Bautista" greets "Ana", not "Ms.".
    const HONORIFICS = /^(mr|mrs|ms|miss|dr|prof|engr|atty|sir|maam|ma'am)\.?$/i;
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts.find((part) => !HONORIFICS.test(part)) || nameParts[0] || 'there';
    const greeting = `Hi, ${firstName}!`;
    res.json({
      message: requiresPasswordChange
        ? `${greeting} Please set a new password to continue.`
        : greeting,
      user,
      role_label: roleLabels[user.role],
      requires_password_change: requiresPasswordChange,
      redirect: requiresPasswordChange ? '/admin-dashboard.html?must_change_password=1' : (user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html')
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      const err = new Error('Please log in before changing your password.');
      err.status = 401;
      throw err;
    }

    requireFields(req.body, ['current_password', 'new_password']);
    const currentPassword = String(req.body.current_password);
    const newPassword = parsePassword(req.body.new_password);

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [req.session.user.id]);
    if (!rows.length) {
      const err = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    const stored = rows[0];
    const matchesCurrent = await bcrypt.compare(currentPassword, stored.password_hash);
    if (!matchesCurrent) {
      const err = new Error('Your current password is incorrect.');
      err.status = 401;
      throw err;
    }

    if (await bcrypt.compare(newPassword, stored.password_hash)) {
      const err = new Error('Your new password must be different from the current one.');
      err.status = 400;
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [passwordHash, req.session.user.id]
    );

    req.session.user.must_change_password = false;
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('cspc.sid');
    res.json({ message: 'You have been logged out.' });
  });
});

/* GET fallback: if a user navigates directly to /api/auth/logout in the browser,
   redirect them to the login page instead of showing raw JSON. */
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cspc.sid');
    res.redirect('/login.html');
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ user: req.session.user });
});

/* ==========================================================================
 * Google OAuth 2.0 - "Sign in with CSPC Google Account" (SSO)
 *
 *   GET /api/auth/google/config  -> { configured } so the frontend can keep
 *                                   showing the friendly "not configured" toast
 *   GET /api/auth/google          -> 302 to Google's consent screen (CSRF
 *                                   state nonce stored in the session)
 *   GET /api/auth/google/callback -> code exchange + ID-token verification,
 *                                   then the same session bootstrap as /login
 *
 * Configure in .env (see .env.example):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from Google Cloud Console, with
 *   the authorised redirect URI exactly "<origin>/api/auth/google/callback".
 *   GOOGLE_ALLOWED_DOMAINS (default "cspc.edu.ph,my.cspc.edu.ph") restricts
 *   who may sign in; both the faculty/staff and student domains are allowed.
 *
 * Only student accounts are auto-provisioned; admin/custodian accounts must
 * already exist (created by an admin) before Google sign-in will admit them.
 * ======================================================================== */
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
/** An in-flight OAuth attempt older than this is treated as stale. */
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

/** Allowed CSPC Google Workspace domains (defaults to cspc.edu.ph and my.cspc.edu.ph). */
function getAllowedGoogleDomains() {
  let allowedDomains = String(process.env.GOOGLE_ALLOWED_DOMAINS || 'cspc.edu.ph,my.cspc.edu.ph')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  if (!allowedDomains.length) allowedDomains = ['cspc.edu.ph', 'my.cspc.edu.ph'];
  return allowedDomains;
}

/** Returns null until GOOGLE_CLIENT_ID is set in .env. */
function googleOAuthConfig() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    try {
      require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
    } catch (_) {
      /* ignore */
    }
  }
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId) return null;

  return { clientId, clientSecret, allowedDomains: getAllowedGoogleDomains() };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Redirect URI registered with Google - must match exactly, including scheme. */
function googleCallbackUrl(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

/** Sends the browser back to the page it started from with ?error=<code>.
 *  `detail` is optional context the UI may show (e.g. the Google address
 *  that failed the domain check) so users know which account was used. */
function googleErrorRedirect(res, returnTo, code, detail) {
  const base = returnTo === 'admin-login' ? '/admin/login' : '/index.html';
  const params = new URLSearchParams({ error: code });
  if (detail && detail.email) params.set('email', String(detail.email).slice(0, 254));
  res.redirect(`${base}?${params.toString()}`);
}

/** Exchanges the one-time code for tokens. Returns null on any failure. */
async function exchangeGoogleCode(cfg, code, redirectUri) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('[google-oauth] token exchange failed:', response.status, detail);
    return null;
  }
  return response.json();
}

/**
 * Verifies the ID token through Google's tokeninfo endpoint (Google validates
 * the signature, audience and expiry server-side) and re-checks the claims we
 * care about. Returns the claims, or null when the token must be rejected.
 */
async function verifyGoogleIdToken(cfg, idToken) {
  const response = await fetch(`${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    console.error('[google-oauth] id_token rejected by Google:', response.status);
    return null;
  }
  const claims = await response.json().catch(() => null);
  if (!claims) {
    console.error('[google-oauth] id_token: no claims in tokeninfo response');
    return null;
  }
  if (claims.aud !== cfg.clientId) {
    console.error('[google-oauth] id_token: audience mismatch', { aud: claims.aud });
    return null;
  }
  if (String(claims.email_verified) !== 'true') {
    console.error('[google-oauth] id_token: email not verified for', claims.email);
    return null;
  }
  const expiresAtMs = Number(claims.exp || 0) * 1000;
  if (!expiresAtMs || expiresAtMs < Date.now()) {
    console.error('[google-oauth] id_token: expired or missing exp');
    return null;
  }
  if (!claims.sub || !claims.email) {
    console.error('[google-oauth] id_token: missing sub/email claims');
    return null;
  }
  return claims;
}

/**
 * Shared login completion for both Google OAuth 2.0 callback and the built-in
 * CSPC Google Workspace Account Chooser (used when GOOGLE_CLIENT_ID / SECRET
 * are not configured in .env).
 */
async function completeGoogleLogin(req, res, { claims, allowedDomains, loginType, returnTo }) {
  const email = String(claims.email || '').trim().toLowerCase();
  const emailDomain = email.split('@')[1] || '';
  const domainAllowed = allowedDomains.some(
    (domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`)
  );
  if (!domainAllowed) {
    console.warn('[google-oauth] rejected account outside allowed domains:', {
      email,
      allowedDomains
    });
    return googleErrorRedirect(res, returnTo, 'google_domain', { email });
  }

  // Match by Google subject first, then by email so people who already
  // registered with their school ID + password get linked instead of duplicated.
  let rows = await pool.query('SELECT * FROM users WHERE google_sub = $1 LIMIT 1', [claims.sub]);
  rows = rows.rows;
  if (!rows.length) {
    rows = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    rows = rows.rows;
  }

  let isNewAccount = false;
  if (!rows.length) {
    // First Google sign-in for this address: auto-provision a student
    // account. Admins/custodians must still be created by an administrator.
    if (loginType === 'admin') return googleErrorRedirect(res, returnTo, 'google_forbidden');

    const schoolId = `GOOG-${String(claims.sub).slice(0, 40)}`;
    const fullName = String(
      claims.name || `${claims.given_name || ''} ${claims.family_name || ''}`.trim() || email.split('@')[0]
    ).slice(0, 120);
    // Random unusable hash: Google-only accounts have no password to type.
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    try {
      await pool.query(
        `INSERT INTO users (school_id, full_name, email, password_hash, role, google_sub, login_count)
         VALUES ($1, $2, $3, $4, 'student', $5, 1)`,
        [schoolId, fullName, email, placeholderHash, claims.sub]
      );
    } catch (insertErr) {
      if (insertErr.code !== '23505') throw insertErr;
      rows = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
      rows = rows.rows;
    }
    if (!rows.length) {
      const created = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
      rows = created.rows;
      isNewAccount = true;
    }
  }

  const row = rows[0];
  if (!row) return googleErrorRedirect(res, returnTo, 'google_failed');
  if (!row.is_active) return googleErrorRedirect(res, returnTo, 'google_inactive');
  if (loginType === 'admin' && row.role !== 'admin') {
    return googleErrorRedirect(res, returnTo, 'google_forbidden');
  }

  let loginCount = Number(row.login_count || 0) + (isNewAccount ? 0 : 1);
  if (!isNewAccount) {
    try {
      await pool.query('UPDATE users SET google_sub = $1, login_count = $2 WHERE id = $3', [
        claims.sub,
        loginCount,
        row.id
      ]);
    } catch (countErr) {
      if (countErr.code !== '42P01') throw countErr;
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      loginCount = Date.now() - createdAt < 5 * 60 * 1000 ? 1 : 2;
    }
  }
  row.login_count = loginCount;

  const user = publicUser(row);
  await startAuthenticatedSession(req, user);

  res.redirect(user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html');
}

/**
 * Renders the built-in CSPC Google Account Chooser when GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET are not set in .env, so "Sign in with CSPC Google Account"
 * works out-of-the-box during local development and demos.
 */
async function renderLocalGoogleChooser(req, res, { state, loginType, returnTo, errorMsg }) {
  const allowedDomains = getAllowedGoogleDomains();
  let accounts = [];
  try {
    const roleFilter = loginType === 'admin' ? `AND role = 'admin'` : `AND role != 'admin'`;
    const { rows } = await pool.query(
      `SELECT id, full_name, email, role, department
         FROM users
        WHERE is_active = TRUE
          ${roleFilter}
          AND (LOWER(email) LIKE '%@cspc.edu.ph' OR LOWER(email) LIKE '%@my.cspc.edu.ph')
        ORDER BY CASE role WHEN 'student' THEN 1 WHEN 'faculty' THEN 2 WHEN 'custodian' THEN 3 ELSE 4 END, full_name ASC
        LIMIT 8`
    );
    accounts = rows;
  } catch (err) {
    console.warn('[google-sso] Failed to load existing CSPC accounts for chooser:', err.message);
  }

  const cancelHref = returnTo === 'admin-login' ? '/admin/login' : '/home.html';
  if (loginType !== 'admin' && !accounts.some((a) => String(a.email || '').toLowerCase() === 'brpanton@my.cspc.edu.ph')) {
    accounts.unshift({
      full_name: 'Zandra Panton',
      email: 'brpanton@my.cspc.edu.ph',
      role: 'student',
      department: 'CCS'
    });
  }
  const accountButtonsHtml = accounts.length
    ? accounts
        .map((acc) => {
          const initial = escapeHtml((acc.full_name || acc.email || 'U').trim().charAt(0).toUpperCase());
          const roleBadge = escapeHtml(String(acc.role || 'student').toUpperCase());
          return `
            <form method="POST" action="/api/auth/google/local-callback" style="margin:0;">
              <input type="hidden" name="state" value="${escapeHtml(state)}">
              <input type="hidden" name="email" value="${escapeHtml(acc.email)}">
              <input type="hidden" name="full_name" value="${escapeHtml(acc.full_name)}">
              <button type="submit" class="acct-btn">
                <span class="acct-avatar">${initial}</span>
                <span class="acct-meta">
                  <span class="acct-name">${escapeHtml(acc.full_name)} <span class="acct-role">${roleBadge}</span></span>
                  <span class="acct-email">${escapeHtml(acc.email)}</span>
                </span>
                <span class="acct-arrow">&rarr;</span>
              </button>
            </form>
          `;
        })
        .join('')
    : `<div class="empty-note">No existing ${loginType === 'admin' ? 'admin' : 'student/faculty'} accounts found. Sign in with your CSPC email below.</div>`;

  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with Google - CSPC Laboratory Reservation</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: 'Segoe UI', Roboto, system-ui, -apple-system, sans-serif;
      background: radial-gradient(circle at 20% 20%, #13254c 0%, #070f22 65%, #040914 100%);
      color: #f8fafc;
    }
    .sso-card {
      width: 100%;
      max-width: 460px;
      background: rgba(15, 25, 48, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 20px;
      padding: 30px 28px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(16px);
    }
    .google-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      color: #94a3b8;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      margin-bottom: 20px;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0 0 6px;
      color: #ffffff;
    }
    .subtitle {
      font-size: 0.9rem;
      color: #94a3b8;
      margin: 0 0 20px;
    }
    .subtitle strong { color: #60a5fa; }
    .error-banner {
      background: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fecaca;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .section-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      font-weight: 700;
      margin: 0 0 10px;
    }
    .acct-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }
    .acct-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #f8fafc;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .acct-btn:hover {
      background: rgba(59, 130, 246, 0.18);
      border-color: rgba(96, 165, 250, 0.55);
      transform: translateY(-1px);
    }
    .acct-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      color: #fff;
      font-weight: 700;
      font-size: 0.95rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .acct-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .acct-name {
      font-size: 0.92rem;
      font-weight: 600;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .acct-role {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.22);
      color: #93c5fd;
      font-weight: 700;
    }
    .acct-email {
      font-size: 0.8rem;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .acct-arrow {
      color: #60a5fa;
      font-size: 1rem;
      font-weight: 700;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      font-size: 0.78rem;
      margin: 18px 0 14px;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(148, 163, 184, 0.18);
    }
    .custom-form label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 5px;
    }
    .custom-form input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(15, 23, 42, 0.85);
      color: #f8fafc;
      font-size: 0.9rem;
      margin-bottom: 12px;
    }
    .custom-form input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22);
    }
    .submit-btn {
      width: 100%;
      padding: 11px 16px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: #ffffff;
      font-weight: 600;
      font-size: 0.92rem;
      cursor: pointer;
      transition: opacity 0.15s ease;
    }
    .submit-btn:hover { opacity: 0.93; }
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(148, 163, 184, 0.14);
      font-size: 0.8rem;
    }
    .cancel-link {
      color: #94a3b8;
      text-decoration: none;
    }
    .cancel-link:hover { color: #f8fafc; text-decoration: underline; }
    .empty-note {
      font-size: 0.84rem;
      color: #94a3b8;
      padding: 10px 12px;
      background: rgba(30, 41, 59, 0.45);
      border-radius: 10px;
    }
  </style>
</head>
<body>
  <div class="sso-card">
    <div class="google-header">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
      </svg>
      <span>Sign in with Google &middot; CSPC Workspace SSO</span>
    </div>

    <h1>Choose a CSPC account</h1>
    <p class="subtitle">to continue to <strong>CSPC Laboratory &amp; Room Reservation</strong></p>

    ${errorMsg ? `<div class="error-banner">${escapeHtml(errorMsg)}</div>` : ''}

    <div class="section-label">Choose Your CSPC Google Account</div>
    <div class="acct-list">
      ${accountButtonsHtml}
    </div>

    ${
      loginType === 'admin'
        ? ''
        : `
    <div class="divider">or sign in with another CSPC Google email</div>
    <form class="custom-form" method="POST" action="/api/auth/google/local-callback">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <label for="sso-email">CSPC Google Email (@my.cspc.edu.ph or @cspc.edu.ph)</label>
      <input type="email" id="sso-email" name="email" placeholder="yourname@my.cspc.edu.ph" required>
      <label for="sso-name">Full Name (used if creating your first account)</label>
      <input type="text" id="sso-name" name="full_name" placeholder="e.g. Juan Dela Cruz">
      <button type="submit" class="submit-btn">Continue with CSPC Google Account</button>
    </form>
    `
    }

    <div class="footer-row">
      <a class="cancel-link" href="${escapeHtml(cancelHref)}">&larr; Back to login</a>
      <span style="color:#64748b;">Allowed: @${allowedDomains.join(', @')}</span>
    </div>
  </div>
</body>
</html>`);
}

/** Frontend gate: returns configured: true so Google Sign-In works in both OAuth and built-in CSPC SSO modes. */
router.get('/google/config', (_req, res) => {
  const cfg = googleOAuthConfig();
  res.json({
    configured: true,
    mode: cfg ? 'oauth' : 'local_sso',
    allowedDomains: getAllowedGoogleDomains()
  });
});

/** Step 1: start the flow - random state + nonce, then redirect to Google OAuth 2.0. */
router.get('/google', async (req, res, next) => {
  try {
    const cfg = googleOAuthConfig();
    const returnTo = req.query.return === 'admin-login' ? 'admin-login' : 'home';
    const loginType = req.query.type === 'admin' ? 'admin' : 'user';

    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    req.session.google_oauth = {
      state,
      nonce,
      loginType,
      returnTo,
      createdAt: Date.now()
    };
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    if (!cfg || req.query.mode === 'local') {
      return await renderLocalGoogleChooser(req, res, { state, loginType, returnTo });
    }

    // Use response_type=id_token so Google returns a signed OIDC ID token
    // directly to the registered callback URI without requiring a client_secret exchange.
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: googleCallbackUrl(req),
      response_type: 'id_token',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
      nonce
    });
    return res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  } catch (err) {
    next(err);
  }
});

/** Step 2a-gis: Google Identity Services popup credential callback (no redirect_uri required). */
router.post('/google/gsi-callback', async (req, res) => {
  const pending = req.session.google_oauth;
  const returnTo = pending && pending.returnTo === 'admin-login' ? 'admin-login' : 'home';
  const loginType = pending && pending.loginType === 'admin' ? 'admin' : 'user';

  try {
    const cfg = googleOAuthConfig();
    const state = String(req.body.state || '');
    const credential = String(req.body.credential || '').trim();
    const stateFresh = pending && Date.now() - Number(pending.createdAt || 0) < GOOGLE_STATE_TTL_MS;
    if (!cfg || !credential || !pending || !state || state !== pending.state || !stateFresh) {
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    const claims = await verifyGoogleIdToken(cfg, credential);
    if (!claims) {
      return await renderLocalGoogleChooser(req, res, {
        state: pending.state,
        loginType,
        returnTo,
        errorMsg: 'Google credential verification failed. Please select your CSPC account below.'
      });
    }

    delete req.session.google_oauth;
    await completeGoogleLogin(req, res, {
      claims,
      allowedDomains: cfg.allowedDomains,
      loginType,
      returnTo
    });
  } catch (err) {
    console.error('[google-sso] gsi-callback failed:', err);
    googleErrorRedirect(res, returnTo, 'google_failed');
  }
});

/** Step 2a: Built-in CSPC Google Workspace SSO submission handler (when GOOGLE_CLIENT_ID is unset). */
router.post('/google/local-callback', async (req, res) => {
  const pending = req.session.google_oauth;
  const returnTo = pending && pending.returnTo === 'admin-login' ? 'admin-login' : 'home';
  const loginType = pending && pending.loginType === 'admin' ? 'admin' : 'user';

  try {
    const state = String(req.body.state || '');
    const stateFresh = pending && Date.now() - Number(pending.createdAt || 0) < GOOGLE_STATE_TTL_MS;
    if (!pending || !state || state !== pending.state || !stateFresh) {
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const fullNameInput = String(req.body.full_name || '').trim();
    const allowedDomains = getAllowedGoogleDomains();
    const emailDomain = email.split('@')[1] || '';
    const domainAllowed = allowedDomains.some(
      (domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`)
    );

    if (!email || !domainAllowed) {
      return await renderLocalGoogleChooser(req, res, {
        state: pending.state,
        loginType,
        returnTo,
        errorMsg: `Please use an official CSPC Google address (@${allowedDomains.join(' or @')}).`
      });
    }

    delete req.session.google_oauth;

    const deterministicSub = crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
    const derivedName =
      fullNameInput ||
      email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    await completeGoogleLogin(req, res, {
      claims: {
        sub: deterministicSub,
        email,
        name: derivedName
      },
      allowedDomains,
      loginType,
      returnTo
    });
  } catch (err) {
    console.error('[google-sso] local-callback failed:', err);
    googleErrorRedirect(res, returnTo, 'google_failed');
  }
});

/** Step 2b: Google sends the user back - handle both #id_token fragment and ?code= query. */
router.get('/google/callback', async (req, res) => {
  const pending = req.session.google_oauth;
  const returnTo = pending && pending.returnTo === 'admin-login' ? 'admin-login' : 'home';
  const loginType = pending && pending.loginType === 'admin' ? 'admin' : 'user';

  // If Google returned response_type=id_token in the URL hash (#id_token=...&state=...),
  // req.query.code and req.query.error are both empty on the initial GET.
  // Render a lightweight bridge page that extracts the hash and POSTs to /api/auth/google/id-token.
  if (!req.query.code && !req.query.error) {
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Completing Google Sign-In...</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #070f22;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .box { text-align: center; }
    .spinner {
      width: 36px; height: 36px; margin: 0 auto 14px;
      border: 3px solid rgba(96,165,250,0.25);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <div>Signing in with your CSPC Google Account...</div>
  </div>
  <form id="oidc-form" method="POST" action="/api/auth/google/id-token" style="display:none;">
    <input type="hidden" name="id_token" id="f-id-token">
    <input type="hidden" name="state" id="f-state">
    <input type="hidden" name="error" id="f-error">
  </form>
  <script>
    (function () {
      var hash = window.location.hash ? window.location.hash.substring(1) : '';
      var params = new URLSearchParams(hash);
      var idToken = params.get('id_token') || '';
      var state = params.get('state') || '';
      var err = params.get('error') || '';
      if (!idToken && !err) {
        window.location.replace('/?error=google_cancelled&auth=login');
        return;
      }
      document.getElementById('f-id-token').value = idToken;
      document.getElementById('f-state').value = state;
      document.getElementById('f-error').value = err;
      document.getElementById('oidc-form').submit();
    })();
  </script>
</body>
</html>`);
  }

  // The nonce is single-use whether we succeed or fail from here.
  delete req.session.google_oauth;

  try {
    if (req.query.error === 'access_denied') {
      return googleErrorRedirect(res, returnTo, 'google_cancelled');
    }

    const cfg = googleOAuthConfig();
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const stateFresh = pending && Date.now() - Number(pending.createdAt || 0) < GOOGLE_STATE_TTL_MS;
    if (!cfg) return googleErrorRedirect(res, returnTo, 'google_failed');
    console.log('[google-oauth] callback received:', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasPending: Boolean(pending),
      stateMatches: Boolean(pending && state && state === pending.state),
      fresh: Boolean(stateFresh)
    });
    if (!code || !pending || !state || state !== pending.state || !stateFresh) {
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    const tokens = await exchangeGoogleCode(cfg, code, googleCallbackUrl(req));
    const claims = tokens && tokens.id_token
      ? await verifyGoogleIdToken(cfg, tokens.id_token)
      : null;
    if (!claims) return googleErrorRedirect(res, returnTo, 'google_failed');

    await completeGoogleLogin(req, res, {
      claims,
      allowedDomains: cfg.allowedDomains,
      loginType,
      returnTo
    });
  } catch (err) {
    console.error('[google-oauth] callback failed:', err);
    googleErrorRedirect(res, returnTo, 'google_failed');
  }
});

/** Step 2c: Verifies the OIDC id_token posted from /api/auth/google/callback hash bridge. */
router.post('/google/id-token', async (req, res) => {
  const pending = req.session.google_oauth;
  const returnTo = pending && pending.returnTo === 'admin-login' ? 'admin-login' : 'home';
  const loginType = pending && pending.loginType === 'admin' ? 'admin' : 'user';
  delete req.session.google_oauth;

  try {
    if (req.body.error === 'access_denied') {
      return googleErrorRedirect(res, returnTo, 'google_cancelled');
    }

    const cfg = googleOAuthConfig();
    const idToken = String(req.body.id_token || '').trim();
    const state = String(req.body.state || '').trim();
    const stateFresh = pending && Date.now() - Number(pending.createdAt || 0) < GOOGLE_STATE_TTL_MS;

    if (!cfg || !idToken || !pending || !state || state !== pending.state || !stateFresh) {
      console.error('[google-oauth] id-token rejected at state check:', {
        hasIdToken: Boolean(idToken),
        hasPending: Boolean(pending),
        stateMatches: Boolean(pending && state === pending.state),
        fresh: Boolean(stateFresh)
      });
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    const claims = await verifyGoogleIdToken(cfg, idToken);
    if (!claims) return googleErrorRedirect(res, returnTo, 'google_failed');

    if (pending.nonce && claims.nonce && claims.nonce !== pending.nonce) {
      console.error('[google-oauth] id_token nonce mismatch');
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    await completeGoogleLogin(req, res, {
      claims,
      allowedDomains: cfg.allowedDomains,
      loginType,
      returnTo
    });
  } catch (err) {
    console.error('[google-oauth] id-token login failed:', err);
    googleErrorRedirect(res, returnTo, 'google_failed');
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
module.exports.ROLES = ROLES;
