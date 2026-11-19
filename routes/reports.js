'use strict';

/**
 * Laboratory Issue Reporting System Router
 *
 * User Routes:
 *   POST /api/reports        -> Submit a malfunctioning equipment/issue report with photo proof
 *   GET  /api/reports/my     -> Get reports submitted by the logged-in user
 *
 * Admin Routes:
 *   GET   /api/admin/reports           -> Fetch all reports joined with User, Room & Reservation info
 *   PATCH /api/admin/reports/:id/status -> Update report status (Pending -> In Progress -> Resolved)
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db');
const { requireLogin, requireStaff } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directories exist
const reportsUploadDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
const rootUploadsDir = path.join(__dirname, '..', 'uploads', 'reports');

try {
  fs.mkdirSync(reportsUploadDir, { recursive: true });
} catch { /* ignore */ }

try {
  fs.mkdirSync(rootUploadsDir, { recursive: true });
} catch { /* ignore */ }

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, reportsUploadDir);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const randomHex = crypto.randomBytes(6).toString('hex');
    cb(null, `report-${Date.now()}-${randomHex}${safeExt}`);
  }
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      const err = new Error('Invalid file type. Please upload a JPEG, PNG, or WebP image.');
      err.status = 400;
      return cb(err, false);
    }
    cb(null, true);
  }
});

// Multer Error Wrapper Middleware
function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Image size exceeds the 5MB limit. Please upload a smaller photo.' });
        }
        return res.status(400).json({ error: err.message || 'File upload failed.' });
      }
      return res.status(err.status || 400).json({ error: err.message || 'File upload failed.' });
    }
    next();
  });
}

/**
 * Idempotently ensures the lab_reports table and indexes exist.
 */
async function ensureLabReportsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_reports (
      id             SERIAL PRIMARY KEY,
      user_id        INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reservation_id INT          NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      room_id        INT          NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      equipment_name VARCHAR(120) NOT NULL,
      description    TEXT         NOT NULL,
      image_url      VARCHAR(255) DEFAULT NULL,
      status         VARCHAR(30)  NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Resolved')),
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lab_reports_res     ON lab_reports(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_lab_reports_room    ON lab_reports(room_id);
    CREATE INDEX IF NOT EXISTS idx_lab_reports_user    ON lab_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_lab_reports_status  ON lab_reports(status);
    CREATE INDEX IF NOT EXISTS idx_lab_reports_created ON lab_reports(created_at DESC);
  `);
}

// Ensure schema on boot
ensureLabReportsSchema().catch((err) => {
  console.error('[reports] Failed to initialize lab_reports table:', err.message);
});

// Lazy broadcast helper
function getBroadcast() {
  try {
    const { broadcastSseEvent } = require('./session-override');
    return broadcastSseEvent;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// POST /api/reports - User submits a laboratory issue report
// ----------------------------------------------------------------------------
router.post('/reports', requireLogin, handleUpload, async (req, res, next) => {
  const uploadedFilePath = req.file ? req.file.path : null;

  function cleanupUploadedFile() {
    if (uploadedFilePath) {
      fs.unlink(uploadedFilePath, () => {});
    }
  }

  try {
    const reservationId = parseInt(req.body.reservation_id, 10);
    const equipmentName = String(req.body.equipment_name || '').trim();
    const description = String(req.body.description || '').trim();

    if (!reservationId || isNaN(reservationId)) {
      cleanupUploadedFile();
      return res.status(400).json({ error: 'A valid reservation reference is required.' });
    }

    if (!equipmentName || equipmentName.length < 2) {
      cleanupUploadedFile();
      return res.status(400).json({ error: 'Please specify the equipment or item name (at least 2 characters).' });
    }

    if (equipmentName.length > 120) {
      cleanupUploadedFile();
      return res.status(400).json({ error: 'Equipment name must not exceed 120 characters.' });
    }

    if (!description || description.length < 5) {
      cleanupUploadedFile();
      return res.status(400).json({ error: 'Please provide a clear description of the issue (at least 5 characters).' });
    }

    if (description.length > 3000) {
      cleanupUploadedFile();
      return res.status(400).json({ error: 'Description must not exceed 3000 characters.' });
    }

    // Verify reservation ownership and existence
    const { rows: resRows } = await pool.query(
      `SELECT res.id, res.user_id, res.room_id, res.status, res.session_status,
              r.name AS room_name, r.floor AS room_floor, b.name AS building_name
       FROM reservations res
       JOIN rooms r ON r.id = res.room_id
       JOIN buildings b ON b.id = r.building_id
       WHERE res.id = $1`,
      [reservationId]
    );

    if (!resRows.length) {
      cleanupUploadedFile();
      return res.status(404).json({ error: 'Reservation booking not found.' });
    }

    const booking = resRows[0];
    const currentUser = req.session.user;

    // Security check: Must belong to current user (or staff/admin)
    const isOwner = Number(booking.user_id) === Number(currentUser.id);
    const isStaff = currentUser.role === 'admin' || currentUser.role === 'custodian';
    if (!isOwner && !isStaff) {
      cleanupUploadedFile();
      return res.status(403).json({ error: 'You can only report issues for reservations you have booked.' });
    }

    const imageUrl = req.file ? `/uploads/reports/${req.file.filename}` : null;

    // Insert issue report
    const { rows: insertRows } = await pool.query(
      `INSERT INTO lab_reports
         (user_id, reservation_id, room_id, equipment_name, description, image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
       RETURNING *`,
      [currentUser.id, reservationId, booking.room_id, equipmentName, description, imageUrl]
    );

    const reportId = insertRows[0].id;

    // Fetch full enriched report
    const { rows: enrichedRows } = await pool.query(
      `SELECT lr.id, lr.user_id, lr.reservation_id, lr.room_id, lr.equipment_name,
              lr.description, lr.image_url, lr.status, lr.created_at,
              u.full_name AS user_name, u.email AS user_email, u.school_id AS user_school_id,
              r.name AS room_name, r.floor AS room_floor,
              b.name AS building_name,
              TO_CHAR(res.res_date, 'YYYY-MM-DD') AS res_date,
              res.start_time, res.end_time, res.transaction_code
       FROM lab_reports lr
       JOIN users u ON u.id = lr.user_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN reservations res ON res.id = lr.reservation_id
       WHERE lr.id = $1`,
      [reportId]
    );

    const enriched = enrichedRows[0];

    // Real-time notification broadcast to staff/admins
    const broadcast = getBroadcast();
    if (typeof broadcast === 'function') {
      try {
        broadcast('new_lab_report', {
          report: enriched,
          message: `New issue reported for ${booking.room_name} (${equipmentName})`
        }, (c) => c.role === 'admin' || c.role === 'custodian');
      } catch { /* ignore */ }
    }

    return res.status(201).json({
      message: 'Laboratory issue report submitted successfully.',
      report: enriched
    });
  } catch (err) {
    cleanupUploadedFile();
    next(err);
  }
});

// ----------------------------------------------------------------------------
// GET /api/reports/my - User retrieves their own reported issues
// ----------------------------------------------------------------------------
router.get('/reports/my', requireLogin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT lr.id, lr.reservation_id, lr.room_id, lr.equipment_name,
              lr.description, lr.image_url, lr.status, lr.created_at,
              r.name AS room_name, r.floor AS room_floor,
              b.name AS building_name,
              TO_CHAR(res.res_date, 'YYYY-MM-DD') AS res_date,
              res.transaction_code
       FROM lab_reports lr
       JOIN rooms r ON r.id = lr.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN reservations res ON res.id = lr.reservation_id
       WHERE lr.user_id = $1
       ORDER BY lr.created_at DESC`,
      [req.session.user.id]
    );

    res.json({ reports: rows });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// GET /api/admin/reports - Admin fetches all issue reports
// ----------------------------------------------------------------------------
router.get('/admin/reports', requireStaff, async (req, res, next) => {
  try {
    const statusFilter = String(req.query.status || '').trim();
    const searchQuery = String(req.query.search || '').trim();

    const params = [];
    const whereClauses = [];

    if (statusFilter && statusFilter.toLowerCase() !== 'all') {
      params.push(statusFilter);
      whereClauses.push(`LOWER(lr.status) = LOWER($${params.length})`);
    }

    if (searchQuery) {
      params.push(`%${searchQuery}%`);
      const pIdx = params.length;
      whereClauses.push(
        `(lr.equipment_name ILIKE $${pIdx} OR lr.description ILIKE $${pIdx} OR r.name ILIKE $${pIdx} OR b.name ILIKE $${pIdx} OR u.full_name ILIKE $${pIdx} OR u.school_id ILIKE $${pIdx} OR res.transaction_code ILIKE $${pIdx})`
      );
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT lr.id, lr.user_id, lr.reservation_id, lr.room_id, lr.equipment_name,
             lr.description, lr.image_url, lr.status, lr.created_at,
             u.full_name AS user_name, u.email AS user_email, u.school_id AS user_school_id,
             r.name AS room_name, r.floor AS room_floor,
             b.name AS building_name,
             TO_CHAR(res.res_date, 'YYYY-MM-DD') AS res_date,
             res.start_time, res.end_time, res.transaction_code
      FROM lab_reports lr
      JOIN users u ON u.id = lr.user_id
      JOIN rooms r ON r.id = lr.room_id
      JOIN buildings b ON b.id = r.building_id
      JOIN reservations res ON res.id = lr.reservation_id
      ${whereSql}
      ORDER BY lr.created_at DESC
    `;

    const [reportsRes, countRes] = await Promise.all([
      pool.query(query, params),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE LOWER(status) = 'pending') AS pending,
          COUNT(*) FILTER (WHERE LOWER(status) = 'in progress') AS in_progress,
          COUNT(*) FILTER (WHERE LOWER(status) = 'resolved') AS resolved
        FROM lab_reports
      `)
    ]);

    const counts = countRes.rows[0] || {};
    const pendingCount = parseInt(counts.pending || 0, 10);

    res.json({
      reports: reportsRes.rows,
      pending_count: pendingCount,
      counts: {
        total: parseInt(counts.total || 0, 10),
        pending: pendingCount,
        in_progress: parseInt(counts.in_progress || 0, 10),
        resolved: parseInt(counts.resolved || 0, 10)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// PATCH /api/admin/reports/:id/status - Admin updates report status
// ----------------------------------------------------------------------------
router.patch('/admin/reports/:id/status', requireStaff, async (req, res, next) => {
  try {
    const reportId = parseInt(req.params.id, 10);
    if (!reportId || isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID.' });
    }

    const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved'];
    const rawStatus = String(req.body.status || '').trim();

    // Case-insensitive match to canonical status
    const matchedStatus = VALID_STATUSES.find(
      (s) => s.toLowerCase() === rawStatus.toLowerCase()
    );

    if (!matchedStatus) {
      return res.status(400).json({
        error: `Status must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    const { rows: updateRows } = await pool.query(
      `UPDATE lab_reports
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [matchedStatus, reportId]
    );

    if (!updateRows.length) {
      return res.status(404).json({ error: 'Issue report not found.' });
    }

    // Fetch enriched updated report
    const { rows: enrichedRows } = await pool.query(
      `SELECT lr.id, lr.user_id, lr.reservation_id, lr.room_id, lr.equipment_name,
              lr.description, lr.image_url, lr.status, lr.created_at,
              u.full_name AS user_name, u.email AS user_email, u.school_id AS user_school_id,
              r.name AS room_name, r.floor AS room_floor,
              b.name AS building_name,
              TO_CHAR(res.res_date, 'YYYY-MM-DD') AS res_date,
              res.start_time, res.end_time, res.transaction_code
       FROM lab_reports lr
       JOIN users u ON u.id = lr.user_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN reservations res ON res.id = lr.reservation_id
       WHERE lr.id = $1`,
      [reportId]
    );

    const enriched = enrichedRows[0];

    // Real-time broadcast
    const broadcast = getBroadcast();
    if (typeof broadcast === 'function') {
      try {
        broadcast('lab_report_status_changed', {
          report: enriched
        });
      } catch { /* ignore */ }
    }

    res.json({
      message: `Report status updated to ${matchedStatus}.`,
      report: enriched
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ensureLabReportsSchema = ensureLabReportsSchema;

