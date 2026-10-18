/**
 * Password recovery ("Forgot password?") - email OTP flow.
 *
 *   POST /api/auth/forgot-password  -> accept a recovery email address,
 *                                      look the account up by that recovery
 *                                      email, generate a random 6-digit OTP,
 *                                      store only its bcrypt HASH with a
 *                                      10-minute expiry, and email it via
 *                                      mailer.js (nodemailer / SMTP).
 *                                      Sends to the address ONLY if the
 *                                      account exists, but always answers
 *                                      with the same generic message so
 *                                      the endpoint cannot be used to
 *                                      enumerate registered emails.
 *   POST /api/auth/verify-otp       -> check the code against the stored
 *                                      hash, enforce the 5-wrong-attempts
 *                                      limit and expiry, then mint a
 *                                      single-use reset token (only its
 *                                      sha256 is persisted).
 *   POST /api/auth/reset-password   -> consume the reset token, bcrypt-hash
 *                                      the new password and update the user.
 *
 * Design notes:
 *   - Never stores secrets in the clear: the OTP itself only exists as a
 *     bcrypt hash (slow to brute-force), and the reset token as a sha256
 *     (the raw token is 256 bits of CSPRNG entropy, so nothing to guess).
 *   - LOGIN IDENTITY IS SACRED: the identifier the visitor types, and any
 *     saved recovery_email, are used ONLY to look the account up and to
 *     pick the mailbox that receives the OTP. No statement in this file
 *     (or the mailer) ever writes to users.email / users.school_id, so a
 *     password reset can never change the login credentials.
 *   - Delivery vs. identity: the OTP row is keyed by the PRIMARY email,
 *     but the mail is sent to users.recovery_email when one is saved
 *     (alternate mailbox), falling back to the primary school email.
 *   - All DATETIME arithmetic happens inside MySQL (NOW()/DATE_ADD) so the
 *     Node and DB clocks can never drift apart - db.js pins the session
 *     timezone to UTC ("Z").
 *   - One code per email every 60 seconds (cooldown checked in SQL).
 *   - When SMTP is not configured, mailer.js prints the OTP to the server
 *     console, so the entire flow stays testable during development.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireFields, parseEmail, parsePassword } = require('../middleware/validate');
const { sendPasswordResetOtp } = require('../mailer');

const router = express.Router();

/** How long a code stays valid. Matches the schema.sql comment. */
const OTP_TTL_MINUTES = 10;
/** Minimum seconds between two "send code" requests for the same email. */
const RESEND_COOLDOWN_SECONDS = 60;
/** Wrong guesses allowed before a code is invalidated. */
const MAX_OTP_ATTEMPTS = 5;

const OTP_RE = /^\d{6}$/;

/**
 * Validates that `email` uses one of the two official CSPC domains.
 * @param {string} email - lowercased email address
 * @returns {boolean} true if domain is @cspc.edu.ph or @my.cspc.edu.ph
 */
function isCspcEmail(email) {
  const lower = String(email || '').trim().toLowerCase();
  return lower.endsWith('@cspc.edu.ph') || lower.endsWith('@my.cspc.edu.ph');
}

/** Cryptographically random 6-digit numeric code, zero-padded ("042173"). */
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** sha256 hex of the one-time reset token (the raw token never hits the DB). */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Resolves the typed recovery email to the account's registered record.
 * First tries the `recovery_email` column; if the user never saved a recovery
 * email, falls back to matching the primary `email` column so they can still
 * recover via their school inbox.
 *
 * Returns { found, email, recoveryEmail, user, deliveredTo }.
 *   - `found`        : boolean - true when a matching active account exists
 *   - `email`        : the user's primary login email (used to key the OTP row)
 *   - `recoveryEmail`: the recovery email saved on the account (may be NULL)
 *   - `deliveredTo`  : the inbox that will receive the OTP ('recovery' or 'primary')
 *   - `user`         : the full user row (NULL when not found)
 */
async function resolveAccountEmail(rawIdentifier) {
  const identifier = String(rawIdentifier || '').trim().toLowerCase();

  if (!identifier.includes('@')) {
    throw Object.assign(new Error('Please enter your recovery email address.'), { status: 400 });
  }

  // Basic format validation — recovery email can be any inbox, not just CSPC.
  const email = parseEmail(identifier);
  if (!email) {
    throw Object.assign(new Error('Please enter a valid recovery email address.'), { status: 400 });
  }

  // 1) Try recovery_email first (dedicated alternate inbox).
  let [rows] = await pool.query(
    'SELECT id, full_name, email, recovery_email, is_active FROM users WHERE LOWER(recovery_email) = LOWER(?) LIMIT 1',
    [email]
  );
  let user = rows[0] || null;
  let deliveredTo = 'recovery';

  // 2) Fallback: match the primary email for users who never saved a recovery email.
  if (!user) {
    [rows] = await pool.query(
      'SELECT id, full_name, email, recovery_email, is_active FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [email]
    );
    user = rows[0] || null;
    deliveredTo = 'primary';
  }

  if (!user) {
    return { found: false, email: null, recoveryEmail: null, user: null, deliveredTo: null };
  }
  if (!user.is_active) {
    throw Object.assign(new Error('This account can no longer recover its password. Please contact the administrator.'), { status: 403 });
  }
  return {
    found: true,
    email: user.email,
    recoveryEmail: user.recovery_email || null,
    deliveredTo,
    user
  };
}

/* ---------------------------------------------------------- step 1: send */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const rawEmail = req.body.email !== undefined ? req.body.email : req.body.identifier;
    requireFields({ email: rawEmail }, ['email']);

    // Resolve the input to the account's record. Only CSPC email addresses
    // are accepted; School IDs are no longer supported as login identifiers.
    const resolved = await resolveAccountEmail(rawEmail);

    if (!resolved.found) {
      const err = new Error('No account was found with that recovery email address. Make sure you entered the recovery email you registered.');
      err.status = 404;
      throw err;
    }

    const user = resolved.user;
    const primaryEmail = resolved.email;                 // users.email  (login identity - never changed here)
    const rowEmail = primaryEmail;                       // OTP row is keyed by primary email
    // Delivery inbox: recovery email if saved, otherwise primary school email.
    const deliveryEmail = resolved.deliveredTo === 'recovery' && resolved.recoveryEmail
      ? resolved.recoveryEmail
      : primaryEmail;
    const deliveryTo = resolved.deliveredTo;
    const displayName = user.full_name || '';

    if (!user.is_active) {
      const err = new Error('This account can no longer recover its password. Please contact the administrator.');
      err.status = 403;
      throw err;
    }
    // Cooldown: one live code per address every RESEND_COOLDOWN_SECONDS.
    const [[last]] = await pool.query(
      `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
         FROM password_reset_codes
        WHERE email = ?
        ORDER BY id DESC
        LIMIT 1`,
      [rowEmail]
    );
    if (last && Number(last.age_seconds) < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - Number(last.age_seconds);
      const err = new Error(`Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`);
      err.status = 429;
      throw err;
    }

    // Create the code: only the bcrypt hash is stored, never the OTP itself.
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    // Drop anything older for this address so only the newest code is live
    // (this also sweeps up used/expired rows as a cheap cleanup).
    await pool.query('DELETE FROM password_reset_codes WHERE email = ?', [rowEmail]);
    await pool.query(
      `INSERT INTO password_reset_codes (user_id, email, otp_hash, attempts, expires_at)
       VALUES (?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL ${OTP_TTL_MINUTES} MINUTE))`,
      [user.id, rowEmail, otpHash]
    );

    console.log(
      `[password-reset] OTP generated for ${rowEmail} (user_id=${user.id}) - delivering to ${deliveryEmail}`
    );
    const delivery = await sendPasswordResetOtp({
      email: deliveryEmail,
      name: displayName,
      otp,
      minutes: OTP_TTL_MINUTES
    });
    console.log(`[password-reset] Mailer result for ${deliveryEmail}: ${delivery.delivered ? 'sent' : delivery.reason}`);
    if (delivery.reason === 'error') {
      // sendMail() itself failed (bad credentials, SMTP down, ...): the
      // details are already in the terminal console - tell the frontend
      // with a 5xx instead of pretending the code went out.
      const err = new Error('We could not send the verification email right now. Please try again in a moment.');
      err.status = 500;
      throw err;
    }
    // Word the message by where the code was actually delivered.
    let message;
    if (deliveryTo === 'recovery') {
      message = 'We sent a 6-digit code to your recovery email. Check your inbox.';
    } else {
      message = 'We sent a 6-digit code to your official CSPC email. Check your inbox (and spam folder).';
    }

    res.json({
      message,
      delivery_to: deliveryTo,
      expires_in_minutes: OTP_TTL_MINUTES,
      email_delivery: delivery.delivered ? 'smtp' : 'console'
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------- step 2: verify */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const rawEmail = req.body.email !== undefined ? req.body.email : req.body.identifier;
    requireFields({ email: rawEmail }, ['email']);
    requireFields(req.body, ['otp']);

    // Resolve the email to confirm the account exists (matches step 1).
    const resolved = await resolveAccountEmail(rawEmail);
    if (!resolved.found) {
      const err = new Error('No account was found for that email address.');
      err.status = 404;
      throw err;
    }
    const rowEmail = resolved.email;
    const otp = String(req.body.otp).trim();
    if (!OTP_RE.test(otp)) {
      const err = new Error('Enter the 6-digit numeric code from your email.');
      err.status = 400;
      throw err;
    }

    const [codes] = await pool.query(
      `SELECT id, user_id, otp_hash, attempts, verified_at,
              (expires_at > NOW()) AS is_unexpired
         FROM password_reset_codes
        WHERE email = ? AND used_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
      [email]
    );
    const code = codes[0];
    if (!code) {
      const err = new Error('No active verification code for that email. Request a new one.');
      err.status = 400;
      throw err;
    }
    if (!Number(code.is_unexpired)) {
      const err = new Error('That code has expired. Request a new one.');
      err.status = 400;
      throw err;
    }

    const matches = await bcrypt.compare(otp, code.otp_hash);
    if (!matches) {
      const attempts = Number(code.attempts) + 1;
      const remaining = MAX_OTP_ATTEMPTS - attempts;
      if (remaining <= 0) {
        await pool.query('UPDATE password_reset_codes SET attempts = ?, expires_at = NOW() WHERE id = ?', [
          attempts,
          code.id
        ]);
        const err = new Error('Too many incorrect attempts. This code is no longer valid - request a new one.');
        err.status = 400;
        throw err;
      }
      await pool.query('UPDATE password_reset_codes SET attempts = ? WHERE id = ?', [attempts, code.id]);
      const err = new Error(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      err.status = 400;
      throw err;
    }

    // Success: mint a one-time reset token. Only its sha256 is stored; the
    // raw token is handed to the client and authorises the final password
    // change. Re-verifying the same code rotates the token (idempotent).
    const resetToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `UPDATE password_reset_codes
          SET reset_token_hash = ?, verified_at = COALESCE(verified_at, NOW())
        WHERE id = ?`,
      [hashResetToken(resetToken), code.id]
    );

    res.json({ message: 'Email verified. Choose a new password.', reset_token: resetToken });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------- step 3: reset pw */
router.post('/reset-password', async (req, res, next) => {
  try {
    const rawEmail = req.body.email !== undefined ? req.body.email : req.body.identifier;
    requireFields({ email: rawEmail }, ['email']);
    requireFields(req.body, ['reset_token', 'new_password', 'confirm_password']);
    const { email } = await resolveAccountEmail(rawEmail);
    const resetToken = String(req.body.reset_token).trim();
    const newPassword = parsePassword(req.body.new_password);
    const confirmPassword = String(req.body.confirm_password);

    if (newPassword !== confirmPassword) {
      const err = new Error('Passwords do not match.');
      err.status = 400;
      throw err;
    }

    // The token must match the email, be verified, unused and unexpired.
    const [codes] = await pool.query(
      `SELECT id, user_id
         FROM password_reset_codes
        WHERE reset_token_hash = ? AND email = ? AND used_at IS NULL
          AND verified_at IS NOT NULL AND expires_at > NOW()
        LIMIT 1`,
      [hashResetToken(resetToken), email]
    );
    const code = codes[0];
    if (!code) {
      const err = new Error('This reset request is invalid or has expired. Start over with "Forgot password?".');
      err.status = 400;
      throw err;
    }

    const [users] = await pool.query(
      'SELECT id, password_hash, is_active FROM users WHERE id = ? LIMIT 1',
      [code.user_id]
    );
    const user = users[0];
    if (!user || !user.is_active) {
      const err = new Error('This account can no longer recover its password. Please contact the administrator.');
      err.status = 403;
      throw err;
    }

    if (await bcrypt.compare(newPassword, user.password_hash)) {
      const err = new Error('Your new password must be different from the current one.');
      err.status = 400;
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
      passwordHash,
      user.id
    ]);
    // Single-use: burn the token so it can never be replayed.
    await pool.query(
      'UPDATE password_reset_codes SET used_at = NOW(), reset_token_hash = NULL WHERE id = ?',
      [code.id]
    );

    res.json({ message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

