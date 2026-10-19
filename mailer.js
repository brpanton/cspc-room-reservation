/**
 * Outbound email for the password-recovery flow (6-digit OTP codes).
 *
 * Uses Brevo's HTTP API (https://api.brevo.com/v3/smtp/email).
 *
 *   BREVO_API_KEY=your-brevo-api-key
 *
 * When BREVO_API_KEY is NOT configured the code is printed to the server
 * console instead, so the whole recovery flow stays testable during development.
 */
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/** Brevo API key, read from .env (loaded once by server.js via dotenv). */
function brevoApiKey() {
  return String(process.env.BREVO_API_KEY || '').trim();
}

/** True once the Brevo API key is present in .env. */
function brevoConfigured() {
  return Boolean(brevoApiKey());
}

/** Send an email via Brevo's transactional SMTP/email HTTP API. */
async function sendViaBrevo({ to, subject, text, html }) {
  const apiKey = brevoApiKey();
  const payload = {
    sender: { email: 'tuankim180@gmail.com', name: 'CSPC Reservation Portal' },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`Brevo API error (${response.status}): ${body || response.statusText}`);
    err.status = response.status;
    err.response = body;
    throw err;
  }

  return await response.json();
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
  if (!brevoConfigured()) {
    // Dev fallback: the code still "arrives" - on the server console - so the
    // flow can be exercised end to end before the Brevo API key exists.
    console.log('[mailer] Brevo API key not configured - NO EMAIL WILL BE SENT.');
    console.log('[mailer] Set BREVO_API_KEY in .env to enable email delivery.');
    console.log(`[mailer] OTP for ${email}: ${otp} (expires in ${minutes} min)`);
    return { delivered: false, reason: 'unconfigured' };
  }

  const subject = `${otp} is your password reset code`;
  const text = plainText({ name, otp, minutes });
  const html = htmlBody({ name, otp, minutes });

  // BEFORE send: log the target and sender (never the API key).
  console.log(`[mailer] sendViaBrevo BEFORE -> to=${email} from=tuankim180@gmail.com`);

  try {
    const result = await sendViaBrevo({ to: email, subject, text, html });
    // AFTER send: confirm success and surface Brevo's message id.
    console.log(`[mailer] sendViaBrevo OK -> to=${email} messageId=${result && result.messageId}`);
    return { delivered: true };
  } catch (err) {
    // Brevo API errors carry the server's reply plus status code - log all of
    // them so delivery problems are diagnosable straight from the terminal.
    console.error(`[mailer] sendViaBrevo FAILED -> to=${email}: ${err.message}`);
    if (err.response) console.error(`[mailer] Brevo response: ${err.response}`);
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

  if (!brevoConfigured()) {
    console.log('[mailer] Brevo API key not configured - password-change alert NOT sent.');
    console.log(`[mailer] Password changed for ${email} at ${stamp}`);
    return { delivered: false, reason: 'unconfigured' };
  }

  const subject = 'Your CSPC Reservation Portal password was changed';
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
    console.log(`[mailer] sendViaBrevo BEFORE -> to=${email} from=tuankim180@gmail.com`);
    const result = await sendViaBrevo({ to: email, subject, text, html });
    console.log(`[mailer] password-change alert OK -> to=${email} messageId=${result && result.messageId}`);
    return { delivered: true };
  } catch (err) {
    console.error(`[mailer] sendViaBrevo FAILED -> to=${email}: ${err.message}`);
    if (err.response) console.error(`[mailer] Brevo response: ${err.response}`);
    return { delivered: false, reason: 'error', error: err };
  }
}

module.exports = { sendPasswordResetOtp, sendPasswordChangedAlert, brevoConfigured };