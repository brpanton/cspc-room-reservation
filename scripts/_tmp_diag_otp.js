require('dotenv').config();
const { pool } = require('../db');
const { brevoConfigured } = require('../mailer');
(async () => {
  try {
    console.log('brevoConfigured=' + brevoConfigured());
    console.log('BREVO_API_KEY=' + (process.env.BREVO_API_KEY ? '(set)' : '(not set)'));
    const u = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    console.log('SMTP_USER=' + (u ? u.slice(0, 3) + '***' + u.slice(u.indexOf('@')) : '(missing)'));
    console.log('SMTP_PASS set=' + Boolean(process.env.SMTP_PASS || process.env.EMAIL_PASS));
    const [[c]] = await pool.query('SELECT COUNT(*) AS n FROM users');
    console.log('users count=' + c.n);
    const [r] = await pool.query(
      'SELECT id, school_id, email, recovery_email, is_active FROM users WHERE LOWER(email) LIKE ? LIMIT 5',
      ['%brpanton%']
    );
    console.log('brpanton match rows=' + r.length);
    console.log(JSON.stringify(r, null, 2));
    const [codes] = await pool.query(
      'SELECT email, created_at, expires_at, used_at, verified_at FROM password_reset_codes ORDER BY id DESC LIMIT 5'
    );
    console.log('recent reset codes=' + codes.length);
    console.log(JSON.stringify(codes, null, 2));
    await pool.end();
  } catch (e) { console.error('DBERR: ' + e.message); process.exit(1); }
})();
