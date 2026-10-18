/**
 * Outbound email for the password-recovery flow (6-digit OTP codes).
 *
 * Uses Nodemailer over SMTP. Gmail works out of the box with an "App
 * Password" (Google Account -> Security -> 2-step verification ->
 * App passwords) in .env:
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=465
 *   SMTP_USER=your.address@gmail.com
 *   SMTP_PASS=16-character-app-password
 *
 * When SMTP is NOT configured the code is printed to the server console
 * instead, so the whole recovery flow stays testable during development.
 */
const nodemailer = require('nodemailer');

/**
 * SMTP credentials, read from .env (loaded once by server.js via dotenv).
 * SMTP_USER/SMTP_PASS are the canonical names; EMAIL_USER/EMAIL_PASS are
 * accepted as aliases so either naming convention works.
 */
function smtpUser() {
  return String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
}

function smtpPass() {
  return String(process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
}

/** True once both SMTP credentials are present in .env. */
function smtpConfigured() {
  return Boolean(smtpUser() && smtpPass());
}

/** Lazily built so a missing config never crashes the server at boot. */
let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      // Gmail uses implicit TLS on 465; 587 would use STARTTLS (secure: false).
      secure: port === 465,
      auth: { user: smtpUser(), pass: smtpPass() },
      // Generous but bounded: a stuck SMTP server must not hang the route.
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });
  }
  return transporter;
}

/** Plain-text twin of the HTML body (clients that block images/HTML). */
function plainText({ name, otp, minutes }) {
  return [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    `Your password reset code is: ${otp}`,
    '',
    `The code expires in ${minutes} minutes. Enter it on the "Verify Your Email"`,
    'screen of the reservation portal to choose a new password.',
    '',
    'If you did not request this code, you can safely ignore this email -',
    'your password will not change.',
    '',
    'CSPC Lab & Room Reservation System'
  ].join('\n');
}

/** Inline-styled HTML so it renders in Gmail without any external assets. */
function htmlBody({ name, otp, minutes }) {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#0b1220;padding:28px 16px;">
    <div style="max-width:460px;margin:0 auto;background:#101a2c;border:1px solid rgba(148,163,184,.25);border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:20px 24px;">
        <p style="margin:0;color:#bfdbfe;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">CSPC Campus Facilities</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:19px;">Password reset code</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#e8f0fb;font-size:14px;">
          Hello${name ? `, ${name}` : ''}, use the 6-digit code below to reset your
          reservation portal password.
        </p>
        <div style="background:#0b1220;border:1px dashed rgba(148,163,184,.45);border-radius:12px;text-align:center;padding:18px 10px;">
          <span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#60a5fa;">${otp}</span>
        </div>
        <p style="margin:16px 0 0;color:#93a4bd;font-size:13px;">
          This code expires in <strong style="color:#e8f0fb;">${minutes} minutes</strong>.
          It can be used only once, and only after 5 wrong attempts it is invalidated.
        </p>
        <hr style="border:none;border-top:1px solid rgba(148,163,184,.2);margin:18px 0;" />
        <p style="margin:0;color:#93a4bd;font-size:12px;">
          If you did not request this code, ignore this email - your password will
          not change.
        </p>
      </div>
    </div>
  </div>`;
}

/**
 * Sends the OTP to `email`.
 * Never throws; returns { delivered: true } or
 * { delivered: false, reason: 'unconfigured' | 'error', error? }.
 */
async function sendPasswordResetOtp({ email, name, otp, minutes = 10 }) {
  if (!smtpConfigured()) {
    // Dev fallback: the code still "arrives" - on the server console - so the
    // flow can be exercised end to end before SMTP credentials exist.
    console.log('[mailer] SMTP not configured - NO EMAIL WILL BE SENT.');
    console.log('[mailer] Set SMTP_USER + SMTP_PASS (or EMAIL_USER + EMAIL_PASS) in .env to enable email.');
    console.log(`[mailer] OTP for ${email}: ${otp} (expires in ${minutes} min)`);
    return { delivered: false, reason: 'unconfigured' };
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  // BEFORE sendMail: log the target and connection details (never the password).
  console.log(`[mailer] sendMail BEFORE -> to=${email} via ${host}:${port} as=${smtpUser()}`);

  try {
    const info = await getTransporter().sendMail({
      from: process.env.MAIL_FROM || `"CSPC Reservation Portal" <${smtpUser()}>`,
      to: email,
      subject: `${otp} is your password reset code`,
      text: plainText({ name, otp, minutes }),
      html: htmlBody({ name, otp, minutes })
    });
    // AFTER sendMail: confirm success and surface Nodemailer's message id.
    console.log(`[mailer] sendMail OK -> to=${email} messageId=${info && info.messageId}`);
    return { delivered: true };
  } catch (err) {
    // Nodemailer errors carry the SMTP server's reply (e.g. Gmail's
    // "Invalid login: 535-5.7.8" or DNS "ENOTFOUND") - log the full message
    // so delivery problems are diagnosable straight from the terminal.
    console.error(`[mailer] sendMail FAILED -> to=${email}: ${err.message}`);
    return { delivered: false, reason: 'error', error: err };
  }
}

/**
 * Security alert: tells the account holder their password was changed.
 * Same never-throws contract as sendPasswordResetOtp - delivery problems are
 * reported in the return value and never fail the caller's request.
 */
async function sendPasswordChangedAlert({ email, name }) {
  const stamp = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  if (!smtpConfigured()) {
    console.log('[mailer] SMTP not configured - password-change alert NOT sent.');
    console.log(`[mailer] Password changed for ${email} at ${stamp}`);
    return { delivered: false, reason: 'unconfigured' };
  }

  const text = [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    'This confirms that the password for your CSPC Lab & Room',
    `Reservation System account was changed on ${stamp}.`,
    '',
    'If you made this change, no further action is needed.',
    'If you did NOT change your password, contact the administrator',
    'immediately - someone else may have access to your account.',
    '',
    'CSPC Lab & Room Reservation System'
  ].join('\n');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#0b1220;padding:28px 16px;">
    <div style="max-width:460px;margin:0 auto;background:#101a2c;border:1px solid rgba(148,163,184,.25);border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:20px 24px;">
        <p style="margin:0;color:#bfdbfe;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">CSPC Campus Facilities</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:19px;">Password changed</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;color:#e8f0fb;font-size:14px;">
          Hello${name ? `, ${name}` : ''}, the password for your reservation portal
          account was changed on <strong style="color:#e8f0fb;">${stamp}</strong>.
        </p>
        <hr style="border:none;border-top:1px solid rgba(148,163,184,.2);margin:18px 0;" />
        <p style="margin:0;color:#93a4bd;font-size:12px;">
          If you made this change, no further action is needed. If you did
          <strong style="color:#fca5a5;">not</strong> change your password, contact the
          administrator immediately - someone else may have access to your account.
        </p>
      </div>
    </div>
  </div>`;

  try {
    const info = await getTransporter().sendMail({
      from: process.env.MAIL_FROM || `"CSPC Reservation Portal" <${smtpUser()}>`,
      to: email,
      subject: 'Your CSPC Reservation Portal password was changed',
      text,
      html
    });
    console.log(`[mailer] password-change alert OK -> to=${email} messageId=${info && info.messageId}`);
    return { delivered: true };
  } catch (err) {
    console.error(`[mailer] password-change alert FAILED -> to=${email}: ${err.message}`);
    return { delivered: false, reason: 'error', error: err };
  }
}

module.exports = { sendPasswordResetOtp, sendPasswordChangedAlert, smtpConfigured };