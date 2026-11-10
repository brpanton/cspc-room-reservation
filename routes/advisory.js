/**
 * Dynamic Scheduled Advisory & Maintenance Banner Module.
 *
 * Public Endpoint (no authentication required):
 *   GET    /api/advisory/active         -> Fetches the currently active advisory
 *
 * Admin Endpoints (protected by requireAdmin):
 *   POST   /api/admin/advisory          -> Create, update, or toggle active advisory
 *   GET    /api/admin/advisories        -> List all advisories (for admin configuration)
 *   GET    /api/admin/advisory          -> Alias to list all advisories
 *   PATCH  /api/admin/advisory/:id/toggle -> Quick toggle is_active status
 *   DELETE /api/admin/advisory/:id      -> Delete advisory
 */
'use strict';

const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Idempotently ensure the advisories table & indexes exist.
 * Called during server bootstrap in server.js.
 */
async function ensureAdvisorySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advisories (
      id                  SERIAL PRIMARY KEY,
      title               VARCHAR(200) NOT NULL,
      message             TEXT         NOT NULL,
      expected_completion TIMESTAMP    DEFAULT NULL,
      type                VARCHAR(50)  NOT NULL DEFAULT 'maintenance',
      is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
      created_by          INT          DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_advisories_is_active           ON advisories(is_active);
    CREATE INDEX IF NOT EXISTS idx_advisories_expected_completion ON advisories(expected_completion);
    CREATE INDEX IF NOT EXISTS idx_advisories_updated_at          ON advisories(updated_at DESC);
  `);
}

// ============================================================================
// 1. PUBLIC ENDPOINT: GET /api/advisory/active
// Returns the currently active advisory for display before and after login.
// ============================================================================
router.get('/advisory/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        message,
        type,
        expected_completion AS "expectedCompletion",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM advisories
      WHERE is_active = TRUE
        AND (expected_completion IS NULL OR expected_completion > NOW())
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.json({
        active: false,
        advisory: null
      });
    }

    return res.json({
      active: true,
      advisory: result.rows[0]
    });
  } catch (err) {
    console.error('[advisory/active] Database error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve active advisory.' });
  }
});

// ============================================================================
// 2. ADMIN ENDPOINTS: Manage Advisories
// ============================================================================

/**
 * POST /api/admin/advisory
 * Allows admins to create, update, or toggle active maintenance advisories.
 *
 * Body parameters:
 *  - id                 (optional, for update/toggle)
 *  - title              (string, required for create)
 *  - message            (string, required for create)
 *  - expectedCompletion (timestamp string or null)
 *  - type               ('maintenance' | 'scheduled' | 'warning' | 'info' | 'emergency')
 *  - isActive           (boolean, default true)
 *  - deactivateOthers   (boolean, default true when activating)
 */
router.post('/admin/advisory', requireAdmin, async (req, res) => {
  try {
    const {
      id,
      title,
      message,
      expectedCompletion,
      type = 'maintenance',
      isActive = true,
      deactivateOthers = true
    } = req.body;

    const boolActive = Boolean(isActive);

    const validTypes = ['maintenance', 'scheduled', 'warning', 'info', 'emergency'];
    const cleanType = String(type || 'maintenance').toLowerCase();
    const resolvedType = validTypes.includes(cleanType) ? cleanType : 'maintenance';

    let parsedCompletion = null;
    if (expectedCompletion) {
      const d = new Date(expectedCompletion);
      if (!isNaN(d.getTime())) {
        parsedCompletion = d.toISOString();
      }
    }

    // --- CASE A: UPDATE OR TOGGLE EXISTING ADVISORY ---
    if (id) {
      const targetId = parseInt(id, 10);
      if (isNaN(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid advisory ID provided.' });
      }

      const existingResult = await pool.query('SELECT * FROM advisories WHERE id = $1', [targetId]);
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Advisory not found.' });
      }

      const existing = existingResult.rows[0];

      // If making this advisory active, deactivate others if requested
      if (boolActive && deactivateOthers) {
        await pool.query('UPDATE advisories SET is_active = FALSE WHERE id <> $1 AND is_active = TRUE', [targetId]);
      }

      // Allow partial updating (e.g. if only toggling isActive)
      const newTitle = title !== undefined ? String(title).trim() : existing.title;
      const newMessage = message !== undefined ? String(message).trim() : existing.message;
      const newType = type !== undefined ? resolvedType : existing.type;
      const newCompletion = expectedCompletion !== undefined ? parsedCompletion : existing.expected_completion;

      if (!newTitle || !newMessage) {
        return res.status(400).json({ error: 'Advisory title and message cannot be empty.' });
      }

      const updated = await pool.query(
        `UPDATE advisories
         SET title = $1,
             message = $2,
             expected_completion = $3,
             type = $4,
             is_active = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING id, title, message, type,
                   expected_completion AS "expectedCompletion",
                   is_active AS "isActive",
                   created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
        [newTitle, newMessage, newCompletion, newType, boolActive, targetId]
      );

      return res.json({
        success: true,
        message: boolActive ? 'Advisory updated and activated successfully.' : 'Advisory updated and deactivated.',
        advisory: updated.rows[0]
      });
    }

    // --- CASE B: CREATE NEW ADVISORY ---
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Advisory title is required.' });
    }
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Advisory message is required.' });
    }

    // When activating a new advisory, optionally deactivate currently active advisories
    if (boolActive && deactivateOthers) {
      await pool.query('UPDATE advisories SET is_active = FALSE WHERE is_active = TRUE');
    }

    const inserted = await pool.query(
      `INSERT INTO advisories (title, message, expected_completion, type, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, message, type,
                 expected_completion AS "expectedCompletion",
                 is_active AS "isActive",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [
        String(title).trim(),
        String(message).trim(),
        parsedCompletion,
        resolvedType,
        boolActive,
        req.user ? req.user.id : null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Advisory created and published successfully.',
      advisory: inserted.rows[0]
    });
  } catch (err) {
    console.error('[admin/advisory] Error:', err.message);
    return res.status(500).json({ error: 'Failed to process advisory.' });
  }
});

/**
 * GET /api/admin/advisories & /api/admin/advisory
 * Lists all advisories with author metadata for administrative configuration.
 */
async function listAdvisories(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.title,
        a.message,
        a.type,
        a.expected_completion AS "expectedCompletion",
        a.is_active AS "isActive",
        a.created_at AS "createdAt",
        a.updated_at AS "updatedAt",
        u.full_name AS "createdByName",
        u.email AS "createdByEmail"
      FROM advisories a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.is_active DESC, a.updated_at DESC, a.id DESC
    `);

    return res.json({
      success: true,
      advisories: result.rows
    });
  } catch (err) {
    console.error('[admin/advisories] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch advisories list.' });
  }
}

router.get('/admin/advisories', requireAdmin, listAdvisories);
router.get('/admin/advisory', requireAdmin, listAdvisories);

/**
 * PATCH /api/admin/advisory/:id/toggle
 * One-click toggle of the active state of an advisory.
 */
router.patch('/admin/advisory/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Invalid advisory ID.' });
    }

    const check = await pool.query('SELECT is_active FROM advisories WHERE id = $1', [targetId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Advisory not found.' });
    }

    const nextState = !check.rows[0].is_active;

    // If activating, deactivate other active ones
    if (nextState) {
      await pool.query('UPDATE advisories SET is_active = FALSE WHERE id <> $1 AND is_active = TRUE', [targetId]);
    }

    const updated = await pool.query(
      `UPDATE advisories
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, title, message, type,
                 expected_completion AS "expectedCompletion",
                 is_active AS "isActive",
                 updated_at AS "updatedAt"`,
      [nextState, targetId]
    );

    return res.json({
      success: true,
      message: nextState ? 'Advisory activated.' : 'Advisory deactivated.',
      advisory: updated.rows[0]
    });
  } catch (err) {
    console.error('[admin/advisory/toggle] Error:', err.message);
    return res.status(500).json({ error: 'Failed to toggle advisory status.' });
  }
});

/**
 * DELETE /api/admin/advisory/:id
 * Permanently delete an advisory notice.
 */
router.delete('/admin/advisory/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Invalid advisory ID.' });
    }

    const result = await pool.query('DELETE FROM advisories WHERE id = $1 RETURNING id, title', [targetId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Advisory not found.' });
    }

    return res.json({
      success: true,
      message: `Advisory "${result.rows[0].title}" removed successfully.`
    });
  } catch (err) {
    console.error('[admin/advisory/delete] Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete advisory.' });
  }
});

module.exports = router;
module.exports.ensureAdvisorySchema = ensureAdvisorySchema;

