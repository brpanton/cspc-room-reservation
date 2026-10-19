const fs = require('fs');
fs.appendFileSync('routes/reservations.js', `
// ---------------------------------------------------------------- list ---
router.get('/', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const user = req.session.user;
    const params = [];
    let where = '';

    if (user.role === 'staff' || user.role === 'admin' || user.role === 'custodian') {
      where = 'WHERE 1=1';
    } else {
      where = 'WHERE res.user_id = \$1';
      params.push(user.id);
    }

    const { rows } = await pool.query(\`\${RESERVATION_SELECT} \${where} ORDER BY res.res_date DESC, res.start_time DESC\`, params);
    res.json({ reservations: rows.map(shape) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- stats ---
router.get('/stats', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const totals = await pool.query(
      'SELECT status, COUNT(*) AS cnt FROM reservations GROUP BY status'
    );
    const today = await pool.query(
      'SELECT COUNT(*) AS today_count FROM reservations WHERE res_date = CURRENT_DATE'
    );
    const upcoming = await pool.query(
      'SELECT COUNT(*) AS upcoming_count FROM reservations WHERE res_date > CURRENT_DATE'
    );

    const inventory = {};
    for (const t of totals.rows) {
      inventory[t.status.toLowerCase()] = Number(t.cnt);
    }
    inventory.total = Number(totals.rows.reduce((sum, t) => sum + Number(t.cnt), 0));

    const usersRows = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    inventory.total_users = usersRows[0].total_users;

    res.json({
      totals: {
        total: Number(totals.total || 0),
        pending: Number(totals.pending || 0),
        approved: Number(totals.approved || 0),
        rejected: Number(totals.rejected || 0),
        cancelled: Number(totals.cancelled || 0)
      },
      today: Number(today.today_count || 0),
      upcoming: Number(upcoming.upcoming_count || 0),
      inventory
    });
  } catch (err) {
    next(err);
  }
});
`);
console.log('Chunk 3 written');