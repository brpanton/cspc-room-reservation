/**
 * Room catalogue + real-time availability.
 *
 *  GET  /api/buildings                 -> list of buildings (public)
 *  GET  /api/rooms                     -> rooms, optionally ?building_id= (public)
 *  GET  /api/rooms/:id                 -> single room detail (public)
 *  GET  /api/availability              -> booked slots for a date (public)
 *
 * The availability endpoint is what powers rooms-status.html and the live
 * preview panel on reservation-form.html, so it must never leak another
 * user's reason for booking - only the time range and status.
 */
const express = require('express');
const { pool } = require('../db');
const { requireFields, parseDate, todayIso } = require('../middleware/validate');

const router = express.Router();

/** Statuses that occupy a room. Rejected/Cancelled requests free the slot. */
const BLOCKING_STATUSES = ['Pending', 'Approved'];

router.get('/buildings', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.name, b.location, COUNT(r.id) AS room_count
       FROM buildings b
       LEFT JOIN rooms r ON r.building_id = b.id AND r.is_active = 1
       GROUP BY b.id, b.name, b.location
       ORDER BY b.name`
    );
    res.json({ buildings: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/buildings/top-popular
 *
 * Top 3 buildings ranked by total reservations across all their rooms.
 * Database query (MySQL):
 *   SELECT b.id, b.name AS building_name, b.location,
 *          COUNT(DISTINCT CASE WHEN r.is_active = 1 THEN r.id END) AS active_rooms,
 *          COUNT(res.id) AS total_reservations,
 *          COUNT(CASE WHEN res.status = 'Approved' THEN 1 END) AS approved_reservations
 *   FROM buildings b
 *   LEFT JOIN rooms r ON r.building_id = b.id
 *   LEFT JOIN reservations res ON res.room_id = r.id
 *   GROUP BY b.id, b.name, b.location
 *   ORDER BY total_reservations DESC, approved_reservations DESC, active_rooms DESC, b.name ASC
 *   LIMIT 3;
 */
router.get('/buildings/top-popular', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.name AS building_name, b.name AS name, b.location,
              COUNT(DISTINCT CASE WHEN r.is_active = 1 THEN r.id END) AS active_rooms,
              COUNT(res.id) AS total_reservations,
              COUNT(CASE WHEN res.status = 'Approved' THEN 1 END) AS approved_reservations,
              (
                SELECT r2.image_url FROM rooms r2
                WHERE r2.building_id = b.id AND r2.is_active = 1 AND r2.image_url IS NOT NULL
                ORDER BY r2.id LIMIT 1
              ) AS image_url
       FROM buildings b
       LEFT JOIN rooms r ON r.building_id = b.id
       LEFT JOIN reservations res ON res.room_id = r.id
       GROUP BY b.id, b.name, b.location
       ORDER BY total_reservations DESC, approved_reservations DESC, active_rooms DESC, b.name ASC
       LIMIT 3`
    );
    res.json({ buildings: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE r.is_active = 1';

    if (req.query.building_id) {
      where += ' AND r.building_id = ?';
      params.push(Number(req.query.building_id));
    }
    if (req.query.room_type) {
      where += ' AND r.room_type = ?';
      params.push(String(req.query.room_type));
    }

    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.floor, r.image_url,
              r.has_projector, r.has_aircon, r.has_sound,
              b.id AS building_id, b.name AS building_name, b.location
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       ${where}
       ORDER BY b.name, r.name`,
      params
    );
    res.json({ rooms: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.floor, r.image_url,
              r.has_projector, r.has_aircon, r.has_sound,
              b.id AS building_id, b.name AS building_name, b.location
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Room not found.' });
    res.json({ room: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/availability?date=YYYY-MM-DD[&room_id=N][&building_id=N]
 *
 * Returns every blocking reservation on that date grouped per room, so the
 * client can build a timetable without issuing one request per room.
 */
router.get('/availability', async (req, res, next) => {
  try {
    const date = req.query.date ? parseDate(req.query.date, 'date') : todayIso();

    const params = [date];
    let where = `WHERE res.res_date = ? AND res.status IN ('Pending', 'Approved')`;

    if (req.query.room_id) {
      where += ' AND res.room_id = ?';
      params.push(Number(req.query.room_id));
    }
    if (req.query.building_id) {
      where += ' AND r.building_id = ?';
      params.push(Number(req.query.building_id));
    }

    const [bookings] = await pool.query(
      `SELECT res.id, res.room_id, r.name AS room_name, b.name AS building_name,
              res.res_date, res.start_time, res.end_time, res.status,
              u.full_name AS requested_by
       FROM reservations res
       JOIN rooms r     ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u     ON u.id = res.user_id
       ${where}
       ORDER BY res.start_time`,
      params
    );

    const roomParams = [];
    let roomWhere = 'WHERE r.is_active = 1';
    if (req.query.building_id) {
      roomWhere += ' AND r.building_id = ?';
      roomParams.push(Number(req.query.building_id));
    }

    const [roomRows] = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.floor, r.image_url,
              b.id AS building_id, b.name AS building_name
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       ${roomWhere}
       ORDER BY b.name, r.name`,
      roomParams
    );

    // Group bookings under their room and mark each room free/busy.
    const rooms = roomRows.map((room) => {
      const roomBookings = bookings
        .filter((bk) => bk.room_id === room.id)
        .map((bk) => ({
          id: bk.id,
          start_time: bk.start_time,
          end_time: bk.end_time,
          status: bk.status,
          requested_by: bk.requested_by
        }));
      return { ...room, bookings: roomBookings, is_free_all_day: roomBookings.length === 0 };
    });

    res.json({
      date,
      blocking_statuses: BLOCKING_STATUSES,
      rooms,
      summary: {
        total_rooms: rooms.length,
        free_rooms: rooms.filter((r) => r.is_free_all_day).length,
        bookings: bookings.length
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.BLOCKING_STATUSES = BLOCKING_STATUSES;
