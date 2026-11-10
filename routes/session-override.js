/**
 * Early Check-Out & Admin Session Override Module with Two-Way Real-Time Notifications.
 *
 * Mounted at /api in server.js:
 *   PATCH  /api/reservations/:id/check-in          -> User/Staff marks session as Checked-In (Active)
 *   PATCH  /api/reservations/:id/early-checkout    -> User ends session early, frees lab to Available, alerts Admin
 *   PATCH  /api/reservations/:id/force-terminate   -> Admin overrides/terminates active session with required reason, alerts User
 *   GET    /api/notifications                      -> Poll unread + recent notifications & active sessions for current user/admin
 *   PATCH  /api/notifications/:id/read             -> Mark a single notification as read/acknowledged
 *   PATCH  /api/notifications/read-all             -> Mark all notifications for current user/role as read
 *   GET    /api/notifications/stream               -> Server-Sent Events (SSE) real-time push stream for instant alerts
 *   GET    /api/admin/session-logs                 -> Admin audit log of early check-outs & session overrides + active sessions
 */
'use strict';

const express = require('express');
const pool = require('../db');
const { requireLogin, requireStaff, requireAdmin, canManageReservation } = require('../middleware/auth');
const { RESERVATION_SELECT, shape } = require('./reservations');

const router = express.Router();

// ============================================================================
// REAL-TIME SERVER-SENT EVENTS (SSE) BROADCACT HUB
// ============================================================================
const sseClients = new Set();

/**
 * Push a real-time event to connected browser clients via SSE.
 * @param {string} eventType - e.g. 'early_checkout', 'session_terminated', 'room_status_updated'
 * @param {object} payload   - JSON-serializable payload
 * @param {(client: {userId: number, role: string}) => boolean} [filterFn]
 */
function broadcastSseEvent(eventType, payload, filterFn = null) {
  const dataStr = JSON.stringify({ type: eventType, ...payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      if (typeof filterFn === 'function' && !filterFn(client)) continue;
      client.res.write(`event: ${eventType}\n`);
      client.res.write(`data: ${dataStr}\n\n`);
      // Also emit a generic 'notification' event so default onmessage listeners receive it
      client.res.write(`data: ${dataStr}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ============================================================================
// SCHEMA INITIALIZATION & MIGRATION
// ============================================================================
async function ensureSessionOverrideSchema() {
  await pool.query(`
    ALTER TABLE reservations
      ALTER COLUMN status TYPE VARCHAR(30),
      ADD COLUMN IF NOT EXISTS scheduled_start    TIMESTAMP  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS scheduled_end      TIMESTAMP  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS actual_check_in    TIMESTAMP  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS actual_check_out   TIMESTAMP  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS session_status     VARCHAR(40) NOT NULL DEFAULT 'Scheduled',
      ADD COLUMN IF NOT EXISTS termination_reason TEXT       DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS terminated_by      INT        DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL;

    DO $$
    BEGIN
      ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
      ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
        CHECK (status IN ('Pending','Approved','Rejected','Cancelled','Completed Early','Terminated by Admin'));

      ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_session_status_check;
      ALTER TABLE reservations ADD CONSTRAINT reservations_session_status_check
        CHECK (session_status IN ('Scheduled','Active','Checked Out Early','Completed','Terminated by Admin','Cancelled'));
    END $$;

    UPDATE reservations
    SET scheduled_start = (res_date::text || ' ' || start_time::text)::timestamp,
        scheduled_end   = (res_date::text || ' ' || end_time::text)::timestamp
    WHERE scheduled_start IS NULL OR scheduled_end IS NULL;

    CREATE TABLE IF NOT EXISTS session_notifications (
      id                 SERIAL PRIMARY KEY,
      reservation_id     INT          NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      room_id            INT          NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      actor_id           INT          DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      recipient_role     VARCHAR(20)  NOT NULL CHECK (recipient_role IN ('admin', 'user', 'staff')),
      recipient_user_id  INT          DEFAULT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type         VARCHAR(40)  NOT NULL CHECK (event_type IN ('EARLY_CHECKOUT', 'ADMIN_TERMINATED', 'SESSION_CHECKIN', 'ROOM_STATUS_RESTORED')),
      title              VARCHAR(180) NOT NULL,
      message            TEXT         NOT NULL,
      reason             TEXT         DEFAULT NULL,
      room_after_status  VARCHAR(30)  DEFAULT 'Available',
      actual_time        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_read            BOOLEAN      NOT NULL DEFAULT FALSE,
      read_at            TIMESTAMP    DEFAULT NULL,
      created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_snotif_recipient_role ON session_notifications(recipient_role, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snotif_recipient_user ON session_notifications(recipient_user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snotif_reservation    ON session_notifications(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_snotif_event_type     ON session_notifications(event_type);
  `);
}

function safeRelease(conn) {
  if (conn && typeof conn.release === 'function') {
    try {
      conn.release();
    } catch {
      /* ignore */
    }
  }
}

function formatTime12h(hhmmss) {
  const str = String(hhmmss || '').slice(0, 5);
  const [h, m] = str.split(':').map(Number);
  if (Number.isNaN(h)) return str;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr12 = h % 12 || 12;
  return `${hr12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

// ============================================================================
// 1. REAL-TIME SSE STREAM: GET /api/notifications/stream
// ============================================================================
router.get('/notifications/stream', requireLogin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const client = {
    userId: Number(req.session.user.id),
    role: String(req.session.user.role || 'student'),
    res
  };
  sseClients.add(client);

  // Initial handshake event
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, userId: client.userId, role: client.role })}\n\n`);

  // Keep-alive heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// ============================================================================
// 2. USER SESSION CHECK-IN: PATCH /api/reservations/:id/check-in
// ============================================================================
router.patch('/reservations/:id/check-in', requireLogin, async (req, res, next) => {
  const resId = Number(req.params.id);
  if (!Number.isInteger(resId) || resId < 1) {
    return res.status(404).json({ error: 'Reservation not found.' });
  }

  let conn;
  try {
    conn = await pool.connect();
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT res.*, r.name AS room_name, b.name AS building_name, u.full_name AS user_name, u.school_id
       FROM reservations res
       JOIN rooms r ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = res.user_id
       WHERE res.id = $1
       FOR UPDATE OF res`,
      [resId]
    );

    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = rows[0];
    if (!canManageReservation(req.session.user, reservation)) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only check in to your own reservation.' });
    }

    if (reservation.status !== 'Approved') {
      await conn.query('ROLLBACK');
      return res.status(409).json({
        error: `Only Approved reservations can be checked into (current status: ${reservation.status}).`
      });
    }

    if (reservation.session_status === 'Checked Out Early' || reservation.session_status === 'Terminated by Admin') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'This session has already ended.' });
    }

    await conn.query(
      `UPDATE reservations
       SET actual_check_in = COALESCE(actual_check_in, NOW()),
           session_status = 'Active'
       WHERE id = $1`,
      [resId]
    );

    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, 'Checked In', 'User started laboratory session')`,
      [resId, req.session.user.id]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [resId]);
    const shaped = updatedRows[0] ? shape(updatedRows[0]) : null;

    broadcastSseEvent('session_checkin', {
      reservation_id: resId,
      room_id: reservation.room_id,
      room_name: reservation.room_name,
      user_name: reservation.user_name,
      reservation: shaped
    });

    res.json({
      message: `Checked in to ${reservation.room_name}. Session is now Active.`,
      reservation: shaped
    });
  } catch (err) {
    if (conn) {
      try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    safeRelease(conn);
  }
});

// ============================================================================
// 3. USER EARLY CHECK-OUT: PATCH /api/reservations/:id/early-checkout
// ============================================================================
router.patch('/reservations/:id/early-checkout', requireLogin, async (req, res, next) => {
  const resId = Number(req.params.id);
  if (!Number.isInteger(resId) || resId < 1) {
    return res.status(404).json({ error: 'Reservation not found.' });
  }

  let conn;
  try {
    conn = await pool.connect();
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT res.*, r.name AS room_name, b.id AS building_id, b.name AS building_name,
              u.full_name AS user_name, u.school_id AS user_school_id
       FROM reservations res
       JOIN rooms r ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = res.user_id
       WHERE res.id = $1
       FOR UPDATE OF res`,
      [resId]
    );

    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = rows[0];
    if (!canManageReservation(req.session.user, reservation)) {
      await conn.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only check out of your own active reservation.' });
    }

    if (reservation.status === 'Completed Early' || reservation.session_status === 'Checked Out Early') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'This reservation has already been checked out early.' });
    }

    if (reservation.status === 'Terminated by Admin' || reservation.session_status === 'Terminated by Admin') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'This session was already terminated by an administrator.' });
    }

    if (reservation.status !== 'Approved') {
      await conn.query('ROLLBACK');
      return res.status(409).json({
        error: `Only active Approved reservations can be checked out early (current status: ${reservation.status}).`
      });
    }

    const userRemarks = req.body && req.body.remarks
      ? String(req.body.remarks).trim().slice(0, 255)
      : 'Session ended early by user (Early Check-Out)';

    // 1. Update reservation: record actual_check_out, mark session_status = 'Checked Out Early',
    //    and set status = 'Completed Early' so the lab slot is immediately freed back to Available.
    const { rows: updRows } = await conn.query(
      `UPDATE reservations
       SET status = 'Completed Early',
           session_status = 'Checked Out Early',
           actual_check_in = COALESCE(actual_check_in, LEAST(NOW(), COALESCE(scheduled_start, NOW()))),
           actual_check_out = NOW(),
           remarks = $1
       WHERE id = $2
       RETURNING actual_check_out`,
      [userRemarks, resId]
    );

    const actualCheckOut = updRows[0]?.actual_check_out || new Date();

    // 2. Ensure the laboratory room is active/available
    await conn.query(
      `UPDATE rooms SET is_active = TRUE WHERE id = $1`,
      [reservation.room_id]
    );

    // 3. Log in reservation_logs
    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, 'Checked Out Early', $3)`,
      [resId, req.session.user.id, userRemarks]
    );

    // 4. Create Two-Way Notification for Admin Panel
    const notifTitle = `Lab Vacated Early: ${reservation.room_name}`;
    const scheduledWindow = `${formatTime12h(reservation.start_time)} – ${formatTime12h(reservation.end_time)}`;
    const notifMessage =
      `${reservation.user_name} (${reservation.user_school_id}) ended Reservation #${resId} ` +
      `(${reservation.transaction_code || 'N/A'}) early for ${reservation.room_name} (${reservation.building_name}). ` +
      `Scheduled: ${scheduledWindow}. Laboratory status is now back to Available.`;

    const { rows: notifRows } = await conn.query(
      `INSERT INTO session_notifications
         (reservation_id, room_id, actor_id, recipient_role, recipient_user_id,
          event_type, title, message, reason, room_after_status, actual_time)
       VALUES ($1, $2, $3, 'admin', NULL, 'EARLY_CHECKOUT', $4, $5, $6, 'Available', $7)
       RETURNING *`,
      [resId, reservation.room_id, req.session.user.id, notifTitle, notifMessage, userRemarks, actualCheckOut]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [resId]);
    const shaped = updatedRows[0] ? shape(updatedRows[0]) : null;

    const enrichedNotification = {
      ...notifRows[0],
      transaction_code: reservation.transaction_code,
      room_name: reservation.room_name,
      building_name: reservation.building_name,
      user_name: reservation.user_name,
      user_school_id: reservation.user_school_id,
      actor_name: req.session.user.full_name,
      res_date: reservation.res_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time
    };

    // 5. Real-time push to Admin/Staff dashboards and public Room Status views
    broadcastSseEvent(
      'early_checkout',
      {
        notification: enrichedNotification,
        reservation: shaped,
        room_id: reservation.room_id,
        room_name: reservation.room_name,
        building_name: reservation.building_name,
        user_name: reservation.user_name,
        actual_check_out: actualCheckOut
      },
      (client) => client.role === 'admin' || client.role === 'custodian' || client.userId === Number(reservation.user_id)
    );

    broadcastSseEvent('room_status_updated', {
      room_id: reservation.room_id,
      room_name: reservation.room_name,
      new_status: 'Available',
      reason: 'Early Check-Out'
    });

    res.json({
      message: `Checked out early from ${reservation.room_name}. The laboratory is now marked as Available and the Admin has been notified.`,
      reservation: shaped,
      notification: enrichedNotification,
      actual_check_out: actualCheckOut
    });
  } catch (err) {
    if (conn) {
      try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    safeRelease(conn);
  }
});

// ============================================================================
// 4. ADMIN FORCE TERMINATION / OVERRIDE: PATCH /api/reservations/:id/force-terminate
// ============================================================================
async function handleAdminForceTerminate(req, res, next) {
  const resId = Number(req.params.id);
  if (!Number.isInteger(resId) || resId < 1) {
    return res.status(404).json({ error: 'Reservation not found.' });
  }

  const rawReason = req.body && (req.body.reason || req.body.termination_reason);
  const reason = String(rawReason || '').trim();
  if (!reason || reason.length < 5) {
    return res.status(400).json({
      error: 'A "Reason for Termination" (at least 5 characters) is required to override or force-end a session.'
    });
  }

  const roomStatusAfter =
    req.body && req.body.room_status_after === 'Under Maintenance'
      ? 'Under Maintenance'
      : 'Available';

  let conn;
  try {
    conn = await pool.connect();
    await conn.query('BEGIN');

    const { rows } = await conn.query(
      `SELECT res.*, r.name AS room_name, r.building_id, r.image_url AS room_image_url,
              b.name AS building_name,
              u.full_name AS user_name, u.school_id AS user_school_id, u.email AS user_email
       FROM reservations res
       JOIN rooms r ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = res.user_id
       WHERE res.id = $1
       FOR UPDATE OF res`,
      [resId]
    );

    if (!rows.length) {
      await conn.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const reservation = rows[0];

    if (reservation.status === 'Terminated by Admin' || reservation.session_status === 'Terminated by Admin') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'This reservation has already been terminated by an administrator.' });
    }

    if (reservation.status === 'Completed Early' || reservation.session_status === 'Checked Out Early') {
      await conn.query('ROLLBACK');
      return res.status(409).json({ error: 'This session was already checked out early by the user.' });
    }

    if (reservation.status === 'Cancelled' || reservation.status === 'Rejected') {
      await conn.query('ROLLBACK');
      return res.status(409).json({
        error: `Cannot terminate a reservation that is already ${reservation.status.toLowerCase()}.`
      });
    }

    const adminUser = req.session.user;
    const remarksSummary = `Terminated by Admin (${adminUser.full_name}): ${reason}`.slice(0, 255);

    // 1. Update reservation status to 'Terminated by Admin'
    const { rows: updRows } = await conn.query(
      `UPDATE reservations
       SET status = 'Terminated by Admin',
           session_status = 'Terminated by Admin',
           actual_check_out = NOW(),
           termination_reason = $1,
           terminated_by = $2,
           remarks = $3,
           decided_at = NOW()
       WHERE id = $4
       RETURNING actual_check_out`,
      [reason, adminUser.id, remarksSummary, resId]
    );

    const terminatedAt = updRows[0]?.actual_check_out || new Date();

    // 2. Update laboratory status: either back to 'Available' OR place 'Under Maintenance'
    let maintenanceRecord = null;
    if (roomStatusAfter === 'Under Maintenance') {
      const maintHours = Math.max(1, Math.min(72, Number(req.body.maintenance_hours) || 4));
      const { rows: maintRows } = await conn.query(
        `INSERT INTO maintenance_logs
           (target_type, room_id, building_id, title, description, start_time, end_time, status, display_mode, banner_image_url, created_by)
         VALUES
           ('room', $1, $2, $3, $4, NOW(), NOW() + ($5 || ' hours')::interval, 'Ongoing', 'both', $6, $7)
         RETURNING *`,
        [
          reservation.room_id,
          reservation.building_id,
          `${reservation.room_name} — Emergency / Administrative Override Maintenance`,
          `Session #${resId} was terminated by Administrator ${adminUser.full_name}. Reason: ${reason}`,
          String(maintHours),
          reservation.room_image_url || '/img/cs-lab.jpg',
          adminUser.id
        ]
      );
      maintenanceRecord = maintRows[0] || null;
    } else {
      await conn.query(`UPDATE rooms SET is_active = TRUE WHERE id = $1`, [reservation.room_id]);
    }

    // 3. Log in reservation_logs
    await conn.query(
      `INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES ($1, $2, 'Terminated by Admin', $3)`,
      [resId, adminUser.id, remarksSummary]
    );

    // 4. Log in admin_audit_logs if actor is admin
    if (adminUser.role === 'admin') {
      await conn.query(
        `INSERT INTO admin_audit_logs (actor_admin_id, target_admin_id, action, details)
         VALUES ($1, NULL, 'force_terminated_session', $2)`,
        [
          adminUser.id,
          `Force-terminated Reservation #${resId} (${reservation.room_name}) for ${reservation.user_name} (${reservation.user_school_id}). Reason: ${reason}. Lab set to: ${roomStatusAfter}.`
        ]
      );
    }

    // 5. Create Immediate Notification for the Affected User
    const notifTitle = `Session Terminated by Admin — ${reservation.room_name}`;
    const scheduledWindow = `${formatTime12h(reservation.start_time)} – ${formatTime12h(reservation.end_time)}`;
    const notifMessage =
      `Your laboratory session in ${reservation.room_name} (${reservation.building_name}) scheduled for ` +
      `${scheduledWindow} (Reservation #${resId}) was cut short by Administrator ${adminUser.full_name}. ` +
      `Laboratory status is now set to "${roomStatusAfter}".`;

    const { rows: notifRows } = await conn.query(
      `INSERT INTO session_notifications
         (reservation_id, room_id, actor_id, recipient_role, recipient_user_id,
          event_type, title, message, reason, room_after_status, actual_time)
       VALUES ($1, $2, $3, 'user', $4, 'ADMIN_TERMINATED', $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        resId,
        reservation.room_id,
        adminUser.id,
        reservation.user_id,
        notifTitle,
        notifMessage,
        reason,
        roomStatusAfter,
        terminatedAt
      ]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(`${RESERVATION_SELECT} WHERE res.id = $1`, [resId]);
    const shaped = updatedRows[0] ? shape(updatedRows[0]) : null;

    const enrichedNotification = {
      ...notifRows[0],
      transaction_code: reservation.transaction_code,
      room_name: reservation.room_name,
      building_name: reservation.building_name,
      user_name: reservation.user_name,
      user_school_id: reservation.user_school_id,
      actor_name: adminUser.full_name,
      res_date: reservation.res_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time
    };

    // 6. Real-time push to the Affected User AND Admin panels
    broadcastSseEvent(
      'session_terminated',
      {
        notification: enrichedNotification,
        reservation: shaped,
        room_id: reservation.room_id,
        room_name: reservation.room_name,
        building_name: reservation.building_name,
        reason,
        room_after_status: roomStatusAfter,
        terminated_by_name: adminUser.full_name,
        terminated_at: terminatedAt
      },
      (client) =>
        client.userId === Number(reservation.user_id) ||
        client.role === 'admin' ||
        client.role === 'custodian'
    );

    broadcastSseEvent('room_status_updated', {
      room_id: reservation.room_id,
      room_name: reservation.room_name,
      new_status: roomStatusAfter,
      reason: 'Admin Session Override'
    });

    res.json({
      message: `Reservation #${resId} for ${reservation.room_name} has been terminated. ${reservation.user_name} has been notified immediately.`,
      reservation: shaped,
      notification: enrichedNotification,
      maintenance: maintenanceRecord
    });
  } catch (err) {
    if (conn) {
      try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
    }
    next(err);
  } finally {
    safeRelease(conn);
  }
}

router.patch('/reservations/:id/force-terminate', requireStaff, handleAdminForceTerminate);
router.post('/admin/reservations/:id/terminate', requireAdmin, handleAdminForceTerminate);

// ============================================================================
// 5. NOTIFICATIONS POLLING & MANAGEMENT: GET / PATCH /api/notifications
// ============================================================================
router.get('/notifications', requireLogin, async (req, res, next) => {
  try {
    const user = req.session.user;
    const isStaffOrAdmin = user.role === 'admin' || user.role === 'custodian';
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));

    let whereSql;
    const params = [];

    if (isStaffOrAdmin) {
      // Admins see all admin/staff alerts (like user EARLY_CHECKOUT) plus any ADMIN_TERMINATED audit logs
      whereSql = `WHERE (sn.recipient_role IN ('admin', 'staff') OR sn.recipient_user_id = $1 OR sn.event_type IN ('EARLY_CHECKOUT', 'ADMIN_TERMINATED'))`;
      params.push(user.id);
    } else {
      // Students/Faculty see notifications addressed to them (e.g. ADMIN_TERMINATED) plus their own early check-out confirmations
      whereSql = `WHERE (sn.recipient_user_id = $1 OR (sn.actor_id = $1 AND sn.event_type = 'EARLY_CHECKOUT'))`;
      params.push(user.id);
    }

    if (req.query.unread_only === '1') {
      whereSql += ` AND sn.is_read = FALSE`;
    }

    params.push(limit);

    const { rows: notifications } = await pool.query(
      `SELECT sn.*,
              res.transaction_code, res.res_date, res.start_time, res.end_time,
              res.status AS reservation_status, res.session_status,
              res.actual_check_in, res.actual_check_out, res.termination_reason,
              r.name AS room_name, b.name AS building_name,
              u.full_name AS user_name, u.school_id AS user_school_id,
              actor.full_name AS actor_name, actor.role AS actor_role
       FROM session_notifications sn
       JOIN reservations res ON res.id = sn.reservation_id
       JOIN rooms r ON r.id = sn.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = res.user_id
       LEFT JOIN users actor ON actor.id = sn.actor_id
       ${whereSql}
       ORDER BY sn.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    // Count unread notifications specifically targeted at this user/role
    const unreadQuery = isStaffOrAdmin
      ? `SELECT COUNT(*) AS cnt FROM session_notifications WHERE recipient_role IN ('admin', 'staff') AND is_read = FALSE`
      : `SELECT COUNT(*) AS cnt FROM session_notifications WHERE recipient_user_id = $1 AND is_read = FALSE`;
    const unreadParams = isStaffOrAdmin ? [] : [user.id];
    const { rows: unreadRows } = await pool.query(unreadQuery, unreadParams);

    res.json({
      notifications,
      unread_count: Number(unreadRows[0]?.cnt || 0)
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', requireLogin, async (req, res, next) => {
  try {
    const notifId = Number(req.params.id);
    if (!Number.isInteger(notifId) || notifId < 1) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const user = req.session.user;
    const isStaffOrAdmin = user.role === 'admin' || user.role === 'custodian';

    const { rows } = await pool.query(
      `UPDATE session_notifications
       SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
       WHERE id = $1
         AND ($2::boolean = TRUE OR recipient_user_id = $3 OR actor_id = $3)
       RETURNING *`,
      [notifId, isStaffOrAdmin, user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ message: 'Notification marked as read.', notification: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/read-all', requireLogin, async (req, res, next) => {
  try {
    const user = req.session.user;
    const isStaffOrAdmin = user.role === 'admin' || user.role === 'custodian';

    if (isStaffOrAdmin) {
      await pool.query(
        `UPDATE session_notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
         WHERE (recipient_role IN ('admin', 'staff') OR recipient_user_id = $1) AND is_read = FALSE`,
        [user.id]
      );
    } else {
      await pool.query(
        `UPDATE session_notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
         WHERE (recipient_user_id = $1 OR actor_id = $1) AND is_read = FALSE`,
        [user.id]
      );
    }

    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. ADMIN SESSION OVERRIDE & AUDIT LOGS: GET /api/admin/session-logs
// ============================================================================
router.get('/admin/session-logs', requireStaff, async (req, res, next) => {
  try {
    const [logsRes, activeRes] = await Promise.all([
      pool.query(
        `SELECT sn.*,
                res.transaction_code, res.res_date, res.start_time, res.end_time,
                res.purpose, res.status AS reservation_status, res.session_status,
                res.actual_check_in, res.actual_check_out, res.termination_reason,
                r.name AS room_name, r.floor AS room_floor,
                b.name AS building_name,
                u.full_name AS user_name, u.school_id AS user_school_id, u.role AS user_role,
                actor.full_name AS actor_name, actor.role AS actor_role
         FROM session_notifications sn
         JOIN reservations res ON res.id = sn.reservation_id
         JOIN rooms r ON r.id = sn.room_id
         JOIN buildings b ON b.id = r.building_id
         JOIN users u ON u.id = res.user_id
         LEFT JOIN users actor ON actor.id = sn.actor_id
         ORDER BY sn.created_at DESC
         LIMIT 150`
      ),
      pool.query(
        `${RESERVATION_SELECT}
         WHERE res.status = 'Approved'
           AND COALESCE(res.session_status, 'Scheduled') NOT IN ('Checked Out Early', 'Terminated by Admin', 'Completed', 'Cancelled')
         ORDER BY
           CASE WHEN res.res_date = CURRENT_DATE THEN 0 ELSE 1 END,
           res.res_date ASC,
           res.start_time ASC
         LIMIT 50`
      )
    ]);

    res.json({
      logs: logsRes.rows,
      active_sessions: activeRes.rows.map(shape)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ensureSessionOverrideSchema = ensureSessionOverrideSchema;
module.exports.broadcastSseEvent = broadcastSseEvent;

