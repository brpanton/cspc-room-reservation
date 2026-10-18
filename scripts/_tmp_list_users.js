require('dotenv').config();
const { pool } = require('../db');
(async () => {
  try {
    const [r] = await pool.query('SELECT id, school_id, email, is_active, created_at FROM users ORDER BY id LIMIT 10');
    console.log('users=' + r.length);
    r.forEach(u => console.log('- id=' + u.id + ' school_id=' + u.school_id + ' email=' + u.email + ' active=' + u.is_active));
    await pool.end();
  } catch (e) { console.error('DBERR: ' + e.message); process.exit(1); }
})();
