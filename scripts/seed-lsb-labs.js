/* Seeds the LSB BUILDING 1st-floor labs with their photos.
   Safe to re-run (idempotent). Run: node scripts/seed-lsb-labs.js */
'use strict';
require('dotenv').config();
const { pool } = require('../db');

const LSB_LABS = [
  { name: 'CHEMISTRY LABORATORY', image: '/img/chemistry-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'HYDRAULIC LABORATORY', image: '/img/hydraulic-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'HC LABORATORY', image: '/img/hc-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'PHYSICS LABORATORY', image: '/img/physics-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'EE LABORATORY', image: '/img/ee-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'MECHATRONICS LABORATORY', image: '/img/mechatronics-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'ME LABORATORY', image: '/img/me-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'ECTW LABORATORY', image: '/img/ectw-lab.jpg', capacity: 40, floor: '2nd Floor' }
];

(async () => {
  // ---- 1. Columns (older databases) ----
  const [cols] = await pool.query('SHOW COLUMNS FROM rooms LIKE "floor"');
  if (!cols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(50) DEFAULT NULL AFTER capacity');
    console.log('[seed-lsb-labs] Added rooms.floor column.');
  }
  const [imgCols] = await pool.query('SHOW COLUMNS FROM rooms LIKE "image_url"');
  if (!imgCols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) DEFAULT NULL AFTER floor');
    console.log('[seed-lsb-labs] Added rooms.image_url column.');
  }

  // ---- 2. LSB building (create if missing) ----
  await pool.query(
    'INSERT INTO buildings (name, location) VALUES (?, ?) ON DUPLICATE KEY UPDATE location = VALUES(location)',
    ['LSB BUILDING', null]
  );
  const [[lsb]] = await pool.query('SELECT id FROM buildings WHERE name = ? LIMIT 1', ['LSB BUILDING']);
  if (!lsb) throw new Error('LSB BUILDING not found in buildings table.');

  // ---- 3. Upsert the labs ----
  for (const lab of LSB_LABS) {
    await pool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES (?, ?, 'laboratory', ?, ?, ?, 0, 0, 0, 1)
       ON DUPLICATE KEY UPDATE
         room_type = 'laboratory', capacity = VALUES(capacity),
         floor = VALUES(floor), image_url = VALUES(image_url), is_active = 1`,
      [lsb.id, lab.name, lab.capacity, lab.floor, lab.image]
    );
    console.log(`[seed-lsb-labs] Upserted "${lab.name}" (${lab.floor}, ${lab.image}).`);
  }

  // ---- 4. Verify ----
  const [rows] = await pool.query(
    'SELECT id, name, room_type, capacity, floor, image_url, is_active FROM rooms WHERE building_id = ? ORDER BY id',
    [lsb.id]
  );
  console.log('\nLSB BUILDING ROOMS NOW:');
  rows.forEach((r) => console.log(`  #${r.id} ${r.name} | ${r.room_type} | cap ${r.capacity} | ${r.floor} | ${r.image_url} | active ${r.is_active}`));

  await pool.end();
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
