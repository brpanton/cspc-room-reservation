const fs = require('fs');
fs.appendFileSync('routes/reservations.js', `
// ----------------------------------------------------------- single item ---
router.get('/:id', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const { rows } = await pool.query(\`\${RESERVATION_SELECT} WHERE res.id = \$1\`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found.' });

    const reservation = rows.rows[0];
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
  if (!requireSession(req, res)) return;
  try {
    const conn = await pool.connect();
    requireFields(req.body, ['status']);
    const status = oneOf(req.body.status, ['Approved', 'Rejected'], 'status');
    const remarks = req.body.remarks ? String(req.body.remarks).trim().slice(0, 255) : null;

    await conn.query('BEGIN');

    const { rows } = await conn.query(
      'SELECT * FROM reservations WHERE id = \$1 FOR UPDATE',
      [req.params.id]
    );
    if (!rows.length) {
      const err = new Error('Reservation not found.');
      err.status = 404;
      throw err;
    }
    const reservation = rows.rows[0];

    if (reservation.status === 'Approved' || reservation.status === 'Rejected') {
      const err = new Error(
        \`This reservation has already been \${reservation.status.toLowerCase()}.\`
      );
      err.status = 409;
      throw err;
    }
    if (reservation.status === 'Cancelled') {
      const err = new Error('This reservation was cancelled and can no longer be decided on.');
      err.status = 409;
      throw err;
    }

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
          \`Cannot approve: an overlapping reservation (ID #\${conflict.id}, \${conflict.status}) \` +
          'already occupies that slot.'
        );
        err.status = 409;
        err.code = 'DOUBLE_BOOKING';
        throw err;
      }
    }

    await conn.query(
      \`UPDATE reservations
       SET status = \$1, approved_by = \$2, remarks = \$3, decided_at = NOW()
       WHERE id = \$4\`,
      [status, req.session.user.id, remarks, reservation.id]
    );

    await conn.query(
      \`INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (\$1, \$2, \$3, \$4)\`,
      [reservation.id, req.session.user.id, status, remarks]
    );

    await conn.query('COMMIT');

    const { rows: updatedRows } = await pool.query(\`\${RESERVATION_SELECT} WHERE res.id = \$1\`, [reservation.id]);
    res.json({
      message: \`Reservation #\${reservation.id} has been \${status.toLowerCase()}.\`,
      reservation: shape(updatedRows.rows[0])
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
`);
console.log('Chunk 4 written');