const fs = require('fs');
fs.appendFileSync('routes/reservations.js', `
// ---------------------------------------------------------------- create ---
router.post('/', async (req, res, next) => {
  if (!requireSession(req, res)) return;
  try {
    const conn = await pool.connect();
    requireFields(req.body, ['room_id', 'res_date', 'start_time', 'end_time', 'purpose']);

    const roomId = parseIntInRange(req.body.room_id, { min: 1, fieldName: 'room_id' });
    const date = parseDate(req.body.res_date, 'date');
    const startTime = parseTime(req.body.start_time, 'start_time');
    const endTime = parseTime(req.body.end_time, 'end_time');
    const purpose = String(req.body.purpose).trim();
    const attendees = req.body.attendees
      ? parseIntInRange(req.body.attendees, { min: 1, max: 5000, fieldName: 'attendees' })
      : 1;
    const equipment = parseEquipment(req.body.equipment);

    if (purpose.length < 10) {
      const err = new Error('Please describe the purpose of use in at least 10 characters.');
      err.status = 400;
      throw err;
    }
    if (purpose.length > 2000) {
      const err = new Error('Purpose must be 2000 characters or fewer.');
      err.status = 400;
      throw err;
    }
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      const err = new Error('End time must be later than start time.');
      err.status = 400;
      throw err;
    }
    assertNotPast(date, 'date');

    const { rows: roomRows } = await conn.query(
      'SELECT id, name, capacity FROM rooms WHERE id = \$1 AND is_active = TRUE',
      [roomId]
    );
    if (!roomRows.length) {
      const err = new Error('The selected room does not exist or is no longer available.');
      err.status = 404;
      throw err;
    }
    if (attendees > roomRows[0].capacity) {
      const err = new Error(
        "\"\${roomRows[0].name}\" only seats \${roomRows[0].capacity} people, but \${attendees} attendees were given."
      );
      err.status = 400;
      throw err;
    }

    await conn.query('BEGIN');

    const conflict = await findConflict(conn, { roomId, date, startTime, endTime });
    if (conflict) {
      const err = new Error(
        "\"\${roomRows[0].name}\" is already booked on \${date} from " +
        "\`\${String(conflict.start_time).slice(0, 5)} to \${String(conflict.end_time).slice(0, 5)} \`" +
        "(\${conflict.status}). Please choose another time or room."
      );
      err.status = 409;
      err.code = 'DOUBLE_BOOKING';
      throw err;
    }

    const { rows } = await conn.query(
      \`INSERT INTO reservations
         (room_id, user_id, res_date, start_time, end_time, purpose, attendees, status)
       VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, 'Pending') RETURNING id\`,
      [roomId, req.session.user.id, date, startTime, endTime, purpose, attendees]
    );

    const reservationId = rows[0].id;

    for (const item of equipment) {
      await conn.query(
        'INSERT INTO reservation_equipment (reservation_id, equipment) VALUES (\$1, \$2)',
        [reservationId, item]
      );
    }

    await conn.query(
      \`INSERT INTO reservation_logs (reservation_id, actor_id, action, remarks)
       VALUES (\$1, \$2, 'Submitted', 'Reservation submitted for approval')\`,
      [reservationId, req.session.user.id]
    );

    await conn.query('COMMIT');

    res.status(201).json({
      message: 'Reservation submitted successfully.',
      reservationId
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
console.log('Chunk 2 written');