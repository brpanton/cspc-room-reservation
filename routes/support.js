const express = require('express');
const pool = require('../db');

const router = express.Router();

const SUPPORT_CATEGORIES = ['Password Reset', 'Login Error', 'Room Booking Issue', 'Other'];

function stripSensitiveText(value) {
  return String(value || '').trim();
}

function containsCredentialLikeText(text) {
  const lowered = text.toLowerCase();
  return /(password|passcode|secret|token|otp|pin|credential|login password)/i.test(lowered);
}

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      full_name: stripSensitiveText(req.body.full_name || req.body.fullname),
      role_department: stripSensitiveText(req.body.role_department || req.body.role || req.body.department),
      contact: stripSensitiveText(req.body.contact || req.body.email || req.body.phone),
      category: stripSensitiveText(req.body.category),
      description: stripSensitiveText(req.body.description)
    };

    if (!payload.full_name || !payload.role_department || !payload.contact || !payload.category || !payload.description) {
      const err = new Error('Please complete all support form fields.');
      err.status = 400;
      throw err;
    }

    if (!SUPPORT_CATEGORIES.includes(payload.category)) {
      const err = new Error('Invalid support category selected.');
      err.status = 400;
      throw err;
    }

    if (containsCredentialLikeText(payload.description) || containsCredentialLikeText(payload.full_name)) {
      const err = new Error('Please do not include passwords or credentials in this form. Contact the IT desk directly if needed.');
      err.status = 400;
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO support_tickets (full_name, role_department, contact, category, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        payload.full_name,
        payload.role_department,
        payload.contact,
        payload.category,
        payload.description
      ]
    );

    res.status(201).json({
      message: 'Your support request has been submitted successfully.',
      ticket_id: rows[0].id,
      category: payload.category
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
