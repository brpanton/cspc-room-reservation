/**
 * Reservation lifecycle.
 *
 *  POST   /api/reservations                -> create (status = 'Pending')
 *  GET    /api/reservations                -> list, scoped by role
 *  GET    /api/reservations/stats          -> dashboard statistics
 *  GET    /api/reservations/:id            -> single reservation (owner or staff)
 *  PATCH  /api/reservations/:id/decision   -> Approve / Reject (custodian, admin)
 *  PATCH  /api/reservations/:id/cancel     -> Cancel (owner or staff)
 */
const express = require('express');
const pool = require('../db');

const { requireLogin, requireStaff, canManageReservation } = require('../middleware/auth');
const {
  requireFields,
  parseDate,
  parseTime,
  toMinutes,
  assertNotPast,
  parseIntInRange,
  oneOf,
  EQUIPMENT_TYPES,
  STATUSES
} = require('../middleware/validate');

const router = express.Router();

const BLOCKING_STATUSES = ['Pending', 'Approved'];

const RESERVATION_SELECT = `
  SELECT res.id, res.room_id, res.user_id, res.res_date, res.start_time, res.end_time,
         res.purpose, res.attendees, res.status, res.approved_by, res.remarks, res.decided_at,
         res.created_at,
         r.name AS room_name, r.room_type, r.capacity,
         b.id AS building_id, b.name AS building_name,
         u.full_name AS requested_by, u.school_id AS requester_school_id,
         u.role AS requester_role,
         a.full_name AS approved_by_name
  FROM reservations res
  JOIN rooms r       ON r.id = res.room_id
  JOIN buildings b   ON b.id = r.building_id
  JOIN users u       ON u.id = res.user_id
  LEFT JOIN users a  ON a.id = res.approved_by
  LEFT JOIN reservation_equipment e ON e.reservation_id = res.id
`;

function shape(row) {
  return {
    ...row,
    equipment: row.equipment ? row.equipment.split(',') : []
  };
}

function requireSession(req, res) {
  if (!req.session || !req.session.user) {
    res.status(401).json({ error: 'Not authenticated. Please log in.' });
    return false;
  }
  return true;
}

function safeRelease(conn) {
  if (conn && typeof conn.release === 'function') {
    try { conn.release(); } catch { /* release failure must not crash the request */ }
  }
}

async function findConflict(conn, { roomId, date, startTime, endTime, excludeId = null }) {
  const params = [roomId, date, startTime, endTime, ...BLOCKING_STATUSES];
  let sql = `
    SELECT res.id, res.start_time, res.end_time, res.status, u.full_name AS requested_by
    FROM reservations res
    JOIN users u ON u.id = res.user_id
    WHERE res.room_id = $1
      AND res.res_date = $2
      AND res.start_time < $3
      AND res.end_time > $4
      AND res.status IN ($5, $6)`;

  if (excludeId) {
    sql += ` AND res.id <> $${params.length + 1}`;
    params.push(excludeId);
  }
  sql += ' LIMIT 1 FOR UPDATE';

  const { rows } = await conn.query(sql, params);
  return rows[0] || null;
}

function parseEquipment(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  let list = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        list = trimmed.split(',');
      }
    } else {
      list = trimmed.split(',');
    }
  }
  if (!Array.isArray(list)) list = [list];

  return [...new Set(
    list
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => oneOf(item, EQUIPMENT_TYPES, 'equipment'))
  )];
}

router.use(requireLogin);

// ---------------------------------------------------------------- create ---
router.post('/', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const conn = await pool.connect();
    requireFields(req.body, ['room_id', 'res_date', 'start_time', 'end_time', 'purpose']);

    const roomId = parseIntInRange(req.body.room_id, { min: 1, fieldName: 'room_id' });
    const date = parseDate(req.body.res_date, 'date');
    const startTime = parseTime(req.body.start_time, 'start_time');
    const endTime = parseTime(req.body.end_time, 'end_time');
    const purpose = String(req.body.purpose).trim();
    const attendees = req.body.attendees
      ? parseIntInRange(req.body.attendees, { min: 1, max: 5000, fieldName: 'attendees' })
      : 1;
    const equipment = parseEquipment(req.body.equipment);

    if (purpose.length < 10) {
      const err = new Error('Please describe the purpose of use in at least 10 characters.');
      err.status = 400;
      throw err;
    }
    if (purpose.length > 2000) {
      const err = new Error('Purpose must be 2000 characters or fewer.');
      err.status = 400;
      throw err;
    }
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      const err = new Error('End time must be later than start time.');
      err.status = 400;
      throw err;
    }
    assertNotPast(date, 'date');

    const { rows: roomRows } = await conn.query(
      'SELECT id, name, capacity FROM rooms WHERE id = $1 AND is_active = TRUE',
      [roomId]
    );
    if (!roomRows.length) {
      const err = new Error('The selected room does not exist or is no longer available.');
      err.status = 404;
      throw err;
    }
    if (attendees > roomRows[0].capacity) {
      const err = new Error(
        `${roomRows[0].name} only seats ${roomRows[0].capacity} people, but ${attendees} attendees were given.`
      );
      err.status = 400;
      throw err;
    }

    await conn.query('BEGIN');

    const conflict = await findConflict(conn, { roomId, date, startTime, endTime });
    if (conflict) {
      const err = new Error(
        `${roomRows[0].name} is already booked on ${date} from ` +
        `${String(conflict.start_time).slice(0, 5)} to ${String(conflict.end_time).slice(0, 5)} ` +
        `(${conflict.status}). Please choose another time or room.`
      );
      err.status = 409;
      err.code = 'DOUBLE_BOOKING';
      throw err;
    }

    /* ---- generate transaction code: CSPC-YYYYMMDD-XXXXX ---- */
    const todayStr = date.replace(/-/g, '');
    const { rows: countRows } = await conn.query(
      `SELECT COUNT(*) AS cnt FROM reservations WHERE res_date = $1`,
      [date]
    );
    const seq = String(Number(countRows[0]?.cnt || 0) + 1).padStart(5, '0');
    const transactionCode = `CSPC-${todayStr}-${seq}`;

    const { rows } = await conn.query(
      `INSERT INTO reservations
         (room_id, user_id, res_date, start_time, end_time, purpose, attendees, status, transaction_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8) RETURNING id`,
      [roomId, req.session.user.id, date, startTime, endTime, purpose, attendees, transactionCode]
    );

    const reservationId = rows[0]?.id;
    if (!reservationId) {
      const err = new Error('Failed to create reservation.');
      err.status = 500;
      throw err;
    }

    for (const item of equipment) {
      await conn.query(
        'INSERT INTO reservation_equipment (reservation_id, equipment) VALUES ($1, $2)',
        [reservationId, item]
      );
    }

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, 'Submitted', 'Reservation submitted for approval')`,
      [reservationId, req.session.user.id]
    );

    await conn.query('COMMIT');

    /* ---- fetch full reservation details for the success/ticket page ---- */
    const { rows: detailRows } = await pool.query(
      `SELECT res.id, res.transaction_code, res.res_date, res.start_time, res.end_time,
              res.purpose, res.attendees, res.status,
              r.name AS room_name, r.room_type, r.capacity,
              b.id AS building_id, b.name AS building_name,
              u.full_name AS requested_by, u.school_id AS requester_school_id
       FROM reservations res
       JOIN rooms r ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = res.user_id
       WHERE res.id = $1`,
      [reservationId]
    );

    res.status(201).json({
      message: 'Reservation submitted successfully.',
      reservationId,
      transactionCode,
      reservation: detailRows[0]
    });
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      /* nothing to roll back */
    }
    next(err);
  } finally {
    safeRelease(conn);
  }
});

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
      where = 'WHERE res.user_id = $1';
      params.push(user.id);
    }

    const { rows } = await pool.query(`${RESERVATION_SELECT} ${where} ORDER BY res.res_date DESC, res.start_time DESC`, params);
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
    inventory.total_users = usersRows[0]?.total_users || 0;

    res.json({
      totals: {
        total: inventory.total || 0,
        pending: inventory.pending || 0,
        approved: inventory.approved || 0,
        rejected: inventory.rejected || 0,
        cancelled: inventory.cancelled || 0
      },
      today: today.rows[0]?.today_count || 0,
      upcoming: upcoming.rows[0]?.upcoming_count || 0,
      inventory
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------- single item ---
router.get('/:id', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const { rows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found.' });

    const reservation = rows[0];
    if (!canManageReservation(req.session.user, reservation)) {
      return res.status(403).json({ error: 'You can only view your own reservations.' });
    }
    res.json({ reservation: shape(reservation) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------- approve/reject ---
router.patch('/:id/decision', requireStaff, async (req, res, next) => {
  if (!requireSession(req, res)) return;
  let conn;
  try {
    conn = await pool.connect();
    requireFields(req.body, ['status']);
    const status = oneOf(req.body.status, ['Approved', 'Rejected'], 'status');
    const remarks = req.body.remarks ? String(req.body.remarks).trim().slice(0, 255) : null;

    await conn.query('BEGIN');

    const { rows } = await conn.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!rows.length) {
      const err = new Error('Reservation not found.');
      err.status = 404;
      throw err;
    }
    const reservation = rows[0];

    if (reservation.status === 'Approved' || reservation.status === 'Rejected') {
      const err = new Error(
        `This reservation has already been ${reservation.status.toLowerCase()}.`
      );
      err.status = 409;
      throw err;
    }
    if (reservation.status === 'Cancelled') {
      const err = new Error('This reservation was cancelled and can no longer be decided on.');
      err.status = 409;
      throw err;
    }

    if (status === 'Approved') {
      const conflict = await findConflict(conn, {
        roomId: reservation.room_id,
        date: reservation.res_date,
        startTime: reservation.start_time,
        endTime: reservation.end_time,
        excludeId: reservation.id
      });
      if (conflict) {
        const err = new Error(
          `Cannot approve: an overlapping reservation (ID #${conflict.id}, ${conflict.status}) ` +
          'already occupies that slot.'
        );
        err.status = 409;
        err.code = 'DOUBLE_BOOKING';
        throw err;
      }
    }

    await conn.query(
      `UPDATE reservations
       SET status = $1, approved_by = $2, remarks = $3, decided_at = NOW()
       WHERE id = $4`,
      [status, req.session.user.id, remarks, reservation.id]
    );

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, $3, $4)`,
      [reservation.id, req.session.user.id, status, remarks]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [reservation.id]);
    const updatedReservation = updatedRows[0] || null;
    if (!updatedReservation) {
      const err = new Error('Failed to fetch updated reservation.');
      err.status = 500;
      throw err;
    }
    res.json({
      message: `Reservation #${reservation.id} has been ${status.toLowerCase()}.`,
      reservation: shape(updatedReservation)
    });
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      /* nothing to roll back */
    }
    next(err);
  } finally {
    safeRelease(conn);
  }
});

// ----------------------------------------------------------------- cancel ---
router.patch('/:id/cancel', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  let conn;
  try {
    conn = await pool.connect();
    await conn.query('BEGIN');

    const { rows } = await conn.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await conn.query('ROLLBACK');
      conn.release();
      conn = undefined;
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = rows[0];
    if (!reservation) {
      await conn.query('ROLLBACK');
      conn.release();
      conn = undefined;
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    if (!canManageReservation(req.session.user, reservation)) {
      await conn.query('ROLLBACK');
      conn.release();
      conn = undefined;
      return res.status(403).json({ error: 'You can only cancel your own reservations.' });
    }

    if (reservation.status === 'Cancelled') {
      await conn.query('ROLLBACK');
      conn.release();
      conn = undefined;
      return res.status(409).json({ error: 'This reservation is already cancelled.' });
    }

    const remarks = req.body && req.body.remarks
      ? String(req.body.remarks).trim().slice(0, 255)
      : `Cancelled by ${req.session.user.full_name}`;

    try {
      await conn.query(
        `UPDATE reservations SET status = 'Cancelled', decided_at = NOW(), remarks = $1 WHERE id = $2`,
        [remarks, reservation.id]
      );
    } catch (updateErr) {
      await conn.query('ROLLBACK');
      conn.release();
      conn = undefined;
      return res.status(500).json({ error: 'Failed to cancel reservation. Please try again.' });
    }

    // Log insert is best-effort: a failure here must not undo the cancellation.
    try {
      await conn.query(
        `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
         VALUES ($1, $2, 'Cancelled', $3)`,
        [reservation.id, req.session.user.id, remarks]
      );
    } catch (logErr) {
      console.error('Failed to write cancellation log:', logErr.message);
    }

    try {
      await conn.query('COMMIT');
    } catch (commitErr) {
      console.error('Failed to commit cancellation:', commitErr.message);
      conn.release();
      conn = undefined;
      return res.status(500).json({ error: 'Failed to cancel reservation. Please try again.' });
    }

    conn.release();
    conn = undefined;

    res.json({ message: `Reservation #${reservation.id} has been cancelled.` });
  } catch (err) {
    if (conn) {
      try {
        await conn.query('ROLLBACK');
      } catch {
        /* nothing to roll back */
      }
      try { conn.release(); } catch { /* release failure */ }
    }
    res.status(500).json({ error: 'Failed to cancel reservation. Please try again.' });
  } finally {
    if (conn) {
      try { conn.release(); } catch { /* release failure */ }
    }
  }
});

module.exports = router;
module.exports.BLOCKING_STATUSES = BLOCKING_STATUSES;
module.exports.RESERVATION_SELECT = RESERVATION_SELECT;
module.exports.shape = shape;
module.exports.findConflict = findConflict;
module.exports.parseEquipment = parseEquipment;
