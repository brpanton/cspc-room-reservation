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
const { findMaintenanceConflict } = require('./maintenance');
const { broadcastSseEvent } = require('./session-override');
const { sendReservationApprovalNotification } = require('../mailer');

const router = express.Router();

// Reject non-numeric :id values up front (e.g. /api/reservations/abc) with a
// clean 404 instead of letting PostgreSQL throw 'invalid input syntax for
// type integer' and surfacing it as a 500.
router.param('id', (req, res, next, id) => {
  if (/^\d+$/.test(String(id))) return next();
  return res.status(404).json({ error: 'Not found.' });
});

const BLOCKING_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'Pending', 'Approved'];
const { RESERVATION_SELECT, toDateIso, shape } = require('./reservation-queries');

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
  const statusPlaceholders = BLOCKING_STATUSES.map((_, i) => `$${i + 5}`).join(', ');
  const params = [roomId, date, endTime, startTime, ...BLOCKING_STATUSES];
  let sql = `
    SELECT res.id, res.start_time, res.end_time, res.status, u.full_name AS requested_by
    FROM reservations res
    JOIN users u ON u.id = res.user_id
    WHERE res.room_id = $1
      AND res.res_date = $2::date
      AND res.start_time < $3::time
      AND res.end_time > $4::time
      AND res.status IN (${statusPlaceholders})`;

  if (excludeId) {
    params.push(excludeId);
    sql += ` AND res.id <> $${params.length}`;
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
  let conn;
  try {
    conn = await pool.connect();
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

    const maintConflict = await findMaintenanceConflict(conn, { roomId, date, startTime, endTime });
    if (maintConflict) {
      const endStr = new Date(maintConflict.end_time).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      const err = new Error(
        `${roomRows[0].name} is under maintenance ("${maintConflict.title}") until ${endStr}. ` +
        `Reservations are blocked during this maintenance window.`
      );
      err.status = 409;
      err.code = 'MAINTENANCE_CONFLICT';
      throw err;
    }

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
      `SELECT COUNT(*) AS cnt FROM reservations WHERE res_date = $1::date`,
      [date]
    );
    const seq = String(Number(countRows[0]?.cnt || 0) + 1).padStart(5, '0');
    const transactionCode = `CSPC-${todayStr}-${seq}`;

    const { rows } = await conn.query(
      `INSERT INTO reservations
         (room_id, user_id, res_date, start_time, end_time, purpose, attendees, status, transaction_code,
          scheduled_start, scheduled_end, session_status)
       VALUES ($1::int, $2::int, $3::date, $4::time, $5::time, $6::text, $7::int, 'PENDING_APPROVAL', $8::text,
               ($3::date + $4::time)::timestamp,
               ($3::date + $5::time)::timestamp,
               'Scheduled') RETURNING id`,
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
      `SELECT res.id, res.transaction_code, TO_CHAR(res.res_date, 'YYYY-MM-DD') AS res_date, res.start_time, res.end_time,
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
      status: 'PENDING_APPROVAL',
      ticket_unlocked: false,
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

    if (req.query.status) {
      params.push(String(req.query.status).trim());
      where += ` AND res.status = $${params.length}`;
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
      const key = String(t.status || '').toLowerCase().replace(/\s+/g, '_');
      inventory[key] = Number(t.cnt);
    }
    inventory.total = Number(totals.rows.reduce((sum, t) => sum + Number(t.cnt), 0));

    const usersRows = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    inventory.total_users = Number(usersRows.rows[0]?.total_users || 0);

    res.json({
      totals: {
        total: inventory.total || 0,
        pending: (inventory.pending_approval || 0) + (inventory.pending || 0),
        approved: inventory.approved || 0,
        rejected: inventory.rejected || 0,
        cancelled: inventory.cancelled || 0,
        completed_early: inventory.completed_early || 0,
        terminated_by_admin: inventory.terminated_by_admin || 0
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

// ------------------------------------------------------------ ticket ---
/**
 * GET /api/reservations/:id/ticket
 *
 * Admin Approval Gate:
 * A reservation must be explicitly accepted/approved by an Admin before a user
 * can view, download, or print their reservation ticket.
 * Returns 403 Forbidden if the reservation status is not APPROVED.
 */
router.get('/:id/ticket', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const { rows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = rows[0];

    // Ownership check: user can only access their own ticket unless staff/admin
    if (!canManageReservation(req.session.user, reservation)) {
      return res.status(403).json({ error: 'You can only view your own reservation ticket.' });
    }

    // Admin Approval Gate: Must be explicitly APPROVED
    const statusUpper = String(reservation.status || '').toUpperCase();
    const isApproved = statusUpper === 'APPROVED';

    if (!isApproved) {
      return res.status(403).json({
        error: 'Your reservation request is pending administrator review. Ticket generation will be available once approved.',
        status: reservation.status,
        unlocked: false
      });
    }

    // Unlocked ticket payload
    const { rows: eqRows } = await pool.query(
      'SELECT equipment FROM reservation_equipment WHERE reservation_id = $1',
      [reservation.id]
    );

    const ticket = {
      id: reservation.id,
      transaction_code: reservation.transaction_code,
      status: reservation.status,
      room_id: reservation.room_id,
      room_name: reservation.room_name,
      room_type: reservation.room_type,
      capacity: reservation.capacity,
      building_id: reservation.building_id,
      building_name: reservation.building_name,
      res_date: toDateIso(reservation.res_date),
      start_time: String(reservation.start_time).slice(0, 8),
      end_time: String(reservation.end_time).slice(0, 8),
      purpose: reservation.purpose,
      attendees: reservation.attendees,
      requested_by: reservation.requested_by,
      requester_school_id: reservation.requester_school_id,
      requester_role: reservation.requester_role,
      equipment: eqRows.map((e) => e.equipment),
      remarks: reservation.remarks,
      approved_by: reservation.approved_by,
      approved_by_name: reservation.approved_by_name,
      decided_at: reservation.decided_at,
      created_at: reservation.created_at,
      unlocked: true
    };

    res.json({
      message: 'Reservation ticket generated successfully.',
      unlocked: true,
      ticket,
      reservation: shape(reservation)
    });
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
    const rawStatus = oneOf(req.body.status, ['Approved', 'Rejected', 'APPROVED', 'REJECTED'], 'status');
    const normalizedStatus = (rawStatus === 'Approved' || rawStatus === 'APPROVED') ? 'APPROVED' : 'REJECTED';
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

    const curStatus = String(reservation.status || '').toUpperCase();
    if (curStatus === 'APPROVED' || curStatus === 'REJECTED') {
      const err = new Error(
        `This reservation has already been ${reservation.status.toLowerCase()}.`
      );
      err.status = 409;
      throw err;
    }
    if (curStatus === 'CANCELLED') {
      const err = new Error('This reservation was cancelled and can no longer be decided on.');
      err.status = 409;
      throw err;
    }

    if (normalizedStatus === 'APPROVED') {
      const resDateIso = toDateIso(reservation.res_date);
      const startTimeStr = String(reservation.start_time).slice(0, 8);
      const endTimeStr = String(reservation.end_time).slice(0, 8);

      const maintConflict = await findMaintenanceConflict(conn, {
        roomId: reservation.room_id,
        date: resDateIso,
        startTime: startTimeStr,
        endTime: endTimeStr
      });
      if (maintConflict) {
        const err = new Error(
          `Cannot approve: the room or building is under maintenance ("${maintConflict.title}") during that window.`
        );
        err.status = 409;
        err.code = 'MAINTENANCE_CONFLICT';
        throw err;
      }

      const conflict = await findConflict(conn, {
        roomId: reservation.room_id,
        date: resDateIso,
        startTime: startTimeStr,
        endTime: endTimeStr,
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
      [normalizedStatus, req.session.user.id, remarks, reservation.id]
    );

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, $3, $4)`,
      [reservation.id, req.session.user.id, normalizedStatus, remarks]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [reservation.id]);
    const updatedReservation = updatedRows[0] || null;
    if (!updatedReservation) {
      const err = new Error('Failed to fetch updated reservation.');
      err.status = 500;
      throw err;
    }

    const shaped = shape(updatedReservation);

    // Notification & Unlocking
    if (normalizedStatus === 'APPROVED') {
      // 1. Two-way notification
      try {
        const notifTitle = `Reservation Approved — ${updatedReservation.room_name}`;
        const notifMessage = `Your reservation #${reservation.id} for ${updatedReservation.room_name} on ${toDateIso(reservation.res_date)} has been approved by the Administrator. Your reservation ticket is now unlocked and available to view, print, or download.`;
        const { rows: notifRows } = await pool.query(
          `INSERT INTO session_notifications
             (reservation_id, room_id, actor_id, recipient_role, recipient_user_id,
              event_type, title, message, room_after_status, actual_time)
           VALUES ($1, $2, $3, 'user', $4, 'RESERVATION_APPROVED', $5, $6, 'Booked', NOW())
           RETURNING *`,
          [
            reservation.id,
            reservation.room_id,
            req.session.user.id,
            reservation.user_id,
            notifTitle,
            notifMessage
          ]
        );
        if (typeof broadcastSseEvent === 'function') {
          broadcastSseEvent('reservation_approved', {
            notification: notifRows[0] || null,
            reservation: shaped,
            ticket_unlocked: true
          }, (c) => Number(c.userId) === Number(reservation.user_id));
        }
      } catch (notifErr) {
        console.error('[notification] Approval notification error:', notifErr.message);
      }

      // 2. Email notification via mailer
      try {
        let userEmail = updatedReservation.requester_email;
        if (!userEmail) {
          const { rows: uRows } = await pool.query('SELECT email, full_name FROM users WHERE id = $1', [reservation.user_id]);
          if (uRows.length) userEmail = uRows[0].email;
        }
        if (userEmail) {
          sendReservationApprovalNotification({
            email: userEmail,
            name: updatedReservation.requested_by,
            reservationId: reservation.id,
            roomName: updatedReservation.room_name,
            buildingName: updatedReservation.building_name,
            resDate: toDateIso(reservation.res_date),
            startTime: String(reservation.start_time).slice(0, 5),
            endTime: String(reservation.end_time).slice(0, 5),
            transactionCode: reservation.transaction_code
          }).catch(err => console.error('[mailer] Async email error:', err.message));
        }
      } catch (emailErr) {
        console.error('[mailer] Error preparing approval email:', emailErr.message);
      }
    } else if (normalizedStatus === 'REJECTED') {
      try {
        const notifTitle = `Reservation Rejected — ${updatedReservation.room_name}`;
        const notifMessage = `Your reservation request #${reservation.id} for ${updatedReservation.room_name} was not approved.${remarks ? ' Remarks: ' + remarks : ''}`;
        await pool.query(
          `INSERT INTO session_notifications
             (reservation_id, room_id, actor_id, recipient_role, recipient_user_id,
              event_type, title, message, room_after_status, reason, actual_time)
           VALUES ($1, $2, $3, 'user', $4, 'RESERVATION_REJECTED', $5, $6, 'Available', $7, NOW())`,
          [
            reservation.id,
            reservation.room_id,
            req.session.user.id,
            reservation.user_id,
            notifTitle,
            notifMessage,
            remarks
          ]
        );
        if (typeof broadcastSseEvent === 'function') {
          broadcastSseEvent('reservation_rejected', {
            reservation: shaped
          }, (c) => Number(c.userId) === Number(reservation.user_id));
        }
      } catch (notifErr) {
        console.error('[notification] Reject notification error:', notifErr.message);
      }
    }

    res.json({
      message: `Reservation #${reservation.id} has been ${normalizedStatus.toLowerCase()}.`,
      reservation: shaped
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

    const curStatus = String(reservation.status || '').toUpperCase();
    if (curStatus === 'CANCELLED') {
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
        `UPDATE reservations SET status = 'CANCELLED', session_status = 'Cancelled', decided_at = NOW(), remarks = $1 WHERE id = $2`,
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
