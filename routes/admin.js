/**
 * Administrator-only management of rooms, buildings and user accounts.
 * Mounted at /api/admin and protected by requireAdmin for every route.
 *
 *  Buildings : POST /buildings, PUT /buildings/:id, DELETE /buildings/:id
 *  Rooms     : POST /rooms, PUT /rooms/:id, DELETE /rooms/:id
 *  Users     : GET /users, POST /users, PUT /users/:id, DELETE /users/:id
 */
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendPasswordChangedAlert } = require('../mailer');
const {
  requireFields,
  parseEmail,
  parsePassword,
  parseStrongPassword,
  parseSchoolId,
  parseIntInRange,
  oneOf,
  ROLES,
  ROOM_TYPES
} = require('../middleware/validate');

const router = express.Router();

router.use(requireAdmin);

/** PostgreSQL error -> friendly HTTP response. */
function translateDbError(err) {
  // 23505 = unique_violation, 23503 = foreign_key_violation
  if (err.code === '23505') {
    const e = new Error('A record with those details already exists.');
    e.status = 409;
    return e;
  }
  if (err.code === '23503') {
    const e = new Error('This record is still used by existing reservations and cannot be deleted. Deactivate it instead.');
    e.status = 409;
    return e;
  }
  return err;
}

// ========================= ACCOUNT SECURITY ================================

/**
 * POST /api/admin/change-password
 *
 * Self-service password change for the signed-in admin ("Security & Change
 * Password" in the account dropdown). Guarded by requireAdmin (router.use
 * above) AND a role re-check against the database, so a stale/forged session
 * object cannot escalate. Requires the current password, applies the strong
 * password policy, re-hashes with bcrypt, then regenerates the session id
 * (session-fixation hygiene) and emails the admin a security alert.
 */
router.post('/change-password', async (req, res, next) => {
  try {
    requireFields(req.body, ['current_password', 'new_password']);
    const currentPassword = String(req.body.current_password);
    const newPassword = parseStrongPassword(req.body.new_password);

    const { rows } = await pool.query(
      `SELECT id, full_name, email, role, password_hash, avatar_url, school_id,
              department, admin_level, must_change_password
       FROM users WHERE id = $1 LIMIT 1`,
      [req.session.user.id]
    );
    if (!rows.length) {
      const err = new Error('User not found.');
      err.status = 404;
      throw err;
    }

    const admin = rows[0];
    // Defense in depth: the session says admin, but confirm against the DB.
    if (admin.role !== 'admin') {
      const err = new Error('Administrator access is required.');
      err.status = 403;
      throw err;
    }

    const matchesCurrent = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!matchesCurrent) {
      const err = new Error('Your current password is incorrect.');
      err.status = 401;
      throw err;
    }

    if (await bcrypt.compare(newPassword, admin.password_hash)) {
      const err = new Error('Your new password must be different from the current one.');
      err.status = 400;
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [passwordHash, admin.id]
    );

    // Rotate the session id so any pre-change session cookie is invalidated
    // (session-fixation hygiene). The admin stays signed in with a clean session.
    await new Promise((resolve, reject) => {
      req.session.regenerate((regenErr) => {
        if (regenErr) return reject(regenErr);
        req.session.user = {
          id: admin.id,
          school_id: admin.school_id,
          full_name: admin.full_name,
          email: admin.email,
          role: admin.role,
          department: admin.department,
          avatar_url: admin.avatar_url || null,
          admin_level: admin.admin_level || null,
          must_change_password: false,
          isFirstLogin: false
        };
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });

    // Fire-and-report: a failed email never fails the request.
    const alert = await sendPasswordChangedAlert({ email: admin.email, name: admin.full_name });

    res.json({
      message: 'Password updated successfully.',
      email_alert_sent: alert.delivered
    });
  } catch (err) {
    next(err);
  }
});

// ============================== BUILDINGS ==================================

router.post('/buildings', async (req, res, next) => {
  try {
    requireFields(req.body, ['name']);
    const name = String(req.body.name).trim();
    const location = req.body.location ? String(req.body.location).trim() : null;

    try {
      const { rows } = await pool.query(
        'INSERT INTO buildings (name, location) VALUES ($1, $2) RETURNING id',
        [name, location]
      );
      res.status(201).json({ message: `Building "${name}" created.`, id: rows[0].id });
    } catch (err) {
      throw translateDbError(err);
    }
  } catch (err) {
    next(err);
  }
});

router.put('/buildings/:id', async (req, res, next) => {
  try {
    requireFields(req.body, ['name']);
    const name = String(req.body.name).trim();
    const location = req.body.location ? String(req.body.location).trim() : null;

    const result = await pool.query(
      'UPDATE buildings SET name = $1, location = $2 WHERE id = $3',
      [name, location, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Building not found.' });
    res.json({ message: `Building #${req.params.id} updated.` });
  } catch (err) {
    next(translateDbError(err));
  }
});

router.delete('/buildings/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM buildings WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Building not found.' });
    res.json({ message: `Building #${req.params.id} and its rooms were deleted.` });
  } catch (err) {
    next(translateDbError(err));
  }
});


// ================================ ROOMS ====================================
/**
 * Admin room listing. Unlike the public /api/rooms endpoint this also returns
 * deactivated rooms (pass ?include_inactive=1) so they can be reviewed and
 * switched back on from the management screen.
 */
router.get('/rooms', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1 = 1';
    if (req.query.building_id) {
      where += ' AND r.building_id = ?';
      params.push(Number(req.query.building_id));
    }
    if (req.query.include_inactive !== '1') where += ' AND r.is_active = 1';

    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.room_type, r.capacity, r.floor, r.image_url,
              r.has_projector, r.has_aircon, r.has_sound, r.is_active,
              r.building_id, b.name AS building_name,
              (SELECT COUNT(*) FROM reservations res WHERE res.room_id = r.id) AS reservation_count
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



/** Coerces the amenity flags coming from HTML checkboxes into 0/1. */
function amenity(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' ? 1 : 0;
}

function readRoomPayload(body) {
  requireFields(body, ['building_id', 'name', 'capacity']);
  return {
    buildingId: parseIntInRange(body.building_id, { min: 1, fieldName: 'building_id' }),
    name: String(body.name).trim(),
    roomType: body.room_type ? oneOf(body.room_type, ROOM_TYPES, 'room_type') : 'laboratory',
    capacity: parseIntInRange(body.capacity, { min: 1, max: 1000, fieldName: 'capacity' }),
    floor: body.floor ? String(body.floor).trim().slice(0, 50) : null,
    imageUrl: body.image_url ? String(body.image_url).trim().slice(0, 255) : null,
    projector: amenity(body.has_projector),
    aircon: amenity(body.has_aircon),
    sound: amenity(body.has_sound)
  };
}

router.post('/rooms', async (req, res, next) => {
  try {
    const r = readRoomPayload(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [r.buildingId, r.name, r.roomType, r.capacity, r.floor, r.imageUrl, r.projector, r.aircon, r.sound]
      );
      res.status(201).json({ message: `Room "${r.name}" created.`, id: rows[0].id });
    } catch (err) {
      // 23505 = unique_violation, 23503 = foreign_key_violation
      if (err.code === '23505') {
        const e = new Error(`"${r.name}" already exists in that building.`);
        e.status = 409;
        throw e;
      }
      if (err.code === '23503') {
        const e = new Error('The selected building does not exist.');
        e.status = 400;
        throw e;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.put('/rooms/:id', async (req, res, next) => {
  try {
    const r = readRoomPayload(req.body);
    const isActive = req.body.is_active === undefined ? 1 : amenity(req.body.is_active);

    try {
      const result = await pool.query(
        `UPDATE rooms
         SET building_id = $1, name = $2, room_type = $3, capacity = $4,
             floor = $5, image_url = $6,
             has_projector = $7, has_aircon = $8, has_sound = $9, is_active = $10
         WHERE id = $11`,
        [r.buildingId, r.name, r.roomType, r.capacity,
         r.floor, r.imageUrl, r.projector, r.aircon, r.sound, isActive, req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Room not found.' });
      res.json({ message: `Room #${req.params.id} updated.` });
    } catch (err) {
      if (err.code === '23505') {
        const e = new Error(`"${r.name}" already exists in that building.`);
        e.status = 409;
        throw e;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Rooms with reservation history are soft-deleted (is_active = 0) so that
 * past bookings keep pointing at a real row instead of an orphaned id.
 */
router.delete('/rooms/:id', async (req, res, next) => {
  try {
    const { rows: usageRows } = await pool.query(
      'SELECT COUNT(*) AS count FROM reservations WHERE room_id = $1',
      [req.params.id]
    );
    const usage = usageRows[0];

    if (usage.count > 0) {
      const result = await pool.query(
        'UPDATE rooms SET is_active = FALSE WHERE id = $1',
        [req.params.id]
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: 'Room not found or already deactivated.' });
      }
      return res.json({
        message: `Room #${req.params.id} has ${usage.count} reservation(s), so it was deactivated instead of deleted.`
      });
    }

    const result = await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Room not found.' });
    res.json({ message: `Room #${req.params.id} deleted.` });
  } catch (err) {
    next(translateDbError(err));
  }
});

// ================================ USERS ====================================

router.get('/users', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.role) {
      where = `WHERE role = $${params.length + 1}`;
      params.push(oneOf(req.query.role, ROLES, 'role'));
    }
    if (req.query.search) {
      where += (where ? ' AND' : 'WHERE') + ` (full_name LIKE $${params.length + 1} OR school_id LIKE $${params.length + 2} OR email LIKE $${params.length + 3})`;
      const needle = `%${String(req.query.search).trim()}%`;
      params.push(needle, needle, needle);
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.school_id, u.full_name, u.email, u.recovery_email, u.role, u.department, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM reservations r WHERE r.user_id = u.id) AS reservation_count
       FROM users u
       ${where}
       ORDER BY u.role, u.full_name`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/administrators', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, school_id, full_name, email, recovery_email, admin_level, is_active, must_change_password, created_at,
              created_by_admin_id
       FROM users
       WHERE role = 'admin'
       ORDER BY full_name ASC`
    );
    res.json({ admins: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/administrators', async (req, res, next) => {
  try {
    requireFields(req.body, ['full_name', 'school_id', 'email']);

    const fullName = String(req.body.full_name).trim();
    const schoolId = parseSchoolId(req.body.school_id);
    const email = parseEmail(req.body.email);
    const adminLevel = oneOf(req.body.admin_level || 'Assistant Admin', ['Super Admin', 'Assistant Admin'], 'admin_level');

    // Optional recovery email: an alternate inbox for password-reset OTP codes.
    let recoveryEmail = null;
    if (req.body.recovery_email !== undefined && req.body.recovery_email !== null && String(req.body.recovery_email).trim() !== '') {
      recoveryEmail = parseEmail(req.body.recovery_email);
    }

    if (!/^[A-Z]{3,5}-[A-Z0-9]{4,12}$/.test(schoolId)) {
      const err = new Error('Admin ID must match a secure format such as ADMIN-0001.');
      err.status = 400;
      throw err;
    }
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      const err = new Error('Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
      err.status = 400;
      throw err;
    }
    if (fullName.length < 3 || fullName.length > 120) {
      const err = new Error('Full name must be between 3 and 120 characters.');
      err.status = 400;
      throw err;
    }

    let password = req.body.password ? parsePassword(req.body.password) : null;
    const autoGenerate = req.body.auto_generate_password !== false && !password;
    if (autoGenerate) {
      password = `Admin@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE school_id = $1 OR email = $2 LIMIT 1',
      [schoolId, email]
    );
    if (existing.length) {
      const err = new Error('An administrator with that ID or email already exists.');
      err.status = 409;
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO users (school_id, full_name, email, recovery_email, password_hash, role, admin_level,
                           department, is_active, must_change_password, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, 'Administration', TRUE, TRUE, $7) RETURNING id`,
      [schoolId, fullName, email, recoveryEmail, passwordHash, adminLevel, req.session.user.id]
    );

    await pool.query(
      'INSERT INTO admin_audit_logs (actor_admin_id, target_admin_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, rows[0].id, 'created_admin', `Created new admin ${fullName} (${schoolId}) with ${adminLevel} permissions.`]
    );

    res.status(201).json({
      message: `Administrator ${fullName} was created successfully.`,
      temporary_password: autoGenerate ? password : null,
      admin_id: rows[0].id,
      recovery_email: recoveryEmail
    });
  } catch (err) {
    next(err);
  }
});

router.put('/administrators/:id', async (req, res, next) => {
  try {
    const targetId = parseIntInRange(req.params.id, { min: 1, fieldName: 'admin id' });
    requireFields(req.body, ['full_name', 'school_id', 'email', 'admin_level']);

    const fullName = String(req.body.full_name).trim();
    const schoolId = parseSchoolId(req.body.school_id);
    const email = parseEmail(req.body.email);
    const adminLevel = oneOf(req.body.admin_level, ['Super Admin', 'Assistant Admin'], 'admin_level');
    if (fullName.length < 3 || fullName.length > 120) {
      const err = new Error('Full name must be between 3 and 120 characters.');
      err.status = 400;
      throw err;
    }
    if (!/^[A-Z]{3,5}-[A-Z0-9]{4,12}$/.test(schoolId)) {
      const err = new Error('Admin ID must match a secure format such as ADMIN-0001.');
      err.status = 400;
      throw err;
    }
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      const err = new Error('Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
      err.status = 400;
      throw err;
    }

    // Optional recovery email: an alternate inbox for password-reset OTP codes.
    let recoveryEmail = undefined;
    if (req.body.recovery_email !== undefined) {
      recoveryEmail = req.body.recovery_email ? parseEmail(req.body.recovery_email) : null;
    }

    if (targetId === Number(req.session.user.id)) {
      const { rows } = await pool.query(
        'SELECT admin_level, school_id FROM users WHERE id = $1 AND role = \'admin\' LIMIT 1',
        [targetId]
      );
      const current = rows[0];
      if (current && (current.admin_level !== adminLevel || current.school_id !== schoolId)) {
        const err = new Error('You cannot change your own Admin ID or permission level.');
        err.status = 400;
        throw err;
      }
    }

    const adminUpdateFields = ['school_id = $1', 'full_name = $2', 'email = $3', 'admin_level = $4'];
    const adminUpdateValues = [schoolId, fullName, email, adminLevel];
    if (recoveryEmail !== undefined) {
      adminUpdateFields.push(`recovery_email = $${adminUpdateValues.length + 1}`);
      adminUpdateValues.push(recoveryEmail);
    }
    adminUpdateValues.push(targetId);

    const result = await pool.query(
      `UPDATE users SET ${adminUpdateFields.join(', ')} WHERE id = $${adminUpdateValues.length} AND role = 'admin'`,
      adminUpdateValues
    );
    if (!result.rowCount) {
      const { rows: existingRows } = await pool.query('SELECT id FROM users WHERE id = $1 AND role = \'admin\'', [targetId]);
      if (!existingRows.length) return res.status(404).json({ error: 'Administrator not found.' });
    }

    if (targetId === Number(req.session.user.id)) {
      req.session.user.full_name = fullName;
      req.session.user.email = email;
      req.session.user.school_id = schoolId;
    }

    await pool.query(
      'INSERT INTO admin_audit_logs (actor_admin_id, target_admin_id, action, details) VALUES (?, ?, ?, ?)',
      [req.session.user.id, targetId, 'updated_admin', `Updated administrator ${fullName} (${schoolId}) permissions to ${adminLevel}.`]
    );
    res.json({ message: `Administrator ${fullName} was updated.` });
  } catch (err) {
    if (err.code === '23505') {
      err.status = 409;
      err.message = 'That Admin ID or email address is already assigned to another account.';
    }
    next(err);
  }
});

router.patch('/administrators/:id/status', async (req, res, next) => {
  try {
    const targetId = parseIntInRange(req.params.id, { min: 1, fieldName: 'admin id' });
    if (typeof req.body.is_active !== 'boolean') {
      const err = new Error('is_active must be true or false.');
      err.status = 400;
      throw err;
    }
    if (!req.body.is_active && targetId === Number(req.session.user.id)) {
      const err = new Error('You cannot deactivate your own active administrator account.');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 AND role = \'admin\'',
      [req.body.is_active ? true : false, targetId]
    );
    if (!result.rowCount) {
      const { rows: existingRows } = await pool.query('SELECT id FROM users WHERE id = $1 AND role = \'admin\'', [targetId]);
      if (!existingRows.length) return res.status(404).json({ error: 'Administrator not found.' });
    }

    const action = req.body.is_active ? 'reactivated_admin' : 'deactivated_admin';
    await pool.query(
      'INSERT INTO admin_audit_logs (actor_admin_id, target_admin_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.session.user.id, targetId, action, `Administrator #${targetId} was ${req.body.is_active ? 'reactivated' : 'deactivated'}.`]
    );
    res.json({ message: `Administrator #${targetId} ${req.body.is_active ? 'reactivated' : 'deactivated'}.` });
  } catch (err) {
    next(err);
  }
});

router.get('/support-tickets', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, role_department, contact, category, status, description, created_at, updated_at
       FROM support_tickets
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ tickets: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/support-tickets/:id/status', async (req, res, next) => {
  try {
    const status = oneOf(req.body.status, ['Open', 'In Progress', 'Resolved'], 'status');
    const result = await pool.query(
      'UPDATE support_tickets SET status = $1 WHERE id = $2',
      [status, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    res.json({ message: `Support ticket #${req.params.id} marked as ${status}.` });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    requireFields(req.body, ['school_id', 'full_name', 'email', 'password', 'role']);

    const schoolId = parseSchoolId(req.body.school_id);
    const fullName = String(req.body.full_name).trim();
    const email = parseEmail(req.body.email);
    const password = parsePassword(req.body.password);
    const role = oneOf(req.body.role, ROLES, 'role');
    const department = req.body.department ? String(req.body.department).trim() : null;
    const isActive = amenity(req.body.is_active === undefined ? 1 : req.body.is_active);

    // Optional recovery email: an alternate inbox for password-reset OTP codes.
    let recoveryEmail = null;
    if (req.body.recovery_email !== undefined && req.body.recovery_email !== null && String(req.body.recovery_email).trim() !== '') {
      recoveryEmail = parseEmail(req.body.recovery_email);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (school_id, full_name, email, recovery_email, password_hash, role, department, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [schoolId, fullName, email, recoveryEmail, passwordHash, role, department, isActive]
      );
      res.status(201).json({ message: `Account for ${fullName} created.`, id: rows[0].id });
    } catch (err) {
      if (err.code === '23505') {
        const e = new Error('That ID number or email address is already registered.');
        e.status = 409;
        throw e;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    requireFields(req.body, ['full_name', 'email', 'role']);

    const fullName = String(req.body.full_name).trim();
    const email = parseEmail(req.body.email);
    const role = oneOf(req.body.role, ROLES, 'role');
    const department = req.body.department ? String(req.body.department).trim() : null;
    const isActive = amenity(req.body.is_active === undefined ? 1 : req.body.is_active);

    // An admin must not lock themselves out mid-session.
    if (targetId === req.session.user.id && (isActive === 0 || role !== 'admin')) {
      const e = new Error('You cannot deactivate your own account or change your own role.');
      e.status = 400;
      throw e;
    }

    // Optionally reset the password when a value is supplied.
    let passwordHash = null;
    if (req.body.password) {
      passwordHash = await bcrypt.hash(parsePassword(req.body.password), 10);
    }

    // Optional recovery email: an alternate inbox for password-reset OTP codes.
    // Updating it never touches `email` (the primary login identity).
    let recoveryEmail = undefined;
    if (req.body.recovery_email !== undefined) {
      recoveryEmail = req.body.recovery_email ? parseEmail(req.body.recovery_email) : null;
    }

    try {
      const updateFields = ['full_name = $1', 'email = $2', 'role = $3', 'department = $4', 'is_active = $5'];
      const updateValues = [fullName, email, role, department, isActive];
      if (passwordHash) {
        updateFields.push(`password_hash = $${updateValues.length + 1}`);
        updateValues.push(passwordHash);
      }
      if (recoveryEmail !== undefined) {
        updateFields.push(`recovery_email = $${updateValues.length + 1}`);
        updateValues.push(recoveryEmail);
      }
      updateValues.push(targetId);

      const result = await pool.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
        updateValues
      );

      if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });

      // Keep the admin's own navbar in sync when editing themselves.
      if (targetId === req.session.user.id) {
        req.session.user.full_name = fullName;
        req.session.user.email = email;
        req.session.user.department = department;
      }

      res.json({ message: `Account #${targetId} updated.` });
    } catch (err) {
      if (err.code === '23505') {
        const e = new Error('That email address belongs to another account.');
        e.status = 409;
        throw e;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Users are never hard-deleted once they have reservation history; they are
 * deactivated so the audit trail stays intact.
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.session.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const { rows: usageRows } = await pool.query(
      'SELECT COUNT(*) AS count FROM reservations WHERE user_id = $1',
      [targetId]
    );
    const usage = usageRows[0];

    if (usage.count > 0) {
      const result = await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [false, targetId]);
      if (!result.rowCount) {
        return res.status(404).json({ error: 'User not found or already deactivated.' });
      }
      return res.json({
        message: `Account #${targetId} has ${usage.count} reservation(s), so it was deactivated instead of deleted.`
      });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `Account #${targetId} deleted.` });
  } catch (err) {
    next(translateDbError(err));
  }
});

/* ------------------------------------------------- AVATAR UPLOADS ---------------------------------------- */

const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

const adminUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const err = new Error('Choose a JPEG, PNG, or WebP image.');
      err.status = 400;
      return callback(err);
    }
    callback(null, true);
  }
});

function adminOldAvatarPath(url) {
  const match = /^\/uploads\/avatars\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(String(url || ''));
  return match ? path.join(avatarDir, match[1]) : null;
}

function adminDetectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * POST /api/admin/users/:id/avatar
 * Admin uploads an avatar photo for a user account they manage.
 */
router.post('/users/:id/avatar', async (req, res, next) => {
  adminUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        err.status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        err.message = err.code === 'LIMIT_FILE_SIZE'
          ? 'The avatar must be 3 MB or smaller.'
          : 'Upload one image file at a time.';
      }
      return next(err);
    }
    let savedPath;
    try {
      const targetId = Number(req.params.id);
      if (!req.file) {
        const e = new Error('Select an avatar image to upload.');
        e.status = 400;
        throw e;
      }
      const detected = adminDetectImage(req.file.buffer);
      if (!detected || detected.mime !== req.file.mimetype) {
        const e = new Error('The selected file is not a valid JPEG, PNG, or WebP image.');
        e.status = 400;
        throw e;
      }

      await fs.mkdir(avatarDir, { recursive: true });
      const filename = `${crypto.randomUUID()}.${detected.extension}`;
      savedPath = path.join(avatarDir, filename);
      await fs.writeFile(savedPath, req.file.buffer, { flag: 'wx' });

      const avatarUrl = `/uploads/avatars/${filename}`;
      const { rows } = await pool.query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, full_name, avatar_url',
        [avatarUrl, targetId]
      );
      if (!rows.length) {
        const e = new Error('User not found.');
        e.status = 404;
        throw e;
      }
      res.json({ message: 'Profile photo updated.', avatar_url: avatarUrl, user: rows[0] });
    } catch (e) {
      if (savedPath) await fs.unlink(savedPath).catch(() => {});
      next(e);
    }
  });
});

/**
 * POST /api/admin/administrators/:id/avatar
 * Admin uploads an avatar photo for an administrator account they manage.
 */
router.post('/administrators/:id/avatar', async (req, res, next) => {
  adminUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        err.status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        err.message = err.code === 'LIMIT_FILE_SIZE'
          ? 'The avatar must be 3 MB or smaller.'
          : 'Upload one image file at a time.';
      }
      return next(err);
    }
    let savedPath;
    try {
      const targetId = Number(req.params.id);
      if (!req.file) {
        const e = new Error('Select an avatar image to upload.');
        e.status = 400;
        throw e;
      }
      const detected = adminDetectImage(req.file.buffer);
      if (!detected || detected.mime !== req.file.mimetype) {
        const e = new Error('The selected file is not a valid JPEG, PNG, or WebP image.');
        e.status = 400;
        throw e;
      }

      await fs.mkdir(avatarDir, { recursive: true });
      const filename = `${crypto.randomUUID()}.${detected.extension}`;
      savedPath = path.join(avatarDir, filename);
      await fs.writeFile(savedPath, req.file.buffer, { flag: 'wx' });

      const avatarUrl = `/uploads/avatars/${filename}`;
      const { rows } = await pool.query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, full_name, avatar_url',
        [avatarUrl, targetId]
      );
      if (!rows.length) {
        const e = new Error('Administrator not found.');
        e.status = 404;
        throw e;
      }
      res.json({ message: 'Profile photo updated.', avatar_url: avatarUrl, user: rows[0] });
    } catch (e) {
      if (savedPath) await fs.unlink(savedPath).catch(() => {});
      next(e);
    }
  });
});

module.exports = router;




