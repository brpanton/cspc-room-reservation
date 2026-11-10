/**
 * Maintenance & Facility Showcase Module.
 *
 * Public & Authenticated Endpoints (mounted at /api):
 *   GET    /api/facility-showcase                 -> Hero carousel labs, buildings, active alerts & popups
 *   GET    /api/maintenance/active                -> Active (Ongoing/Scheduled) maintenance advisories
 *   GET    /api/facility-images                   -> Multi-image gallery for rooms/buildings
 *
 * Admin Endpoints (protected by requireAdmin):
 *   GET    /api/admin/maintenance                 -> List all maintenance logs
 *   POST   /api/admin/maintenance                 -> Create/schedule maintenance (supports file upload)
 *   PUT    /api/admin/maintenance/:id             -> Update maintenance log (supports file upload)
 *   PATCH  /api/admin/maintenance/:id/status      -> Quick-toggle status (Scheduled/Ongoing/Completed/Cancelled)
 *   DELETE /api/admin/maintenance/:id             -> Delete maintenance log
 *   GET    /api/admin/facility-images             -> List facility gallery photos
 *   POST   /api/admin/facility-images             -> Upload/link multiple photos to a room or building
 *   PATCH  /api/admin/facility-images/:id/primary -> Set photo as primary cover for room/building
 *   DELETE /api/admin/facility-images/:id         -> Delete photo from gallery
 */
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const facilityUploadDir = path.join(__dirname, '..', 'uploads', 'facilities');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per photo

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 6 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const err = new Error('Please upload a JPEG, PNG, or WebP image.');
      err.status = 400;
      return callback(err);
    }
    callback(null, true);
  }
});

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
}

async function saveUploadedImage(file) {
  const detected = detectImageType(file.buffer);
  if (!detected) {
    const err = new Error('Invalid image file content. Choose a valid JPG, PNG, or WebP file.');
    err.status = 400;
    throw err;
  }
  await fs.mkdir(facilityUploadDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${detected.extension}`;
  const savedPath = path.join(facilityUploadDir, filename);
  await fs.writeFile(savedPath, file.buffer, { flag: 'wx' });
  return `/uploads/facilities/${filename}`;
}

function localUploadPath(url) {
  const match = /^\/uploads\/facilities\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(String(url || ''));
  return match ? path.join(facilityUploadDir, match[1]) : null;
}

/**
 * Ensures the `facility_images` and `maintenance_logs` tables exist and seeds
 * initial gallery photos + sample maintenance logs when run on an existing DB.
 */
async function ensureMaintenanceSchema() {
  await pool.query(`
    ALTER TABLE buildings
      ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS description     TEXT         DEFAULT NULL;

    CREATE TABLE IF NOT EXISTS facility_images (
      id            SERIAL PRIMARY KEY,
      target_type   VARCHAR(20)  NOT NULL CHECK (target_type IN ('room', 'building')),
      room_id       INT          DEFAULT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      building_id   INT          DEFAULT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      image_url     VARCHAR(255) NOT NULL,
      caption       VARCHAR(160) DEFAULT NULL,
      is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
      display_order INT          NOT NULL DEFAULT 0,
      uploaded_by   INT          DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_fimg_target CHECK (
        (target_type = 'room'     AND room_id IS NOT NULL AND building_id IS NULL) OR
        (target_type = 'building' AND building_id IS NOT NULL AND room_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_fimg_room     ON facility_images(room_id);
    CREATE INDEX IF NOT EXISTS idx_fimg_building ON facility_images(building_id);

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id               SERIAL PRIMARY KEY,
      target_type      VARCHAR(20)  NOT NULL DEFAULT 'room' CHECK (target_type IN ('room', 'building')),
      room_id          INT          DEFAULT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      building_id      INT          DEFAULT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      title            VARCHAR(160) NOT NULL,
      description      TEXT         NOT NULL,
      start_time       TIMESTAMP    NOT NULL,
      end_time         TIMESTAMP    NOT NULL,
      status           VARCHAR(20)  NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Ongoing', 'Completed', 'Cancelled')),
      display_mode     VARCHAR(20)  NOT NULL DEFAULT 'both' CHECK (display_mode IN ('popup', 'carousel', 'both')),
      banner_image_url VARCHAR(255) DEFAULT NULL,
      created_by       INT          DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_maint_target CHECK (
        (target_type = 'room'     AND room_id IS NOT NULL) OR
        (target_type = 'building' AND building_id IS NOT NULL)
      ),
      CONSTRAINT chk_maint_time CHECK (end_time > start_time)
    );

    CREATE INDEX IF NOT EXISTS idx_maint_status   ON maintenance_logs(status);
    CREATE INDEX IF NOT EXISTS idx_maint_room     ON maintenance_logs(room_id);
    CREATE INDEX IF NOT EXISTS idx_maint_building ON maintenance_logs(building_id);
    CREATE INDEX IF NOT EXISTS idx_maint_window   ON maintenance_logs(start_time, end_time);
  `);

  // Backfill facility_images from existing rooms.image_url if empty
  const { rows: imgCountRows } = await pool.query('SELECT COUNT(*) AS cnt FROM facility_images');
  if (Number(imgCountRows[0]?.cnt || 0) === 0) {
    await pool.query(`
      INSERT INTO facility_images (target_type, room_id, image_url, caption, is_primary, display_order)
      SELECT 'room', id, image_url, name || ' — Main View', TRUE, 0
      FROM rooms
      WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
    `);

    // Add default building cover photos where available
    const buildingCovers = [
      ['CCS BUILDING', '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg', 'College of Computer Studies Facility'],
      ['CAS BUILDING', '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg', 'College of Arts and Sciences Building'],
      ['GREENBUILDING', '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg', 'CSPC Green Building'],
      ['ACADEMIC BUILDING II', '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'Academic Building II'],
      ['MULTI PURPOSE BUILDING', '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg', 'Multi-Purpose Hall & Labs'],
      ['ACADEMIC BUILDING I', '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'Academic Building I'],
      ['CHS BUILDING', '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg', 'College of Health Sciences Building'],
      ['CITD BUILDING', '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'CITD Building Complex'],
      ['LSB BUILDING', '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'Laboratory Science Building']
    ];
    for (const [bName, coverUrl, caption] of buildingCovers) {
      const { rows: bRows } = await pool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', [bName]);
      if (bRows[0]) {
        await pool.query('UPDATE buildings SET cover_image_url = COALESCE(cover_image_url, $1) WHERE id = $2', [
          coverUrl,
          bRows[0].id
        ]);
        await pool.query(
          `INSERT INTO facility_images (target_type, building_id, image_url, caption, is_primary, display_order)
           VALUES ('building', $1, $2, $3, TRUE, 0)`,
          [bRows[0].id, coverUrl, caption]
        );
      }
    }
  }

  // Seed 2 realistic maintenance advisories if maintenance_logs table is empty
  const { rows: maintCountRows } = await pool.query('SELECT COUNT(*) AS cnt FROM maintenance_logs');
  if (Number(maintCountRows[0]?.cnt || 0) === 0) {
    const { rows: sampleRooms } = await pool.query(
      `SELECT r.id, r.name, r.building_id, r.image_url, b.name AS building_name
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE r.is_active = TRUE
       ORDER BY CASE WHEN r.image_url IS NOT NULL THEN 0 ELSE 1 END, r.id
       LIMIT 4`
    );

    if (sampleRooms[0]) {
      await pool.query(
        `INSERT INTO maintenance_logs
           (target_type, room_id, building_id, title, description, start_time, end_time, status, display_mode, banner_image_url)
         VALUES
           ('room', $1, $2, $3, $4, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '6 hours', 'Ongoing', 'both', $5)`,
        [
          sampleRooms[0].id,
          sampleRooms[0].building_id,
          `${sampleRooms[0].name} — Network Switch & Workstation Upgrade`,
          `Routine fiber switch replacement, OS image deployment, and air-conditioning servicing are currently underway in ${sampleRooms[0].name}. Reservations for this laboratory are temporarily locked until maintenance is completed.`,
          sampleRooms[0].image_url || '/img/cs-lab.jpg'
        ]
      );
    }

    if (sampleRooms[1]) {
      await pool.query(
        `INSERT INTO maintenance_logs
           (target_type, room_id, building_id, title, description, start_time, end_time, status, display_mode, banner_image_url)
         VALUES
           ('room', $1, $2, $3, $4, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 4 hours', 'Scheduled', 'carousel', $5)`,
        [
          sampleRooms[1].id,
          sampleRooms[1].building_id,
          `Scheduled Calibration & Safety Inspection — ${sampleRooms[1].name}`,
          `Preventive equipment calibration and electrical safety inspection scheduled for ${sampleRooms[1].name}. Advance bookings during this 4-hour maintenance window will be blocked automatically.`,
          sampleRooms[1].image_url || '/img/it-lab1.jpg'
        ]
      );
    }
  }
}

/**
 * Computes effective status for a maintenance log based on current time
 * unless it was explicitly marked 'Completed' or 'Cancelled'.
 */
function shapeMaintenanceRow(row) {
  const now = Date.now();
  const startMs = row.start_time ? new Date(row.start_time).getTime() : 0;
  const endMs = row.end_time ? new Date(row.end_time).getTime() : 0;

  let effectiveStatus = row.status;
  if (row.status === 'Scheduled' && startMs <= now && endMs > now) {
    effectiveStatus = 'Ongoing';
  } else if ((row.status === 'Scheduled' || row.status === 'Ongoing') && endMs > 0 && endMs <= now) {
    effectiveStatus = 'Completed';
  }

  const isCurrentlyActive =
    row.status === 'Ongoing' || (row.status === 'Scheduled' && startMs <= now && endMs > now);

  return {
    ...row,
    effective_status: effectiveStatus,
    is_currently_active: isCurrentlyActive,
    target_label:
      row.target_type === 'building'
        ? `Entire Building: ${row.building_name || 'Building'}`
        : `${row.room_name || 'Laboratory'}${row.building_name ? ` (${row.building_name})` : ''}`
  };
}

/**
 * Checks whether a reservation request conflicts with any active/scheduled
 * maintenance window on the room OR its parent building.
 */
async function findMaintenanceConflict(connOrPool, { roomId, date, startTime, endTime }) {
  const startTs = `${date} ${String(startTime).slice(0, 8)}`;
  const endTs = `${date} ${String(endTime).slice(0, 8)}`;

  const { rows } = await connOrPool.query(
    `SELECT m.id, m.target_type, m.room_id, m.building_id, m.title, m.description,
            m.start_time, m.end_time, m.status,
            r.name AS room_name, b.name AS building_name
     FROM maintenance_logs m
     JOIN rooms r ON r.id = $1
     JOIN buildings b ON b.id = r.building_id
     WHERE m.status IN ('Scheduled', 'Ongoing')
       AND (
         (m.target_type = 'room' AND m.room_id = r.id)
         OR (m.target_type = 'building' AND m.building_id = r.building_id)
       )
       AND (
         (m.start_time < $3::timestamp AND m.end_time > $2::timestamp)
         OR (m.status = 'Ongoing' AND $2::timestamp <= NOW() AND m.end_time > $2::timestamp)
       )
     ORDER BY CASE WHEN m.status = 'Ongoing' THEN 0 ELSE 1 END, m.start_time ASC
     LIMIT 1`,
    [roomId, startTs, endTs]
  );

  return rows[0] ? shapeMaintenanceRow(rows[0]) : null;
}

/**
 * Enriches an array of room objects with:
 *   - `images`: array of gallery images
 *   - `is_under_maintenance`: boolean (true if currently under maintenance or on targetDate)
 *   - `active_maintenance`: maintenance object (if currently under maintenance)
 *   - `scheduled_maintenance`: array of upcoming/date-overlapping maintenance logs
 *   - `maintenance_until`: ISO timestamp of expected completion
 */
async function enrichRoomsWithMaintenance(rooms, targetDate = null) {
  if (!Array.isArray(rooms) || !rooms.length) return rooms;

  const [maintRes, imgRes] = await Promise.all([
    pool.query(
      `SELECT m.*, r.name AS room_name, b.name AS building_name
       FROM maintenance_logs m
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(m.building_id, r.building_id)
       WHERE m.status IN ('Scheduled', 'Ongoing')
         AND m.end_time > NOW() - INTERVAL '1 hour'
       ORDER BY CASE WHEN m.status = 'Ongoing' THEN 0 ELSE 1 END, m.start_time ASC`
    ),
    pool.query(
      `SELECT id, target_type, room_id, building_id, image_url, caption, is_primary, display_order
       FROM facility_images
       ORDER BY is_primary DESC, display_order ASC, id ASC`
    )
  ]);

  const maintLogs = maintRes.rows.map(shapeMaintenanceRow).filter((m) => m.effective_status !== 'Completed');
  const imagesByRoom = new Map();
  const imagesByBuilding = new Map();

  for (const img of imgRes.rows) {
    if (img.target_type === 'room' && img.room_id) {
      if (!imagesByRoom.has(img.room_id)) imagesByRoom.set(img.room_id, []);
      imagesByRoom.get(img.room_id).push(img);
    } else if (img.target_type === 'building' && img.building_id) {
      if (!imagesByBuilding.has(img.building_id)) imagesByBuilding.set(img.building_id, []);
      imagesByBuilding.get(img.building_id).push(img);
    }
  }

  const dayStartMs = targetDate ? new Date(`${targetDate}T00:00:00`).getTime() : null;
  const dayEndMs = targetDate ? new Date(`${targetDate}T23:59:59`).getTime() : null;

  return rooms.map((room) => {
    const applicable = maintLogs.filter(
      (m) =>
        (m.target_type === 'room' && Number(m.room_id) === Number(room.id)) ||
        (m.target_type === 'building' && Number(m.building_id) === Number(room.building_id))
    );

    const activeNow = applicable.find((m) => m.is_currently_active) || null;
    const activeOnDate =
      dayStartMs && dayEndMs
        ? applicable.find((m) => {
            const s = new Date(m.start_time).getTime();
            const e = new Date(m.end_time).getTime();
            return s <= dayEndMs && e >= dayStartMs;
          }) || null
        : null;

    const primaryMaint = activeNow || activeOnDate || null;
    const roomGallery = imagesByRoom.get(Number(room.id)) || [];
    const fallbackGallery =
      roomGallery.length > 0
        ? roomGallery
        : room.image_url
          ? [{ id: 0, image_url: room.image_url, caption: room.name, is_primary: true }]
          : imagesByBuilding.get(Number(room.building_id)) || [];

    return {
      ...room,
      image_url: room.image_url || (fallbackGallery[0] ? fallbackGallery[0].image_url : null),
      images: fallbackGallery,
      is_under_maintenance: Boolean(activeNow),
      has_date_maintenance: Boolean(activeOnDate),
      active_maintenance: primaryMaint,
      scheduled_maintenance: applicable,
      maintenance_until: primaryMaint ? primaryMaint.end_time : null
    };
  });
}

// ============================================================================
// PUBLIC & USER ENDPOINTS
// ============================================================================

/**
 * GET /api/facility-showcase
 * Powers the pre-login Hero Showcase Carousel, the Scrolling/Landing Popup
 * Modal, and the Authenticated User Dashboard Rotating Advisory Widget.
 */
router.get('/facility-showcase', async (req, res, next) => {
  try {
    const { rows: roomRows } = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.floor, r.image_url,
              r.has_projector, r.has_aircon, r.has_sound,
              b.id AS building_id, b.name AS building_name, b.location, b.cover_image_url
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE r.is_active = TRUE
       ORDER BY CASE WHEN r.image_url IS NOT NULL THEN 0 ELSE 1 END, b.name, r.name`
    );

    const enrichedRooms = await enrichRoomsWithMaintenance(roomRows);

    // Sort so rooms under maintenance or with rich photos appear prominently in showcase
    const showcaseLabs = [...enrichedRooms]
      .sort((a, b) => {
        if (a.is_under_maintenance !== b.is_under_maintenance) {
          return a.is_under_maintenance ? -1 : 1;
        }
        const aHasImg = a.images && a.images.length ? 0 : 1;
        const bHasImg = b.images && b.images.length ? 0 : 1;
        return aHasImg - bHasImg || String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 12)
      .map((r) => ({
        ...r,
        status_badge: r.is_under_maintenance ? 'Under Maintenance' : 'Available'
      }));

    const { rows: maintRows } = await pool.query(
      `SELECT m.*, r.name AS room_name, r.floor AS room_floor, r.image_url AS room_image_url,
              b.name AS building_name, b.cover_image_url AS building_image_url
       FROM maintenance_logs m
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(m.building_id, r.building_id)
       WHERE m.status IN ('Scheduled', 'Ongoing')
         AND m.end_time > NOW()
       ORDER BY CASE WHEN m.status = 'Ongoing' THEN 0 ELSE 1 END, m.start_time ASC`
    );

    const announcements = maintRows.map((row) => {
      const shaped = shapeMaintenanceRow(row);
      return {
        ...shaped,
        showcase_image:
          row.banner_image_url ||
          row.room_image_url ||
          row.building_image_url ||
          '/img/campus-bg-sm.jpg'
      };
    });

    const priorityPopups = announcements.filter(
      (a) => a.display_mode === 'popup' || a.display_mode === 'both'
    );
    const carouselAdvisories = announcements.filter(
      (a) => a.display_mode === 'carousel' || a.display_mode === 'both'
    );

    res.json({
      labs: showcaseLabs,
      announcements,
      priority_popups: priorityPopups,
      carousel_advisories: carouselAdvisories,
      summary: {
        total_active_labs: enrichedRooms.length,
        under_maintenance_count: enrichedRooms.filter((r) => r.is_under_maintenance).length,
        available_count: enrichedRooms.filter((r) => !r.is_under_maintenance).length,
        active_advisories_count: announcements.length
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/maintenance/active
 * Returns active/upcoming maintenance logs, optionally filtered by room_id or building_id.
 */
router.get('/maintenance/active', async (req, res, next) => {
  try {
    const params = [];
    let where = `WHERE m.status IN ('Scheduled', 'Ongoing') AND m.end_time > NOW()`;

    if (req.query.room_id) {
      params.push(Number(req.query.room_id));
      where += ` AND (
        (m.target_type = 'room' AND m.room_id = $${params.length})
        OR (m.target_type = 'building' AND m.building_id = (SELECT building_id FROM rooms WHERE id = $${params.length}))
      )`;
    } else if (req.query.building_id) {
      params.push(Number(req.query.building_id));
      where += ` AND (m.building_id = $${params.length} OR r.building_id = $${params.length})`;
    }

    const { rows } = await pool.query(
      `SELECT m.*, r.name AS room_name, r.image_url AS room_image_url,
              b.name AS building_name, b.cover_image_url AS building_image_url
       FROM maintenance_logs m
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(m.building_id, r.building_id)
       ${where}
       ORDER BY CASE WHEN m.status = 'Ongoing' THEN 0 ELSE 1 END, m.start_time ASC`,
      params
    );

    res.json({
      maintenance: rows.map(shapeMaintenanceRow)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facility-images?target_type=room|building&target_id=N
 */
router.get('/facility-images', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';

    if (req.query.target_type === 'room' && req.query.target_id) {
      params.push(Number(req.query.target_id));
      where += ` AND fi.target_type = 'room' AND fi.room_id = $${params.length}`;
    } else if (req.query.target_type === 'building' && req.query.target_id) {
      params.push(Number(req.query.target_id));
      where += ` AND fi.target_type = 'building' AND fi.building_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT fi.*, r.name AS room_name, b.name AS building_name
       FROM facility_images fi
       LEFT JOIN rooms r ON r.id = fi.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(fi.building_id, r.building_id)
       ${where}
       ORDER BY fi.is_primary DESC, fi.display_order ASC, fi.id DESC`,
      params
    );

    res.json({ images: rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADMIN CONTROL PANEL ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/maintenance
 */
router.get('/admin/maintenance', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*,
              r.name AS room_name, r.image_url AS room_image_url,
              b.name AS building_name,
              u.full_name AS created_by_name
       FROM maintenance_logs m
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(m.building_id, r.building_id)
       LEFT JOIN users u ON u.id = m.created_by
       ORDER BY
         CASE m.status
           WHEN 'Ongoing' THEN 0
           WHEN 'Scheduled' THEN 1
           WHEN 'Completed' THEN 2
           ELSE 3
         END,
         m.start_time DESC`
    );

    res.json({ maintenance: rows.map(shapeMaintenanceRow) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/maintenance
 * Creates/schedules a maintenance window for a specific laboratory or whole building.
 */
router.post(
  '/admin/maintenance',
  requireAdmin,
  (req, res, next) => {
    upload.single('banner_image')(req, res, (err) => {
      if (err) {
        err.status = 400;
        return next(err);
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const targetType = body.target_type === 'building' ? 'building' : 'room';
      const roomId = targetType === 'room' && body.room_id ? Number(body.room_id) : null;
      let buildingId = body.building_id ? Number(body.building_id) : null;

      if (targetType === 'room' && !roomId) {
        const err = new Error('Please select a target laboratory/room.');
        err.status = 400;
        throw err;
      }
      if (targetType === 'building' && !buildingId) {
        const err = new Error('Please select a target building.');
        err.status = 400;
        throw err;
      }

      if (targetType === 'room' && roomId && !buildingId) {
        const { rows: rRows } = await pool.query('SELECT building_id FROM rooms WHERE id = $1', [roomId]);
        if (!rRows.length) {
          const err = new Error('Selected room was not found.');
          err.status = 404;
          throw err;
        }
        buildingId = rRows[0].building_id;
      }

      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      if (!title || title.length < 3) {
        const err = new Error('Please provide a maintenance title (at least 3 characters).');
        err.status = 400;
        throw err;
      }
      if (!description || description.length < 5) {
        const err = new Error('Please provide a maintenance description/reason.');
        err.status = 400;
        throw err;
      }

      const startTime = body.start_time ? new Date(body.start_time) : new Date();
      const endTime = body.end_time ? new Date(body.end_time) : new Date(Date.now() + 4 * 3600 * 1000);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
        const err = new Error('End time must be later than start time.');
        err.status = 400;
        throw err;
      }

      const allowedStatuses = ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'];
      const status = allowedStatuses.includes(body.status) ? body.status : 'Scheduled';

      const allowedModes = ['popup', 'carousel', 'both'];
      const displayMode = allowedModes.includes(body.display_mode) ? body.display_mode : 'both';

      let bannerImageUrl = body.banner_image_url ? String(body.banner_image_url).trim() : null;
      if (req.file) {
        bannerImageUrl = await saveUploadedImage(req.file);
      }

      const { rows } = await pool.query(
        `INSERT INTO maintenance_logs
           (target_type, room_id, building_id, title, description, start_time, end_time, status, display_mode, banner_image_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          targetType,
          roomId,
          buildingId,
          title,
          description,
          startTime.toISOString(),
          endTime.toISOString(),
          status,
          displayMode,
          bannerImageUrl,
          req.session.user.id
        ]
      );

      res.status(201).json({
        message: 'Maintenance notice scheduled and published.',
        maintenance: shapeMaintenanceRow(rows[0])
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/admin/maintenance/:id
 */
router.put(
  '/admin/maintenance/:id',
  requireAdmin,
  (req, res, next) => {
    upload.single('banner_image')(req, res, (err) => {
      if (err) {
        err.status = 400;
        return next(err);
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { rows: existingRows } = await pool.query('SELECT * FROM maintenance_logs WHERE id = $1', [id]);
      if (!existingRows.length) return res.status(404).json({ error: 'Maintenance log not found.' });
      const existing = existingRows[0];

      const body = req.body || {};
      const targetType = body.target_type === 'building' ? 'building' : 'room';
      const roomId = targetType === 'room' && body.room_id ? Number(body.room_id) : null;
      let buildingId = body.building_id ? Number(body.building_id) : null;

      if (targetType === 'room' && roomId && !buildingId) {
        const { rows: rRows } = await pool.query('SELECT building_id FROM rooms WHERE id = $1', [roomId]);
        if (rRows[0]) buildingId = rRows[0].building_id;
      }

      const title = String(body.title || existing.title).trim();
      const description = String(body.description || existing.description).trim();
      const startTime = body.start_time ? new Date(body.start_time) : new Date(existing.start_time);
      const endTime = body.end_time ? new Date(body.end_time) : new Date(existing.end_time);

      if (endTime <= startTime) {
        const err = new Error('End time must be later than start time.');
        err.status = 400;
        throw err;
      }

      const allowedStatuses = ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'];
      const status = allowedStatuses.includes(body.status) ? body.status : existing.status;

      const allowedModes = ['popup', 'carousel', 'both'];
      const displayMode = allowedModes.includes(body.display_mode) ? body.display_mode : existing.display_mode;

      let bannerImageUrl =
        body.banner_image_url !== undefined ? String(body.banner_image_url).trim() || null : existing.banner_image_url;
      if (req.file) {
        bannerImageUrl = await saveUploadedImage(req.file);
      }

      const { rows } = await pool.query(
        `UPDATE maintenance_logs
         SET target_type = $1, room_id = $2, building_id = $3, title = $4, description = $5,
             start_time = $6, end_time = $7, status = $8, display_mode = $9,
             banner_image_url = $10, updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          targetType,
          roomId,
          buildingId,
          title,
          description,
          startTime.toISOString(),
          endTime.toISOString(),
          status,
          displayMode,
          bannerImageUrl,
          id
        ]
      );

      res.json({
        message: `Maintenance notice #${id} updated.`,
        maintenance: shapeMaintenanceRow(rows[0])
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/admin/maintenance/:id/status
 * Quick toggle for Ongoing / Scheduled / Completed / Cancelled.
 */
router.patch('/admin/maintenance/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const allowedStatuses = ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'];
    const status = String(req.body.status || '');
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    // When marking Ongoing right now and end_time was already in the past, extend end_time by 4 hours
    let extraSql = '';
    if (status === 'Ongoing') {
      extraSql = `, start_time = LEAST(start_time, NOW()), end_time = CASE WHEN end_time <= NOW() THEN NOW() + INTERVAL '4 hours' ELSE end_time END`;
    }

    const { rows } = await pool.query(
      `UPDATE maintenance_logs
       SET status = $1, updated_at = NOW() ${extraSql}
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Maintenance log not found.' });

    res.json({
      message: `Maintenance #${id} marked as ${status}.`,
      maintenance: shapeMaintenanceRow(rows[0])
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/maintenance/:id
 */
router.delete('/admin/maintenance/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query('DELETE FROM maintenance_logs WHERE id = $1 RETURNING banner_image_url', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Maintenance log not found.' });

    const oldFile = localUploadPath(rows[0].banner_image_url);
    if (oldFile) fs.unlink(oldFile).catch(() => {});

    res.json({ message: `Maintenance log #${id} deleted.` });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADMIN FACILITY IMAGE GALLERY MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/facility-images
 */
router.get('/admin/facility-images', requireAdmin, async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (req.query.target_type) {
      params.push(String(req.query.target_type));
      where += ` AND fi.target_type = $${params.length}`;
    }
    if (req.query.room_id) {
      params.push(Number(req.query.room_id));
      where += ` AND fi.room_id = $${params.length}`;
    }
    if (req.query.building_id) {
      params.push(Number(req.query.building_id));
      where += ` AND fi.building_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT fi.*, r.name AS room_name, b.name AS building_name
       FROM facility_images fi
       LEFT JOIN rooms r ON r.id = fi.room_id
       LEFT JOIN buildings b ON b.id = COALESCE(fi.building_id, r.building_id)
       ${where}
       ORDER BY fi.target_type ASC, COALESCE(b.name, '') ASC, COALESCE(r.name, '') ASC, fi.is_primary DESC, fi.id DESC`,
      params
    );

    res.json({ images: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/facility-images
 * Supports uploading multiple image files (`images`) AND/OR linking image URLs (`image_url`).
 */
router.post(
  '/admin/facility-images',
  requireAdmin,
  (req, res, next) => {
    upload.array('images', 6)(req, res, (err) => {
      if (err) {
        err.status = 400;
        return next(err);
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const targetType = body.target_type === 'building' ? 'building' : 'room';
      const roomId = targetType === 'room' && body.room_id ? Number(body.room_id) : null;
      const buildingId = targetType === 'building' && body.building_id ? Number(body.building_id) : null;
      const caption = body.caption ? String(body.caption).trim().slice(0, 160) : null;
      const makePrimary =
        body.is_primary === true || body.is_primary === 'true' || body.is_primary === '1' || body.is_primary === 'on';

      if (targetType === 'room' && !roomId) {
        return res.status(400).json({ error: 'Please select a laboratory/room.' });
      }
      if (targetType === 'building' && !buildingId) {
        return res.status(400).json({ error: 'Please select a building.' });
      }

      const urlsToInsert = [];
      if (Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
          const savedUrl = await saveUploadedImage(file);
          urlsToInsert.push(savedUrl);
        }
      }
      if (body.image_url && String(body.image_url).trim()) {
        const rawUrls = String(body.image_url)
          .split(/[\r\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        urlsToInsert.push(...rawUrls);
      }

      if (!urlsToInsert.length) {
        return res.status(400).json({ error: 'Please upload at least one image file or provide an image URL.' });
      }

      if (makePrimary) {
        if (targetType === 'room') {
          await pool.query('UPDATE facility_images SET is_primary = FALSE WHERE room_id = $1', [roomId]);
        } else {
          await pool.query('UPDATE facility_images SET is_primary = FALSE WHERE building_id = $1', [buildingId]);
        }
      }

      const inserted = [];
      for (let i = 0; i < urlsToInsert.length; i++) {
        const url = urlsToInsert[i];
        const isPrimaryRow = makePrimary && i === 0;
        const { rows } = await pool.query(
          `INSERT INTO facility_images
             (target_type, room_id, building_id, image_url, caption, is_primary, display_order, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [targetType, roomId, buildingId, url, caption, isPrimaryRow, i, req.session.user.id]
        );
        inserted.push(rows[0]);

        if (isPrimaryRow) {
          if (targetType === 'room') {
            await pool.query('UPDATE rooms SET image_url = $1 WHERE id = $2', [url, roomId]);
          } else {
            await pool.query('UPDATE buildings SET cover_image_url = $1 WHERE id = $2', [url, buildingId]);
          }
        }
      }

      // Also set room.image_url if the room previously had no image_url at all
      if (targetType === 'room' && !makePrimary && inserted[0]) {
        await pool.query(
          `UPDATE rooms SET image_url = COALESCE(NULLIF(TRIM(image_url), ''), $1) WHERE id = $2`,
          [inserted[0].image_url, roomId]
        );
      }

      res.status(201).json({
        message: `${inserted.length} photo(s) added to the facility gallery.`,
        images: inserted
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/admin/facility-images/:id/primary
 */
router.patch('/admin/facility-images/:id/primary', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query('SELECT * FROM facility_images WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Photo not found.' });
    const img = rows[0];

    if (img.target_type === 'room' && img.room_id) {
      await pool.query('UPDATE facility_images SET is_primary = FALSE WHERE room_id = $1', [img.room_id]);
      await pool.query('UPDATE facility_images SET is_primary = TRUE WHERE id = $1', [id]);
      await pool.query('UPDATE rooms SET image_url = $1 WHERE id = $2', [img.image_url, img.room_id]);
    } else if (img.target_type === 'building' && img.building_id) {
      await pool.query('UPDATE facility_images SET is_primary = FALSE WHERE building_id = $1', [img.building_id]);
      await pool.query('UPDATE facility_images SET is_primary = TRUE WHERE id = $1', [id]);
      await pool.query('UPDATE buildings SET cover_image_url = $1 WHERE id = $2', [img.image_url, img.building_id]);
    }

    res.json({ message: 'Primary cover photo updated.' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/facility-images/:id
 */
router.delete('/admin/facility-images/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query('DELETE FROM facility_images WHERE id = $1 RETURNING *', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Photo not found.' });

    const deleted = rows[0];
    const oldFile = localUploadPath(deleted.image_url);
    if (oldFile) fs.unlink(oldFile).catch(() => {});

    res.json({ message: 'Photo removed from gallery.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.ensureMaintenanceSchema = ensureMaintenanceSchema;
module.exports.findMaintenanceConflict = findMaintenanceConflict;
module.exports.enrichRoomsWithMaintenance = enrichRoomsWithMaintenance;
