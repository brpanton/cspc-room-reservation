const fs = require('fs');
fs.writeFileSync('routes/reservations.js', `/**
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

const RESERVATION_SELECT = \`
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
\`;

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
  const params = [roomId, date, endTime, startTime, ...BLOCKING_STATUSES];
  let sql = \`
    SELECT res.id, res.start_time, res.end_time, res.status, u.full_name AS requested_by
    FROM reservations res
    JOIN users u ON u.id = res.user_id
    WHERE res.room_id = \$1
      AND res.res_date = \$2
      AND res.start_time < \$3
      AND res.end_time > \$4
      AND res.status IN (\$5, \$6)\`;

  if (excludeId) {
    sql += \` AND res.id <> \$\{params.length + 1\}\`;
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
`);
console.log('Chunk 1 written');