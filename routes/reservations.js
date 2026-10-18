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
const { pool } = require('../db');
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

/** Statuses that make a room unavailable. Kept in sync with routes/rooms.js. */
const BLOCKING_STATUSES = ['Pending', 'Approved'];

/** Every reservation is returned with this projection for consistent JSON. */
const RESERVATION_SELECT = `
  SELECT res.id, res.room_id, res.user_id, res.res_date, res.start_time, res.end_time,
         res.purpose, res.attendees, res.status, res.approved_by, res.remarks, res.decided_at,
         res.created_at,
         r.name AS room_name, r.room_type, r.capacity,
         b.id AS building_id, b.name AS building_name,
         u.full_name AS requested_by, u.school_id AS requester_school_id,
         u.role AS requester_role,
         a.full_name AS approved_by_name,
         GROUP_CONCAT(e.equipment ORDER BY e.equipment SEPARATOR ',') AS equipment
  FROM reservations res
  JOIN rooms r       ON r.id = res.room_id
  JOIN buildings b   ON b.id = r.building_id
  JOIN users u       ON u.id = res.user_id
  LEFT JOIN users a  ON a.id = res.approved_by
  LEFT JOIN reservation_equipment e ON e.reservation_id = res.id
`;

/** Turns the comma-joined equipment column into a real array. */
function shape(row) {
  return {
    ...row,
    equipment: row.equipment ? row.equipment.split(',') : []
  };
}

/**
 * Finds a reservation on the same room/date whose time range overlaps the
 * requested one. Two ranges overlap when  a.start < b.end AND a.end > b.start.
 * The row is locked FOR UPDATE so two simultaneous submissions cannot both pass.
 */
async function findConflict(conn, { roomId, date, startTime, endTime, excludeId = null }) {
  const params = [roomId, date, endTime, startTime, ...BLOCKING_STATUSES];
  let sql = `
    SELECT res.id, res.start_time, res.end_time, res.status, u.full_name AS requested_by
    FROM reservations res
    JOIN users u ON u.id = res.user_id
    WHERE res.room_id = ?
      AND res.res_date = ?
      AND res.start_time < ?
      AND res.end_time > ?
      AND res.status IN (?, ?)`;

  if (excludeId) {
    sql += ' AND res.id <> ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1 FOR UPDATE';

  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

/** Reads the equipment checkbox list from either an array or a JSON string. */
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
  const conn = await pool.getConnection();
  try {
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

    // Make sure the room exists and can actually hold the group.
    const [roomRows] = await conn.query(
      'SELECT id, name, capacity FROM rooms WHERE id = ? AND is_active = 1',
      [roomId]
    );
    if (!roomRows.length) {
      const err = new Error('The selected room does not exist or is no longer available.');
      err.status = 404;
      throw err;
    }
    if (attendees > roomRows[0].capacity) {
      const err = new Error(
        `"${roomRows[0].name}" only seats ${roomRows[0].capacity} people, but ${attendees} attendees were given.`
      );
      err.status = 400;
      throw err;
    }

    await conn.beginTransaction();

    const conflict = await findConflict(conn, { roomId, date, startTime, endTime });
    if (conflict) {
      const err = new Error(
        `"${roomRows[0].name}" is already booked on ${date} from ` +
        `${String(conflict.start_time).slice(0, 5)} to ${String(conflict.end_time).slice(0, 5)} ` +
        `(${conflict.status}). Please choose another time or room.`
      );
      err.status = 409;
      err.code = 'DOUBLE_BOOKING';
      throw err;
    }

    const [ins] = await conn.query(
      `INSERT INTO reservations
         (room_id, user_id, res_date, start_time, end_time, purpose, attendees, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [roomId, req.session.user.id, date, startTime, endTime, purpose, attendees]
    );

    for (const item of equipment) {
      await conn.query(
        'INSERT INTO reservation_equipment (reservation_id, equipment) VALUES (?, ?)',
        [ins.insertId, item]
      );
    }

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (?, ?, 'Submitted', 'Reservation submitted for approval')`,
      [ins.insertId, req.session.user.id]
    );

    await conn.commit();

    const [rows] = await pool.query(`${RESERVATION_SELECT} WHERE res.id = ?`, [ins.insertId]);
    res.status(201).json({
      message: 'Reservation submitted. It is now Pending for custodian approval.',
      reservation: shape(rows[0])
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* transaction was never started - nothing to roll back */
    }
    next(err);
  } finally {
    conn.release();
  }
});

// ------------------------------------------------------------------ list ---
router.get('/', async (req, res, next) => {
  try {
    const user = req.session.user;
    const params = [];
    const clauses = [];

    // Students and faculty only ever see their own requests.
    if (user.role !== 'admin' && user.role !== 'custodian') {
      clauses.push('res.user_id = ?');
      params.push(user.id);
    } else if (req.query.mine === '1') {
      clauses.push('res.user_id = ?');
      params.push(user.id);
    }

    if (req.query.status) {
      clauses.push('res.status = ?');
      params.push(oneOf(req.query.status, STATUSES, 'status'));
    }
    if (req.query.date) {
      clauses.push('res.res_date = ?');
      params.push(parseDate(req.query.date, 'date'));
    }
    if (req.query.room_id) {
      clauses.push('res.room_id = ?');
      params.push(Number(req.query.room_id));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const [rows] = await pool.query(
      `${RESERVATION_SELECT} ${where} ORDER BY res.res_date DESC, res.start_time DESC LIMIT ${limit}`,
      params
    );

    res.json({ reservations: rows.map(shape), count: rows.length });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------ statistics ---
router.get('/stats', async (req, res, next) => {
  try {
    const user = req.session.user;
    const isStaff = user.role === 'admin' || user.role === 'custodian';
    const scope = isStaff ? '' : 'WHERE res.user_id = ?';
    const scopeParams = isStaff ? [] : [user.id];

    const [[totals]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(res.status = 'Pending'), 0)   AS pending,
         COALESCE(SUM(res.status = 'Approved'), 0)  AS approved,
         COALESCE(SUM(res.status = 'Rejected'), 0)  AS rejected,
         COALESCE(SUM(res.status = 'Cancelled'), 0) AS cancelled
       FROM reservations res ${scope}`,
      scopeParams
    );

    const [[today]] = await pool.query(
      `SELECT COUNT(*) AS today_count
       FROM reservations res
       WHERE res.res_date = CURDATE() AND res.status = 'Approved'
       ${isStaff ? '' : 'AND res.user_id = ?'}`,
      scopeParams
    );

    const [[upcoming]] = await pool.query(
      `SELECT COUNT(*) AS upcoming_count
       FROM reservations res
       WHERE res.res_date >= CURDATE() AND res.status IN ('Pending','Approved')
       ${isStaff ? '' : 'AND res.user_id = ?'}`,
      scopeParams
    );

    let inventory = { total_rooms: 0, total_buildings: 0, total_users: 0 };
    if (isStaff) {
      const [[rooms]] = await pool.query('SELECT COUNT(*) AS total_rooms FROM rooms WHERE is_active = 1');
      const [[buildings]] = await pool.query('SELECT COUNT(*) AS total_buildings FROM buildings');
      inventory = { ...inventory, ...rooms, ...buildings };
    }
    if (user.role === 'admin') {
      const [[users]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
      inventory.total_users = users.total_users;
    }

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

// ----------------------------------------------------------- single item ---
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${RESERVATION_SELECT} WHERE res.id = ?`, [req.params.id]);
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
  const conn = await pool.getConnection();
  try {
    requireFields(req.body, ['status']);
    const status = oneOf(req.body.status, ['Approved', 'Rejected'], 'status');
    const remarks = req.body.remarks ? String(req.body.remarks).trim().slice(0, 255) : null;

    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM reservations WHERE id = ? FOR UPDATE',
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

    // Approving must re-check availability: another request may have been
    // approved for the same slot while this one sat in the pending queue.
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
       SET status = ?, approved_by = ?, remarks = ?, decided_at = NOW()
       WHERE id = ?`,
      [status, req.session.user.id, remarks, reservation.id]
    );

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (?, ?, ?, ?)`,
      [reservation.id, req.session.user.id, status, remarks]
    );

    await conn.commit();

    const [updated] = await pool.query(`${RESERVATION_SELECT} WHERE res.id = ?`, [reservation.id]);
    res.json({
      message: `Reservation #${reservation.id} has been ${status.toLowerCase()}.`,
      reservation: shape(updated[0])
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* nothing to roll back */
    }
    next(err);
  } finally {
    conn.release();
  }
});

// ----------------------------------------------------------------- cancel ---
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found.' });

    const reservation = rows[0];
    if (!canManageReservation(req.session.user, reservation)) {
      return res.status(403).json({ error: 'You can only cancel your own reservations.' });
    }
    if (reservation.status === 'Cancelled') {
      return res.status(409).json({ error: 'This reservation is already cancelled.' });
    }

    const remarks = req.body && req.body.remarks
      ? String(req.body.remarks).trim().slice(0, 255)
      : `Cancelled by ${req.session.user.full_name}`;

    await pool.query(
      `UPDATE reservations SET status = 'Cancelled', decided_at = NOW(), remarks = ? WHERE id = ?`,
      [remarks, reservation.id]
    );
    await pool.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (?, ?, 'Cancelled', ?)`,
      [reservation.id, req.session.user.id, remarks]
    );

    res.json({ message: `Reservation #${reservation.id} has been cancelled.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.BLOCKING_STATUSES = BLOCKING_STATUSES;
module.exports.RESERVATION_SELECT = RESERVATION_SELECT;
module.exports.shape = shape;
module.exports.findConflict = findConflict;
module.exports.parseEquipment = parseEquipment;
