const pool = require('../db');
(async () => {
  const { rows } = await pool.query(
    'SELECT b.id, b.name AS building_name, COUNT(res.id) AS total_reservations ' +
    'FROM buildings b LEFT JOIN rooms r ON r.building_id = b.id ' +
    'LEFT JOIN reservations res ON res.room_id = r.id ' +
    'GROUP BY b.id, b.name ORDER BY total_reservations DESC LIMIT 3'
  );
  console.log(JSON.stringify(rows));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
