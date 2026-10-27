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
      if (countErr.code === '42P01') {
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
    const firstName = fullName.split(/\s+/)[0] || 'there';
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
      'UPDATE users SET password_hash = $1, must_change_password = 0 WHERE id = $2',
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

/** Returns null until GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set in .env. */
function googleOAuthConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;

  // Default covers both domains: @cspc.edu.ph (faculty/staff) and
  // @my.cspc.edu.ph (students). Subdomains of any listed domain also match.
  let allowedDomains = String(process.env.GOOGLE_ALLOWED_DOMAINS || 'cspc.edu.ph,my.cspc.edu.ph')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  if (!allowedDomains.length) allowedDomains = ['cspc.edu.ph', 'my.cspc.edu.ph'];
  return { clientId, clientSecret, allowedDomains };
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
  if (claims.email_verified !== 'true') {
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

/** Frontend gate: lets the button keep its friendly "not configured" toast. */
router.get('/google/config', (_req, res) => {
  res.json({ configured: Boolean(googleOAuthConfig()) });
});

/** Step 1: start the flow - random state nonce, then off to Google. */
router.get('/google', (req, res, next) => {
  try {
    const cfg = googleOAuthConfig();
    const returnTo = req.query.return === 'admin-login' ? 'admin-login' : 'home';
    if (!cfg) return googleErrorRedirect(res, returnTo, 'google_not_configured');

    const state = crypto.randomBytes(24).toString('hex');
    req.session.google_oauth = {
      state,
      loginType: req.query.type === 'admin' ? 'admin' : 'user',
      returnTo,
      createdAt: Date.now()
    };

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: googleCallbackUrl(req),
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state
    });
    res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  } catch (err) {
    next(err);
  }
});

/** Step 2: Google sends the user back - verify everything, then log them in. */
router.get('/google/callback', async (req, res) => {
  const pending = req.session.google_oauth;
  const returnTo = pending && pending.returnTo === 'admin-login' ? 'admin-login' : 'home';
  const loginType = pending && pending.loginType === 'admin' ? 'admin' : 'user';
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
    if (!cfg) return googleErrorRedirect(res, returnTo, 'google_not_configured');
    console.log('[google-oauth] callback received:', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasPending: Boolean(pending),
      stateMatches: Boolean(pending && state && state === pending.state),
      fresh: Boolean(stateFresh)
    });
    if (!code || !pending || !state || state !== pending.state || !stateFresh) {
      console.error('[google-oauth] rejected at state check:', {
        reason: !code ? 'missing code'
          : !pending ? 'missing session (state nonce not found - session cookie lost?)'
          : !state || state !== pending.state ? 'state mismatch'
          : 'state expired (>10 min)'
      });
      return googleErrorRedirect(res, returnTo, 'google_failed');
    }

    const tokens = await exchangeGoogleCode(cfg, code, googleCallbackUrl(req));
    if (!tokens || !tokens.id_token) {
      console.error('[google-oauth] no id_token in token response:', tokens ? Object.keys(tokens) : 'no tokens');
    }
    const claims = tokens && tokens.id_token
      ? await verifyGoogleIdToken(cfg, tokens.id_token)
      : null;
    if (!claims) return googleErrorRedirect(res, returnTo, 'google_failed');

    const email = String(claims.email).trim().toLowerCase();
    // Match the exact domain or any subdomain of an allowed domain, so
    // school-issued addresses like students@cspc.edu.ph also qualify.
    const emailDomain = email.split('@')[1] || '';
    const domainAllowed = cfg.allowedDomains.some(
      (domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`)
    );
    if (!domainAllowed) {
      console.warn('[google-oauth] rejected account outside allowed domains:', {
        email,
        allowedDomains: cfg.allowedDomains
      });
      return googleErrorRedirect(res, returnTo, 'google_domain', { email });
    }

    // Match by Google subject first, then by email so people who already
    // registered with their school ID + password get linked instead of duplicated.
    let rows = await pool.query('SELECT * FROM users WHERE google_sub = $1 LIMIT 1', [claims.sub]);
    rows = rows.rows;
    if (!rows.length) {
      rows = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
      rows = rows.rows;
    }

    let isNewAccount = false;
    if (!rows.length) {
      // First Google sign-in for this address: auto-provision a student
      // account. Admins/custodians must still be created by an administrator.
      if (loginType === 'admin') return googleErrorRedirect(res, returnTo, 'google_forbidden');

      const schoolId = `GOOG-${claims.sub}`;
      const fullName = String(
        claims.name || `${claims.given_name || ''} ${claims.family_name || ''}`.trim() || email
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
        // 23505 = unique_violation: an account for this email appeared between
        // our SELECT and INSERT - re-read it and continue as the matching flow below.
        if (insertErr.code !== '23505') throw insertErr;
        rows = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
        rows = rows.rows;
      }
      if (!rows.length) {
        const created = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
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

    // Remember the Google subject so future sign-ins match even if the
    // address is renamed, and keep the first-login greeting working.
    let loginCount = Number(row.login_count || 0) + (isNewAccount ? 0 : 1);
    if (!isNewAccount) {
      try {
        await pool.query('UPDATE users SET google_sub = $1, login_count = $2 WHERE id = $3', [
          claims.sub,
          loginCount,
          row.id
        ]);
      } catch (countErr) {
        // Older DBs without the google_sub/login_count columns still work:
        // fall back to comparing the creation date (new row ~= first login).
        if (countErr.code !== '42P01') throw countErr;
        const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
        loginCount = Date.now() - createdAt < 5 * 60 * 1000 ? 1 : 2;
      }
    }
    row.login_count = loginCount;

    const user = publicUser(row);
    // Brand-new session id (session-fixation hygiene), saved to the durable
    // PostgreSQL-backed store BEFORE the redirect: the 302 that follows already
    // carries the HttpOnly cspc.sid cookie, so /dashboard.html - and every
    // page refresh after it, even across server restarts - finds the login.
    await startAuthenticatedSession(req, user);

    res.redirect(user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html');
  } catch (err) {
    // This is a browser navigation, so fall back to the page-level error
    // instead of dumping JSON at the user.
    console.error('[google-oauth] callback failed:', err);
    googleErrorRedirect(res, returnTo, 'google_failed');
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
module.exports.ROLES = ROLES;
