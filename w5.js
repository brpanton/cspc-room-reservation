const fs = require('fs');
fs.appendFileSync('routes/reservations.js', `
// ----------------------------------------------------------------- cancel ---
router.patch('/:id/cancel', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const { rows } = await pool.query('SELECT * FROM reservations WHERE id = \$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found.' });

    const reservation = rows.rows[0];
    if (!canManageReservation(req.session.user, reservation)) {
      return res.status(403).json({ error: 'You can only cancel your own reservations.' });
    }
    if (reservation.status === 'Cancelled') {
      return res.status(409).json({ error: 'This reservation is already cancelled.' });
    }

    const remarks = req.body && req.body.remarks
      ? String(req.body.remarks).trim().slice(0, 255)
      : \`Cancelled by \${req.session.user.full_name}\`;

    await pool.query(
      \`UPDATE reservations SET status = 'Cancelled', decided_at = NOW(), remarks = \$1 WHERE id = \$2\`,
      [remarks, reservation.id]
    );
    await pool.query(
      \`INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (\$1, \$2, 'Cancelled', \$3)\`,
      [reservation.id, req.session.user.id, remarks]
    );

    res.json({ message: \`Reservation #\${reservation.id} has been cancelled.\` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.BLOCKING_STATUSES = BLOCKING_STATUSES;
module.exports.RESERVATION_SELECT = RESERVATION_SELECT;
module.exports.shape = shape;
module.exports.findConflict = findConflict;
module.exports.parseEquipment = parseEquipment;
`);
console.log('Chunk 5 written');