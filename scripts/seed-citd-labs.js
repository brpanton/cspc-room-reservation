/* Seeds the CITD BUILDING 1st-floor labs with their photos.
   Safe to re-run (idempotent). Run: node scripts/seed-citd-labs.js */
'use strict';
require('dotenv').config();
const { pool } = require('../db');

const CITD_LABS = [
  { name: 'COOKERY LABORATORY', image: '/img/cookery-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'FABRICATION LABORATORY', image: '/img/fabrication-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'LATHE LABORATORY', image: '/img/lathe-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'LATHE 2 LABORATORY', image: '/img/lathe2-lab.jpg', capacity: 40, floor: '1st Floor' }
];

(async () => {
  // ---- 1. Columns (older databases) ----
  const [cols] = await pool.query('SHOW COLUMNS FROM rooms LIKE "floor"');
  if (!cols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(50) DEFAULT NULL AFTER capacity');
    console.log('[seed-citd-labs] Added rooms.floor column.');
  }
  const [imgCols] = await pool.query('SHOW COLUMNS FROM rooms LIKE "image_url"');
  if (!imgCols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) DEFAULT NULL AFTER floor');
    console.log('[seed-citd-labs] Added rooms.image_url column.');
  }

  // ---- 2. CITD building (create if missing) ----
  await pool.query(
    'INSERT INTO buildings (name, location) VALUES (?, ?) ON DUPLICATE KEY UPDATE location = VALUES(location)',
    ['CITD BUILDING', null]
  );
  const [[citd]] = await pool.query('SELECT id FROM buildings WHERE name = ? LIMIT 1', ['CITD BUILDING']);
  if (!citd) throw new Error('CITD BUILDING not found in buildings table.');

  // ---- 3. Upsert the labs ----
  for (const lab of CITD_LABS) {
    await pool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES (?, ?, 'laboratory', ?, ?, ?, 0, 0, 0, 1)
       ON DUPLICATE KEY UPDATE
         room_type = 'laboratory', capacity = VALUES(capacity),
         floor = VALUES(floor), image_url = VALUES(image_url), is_active = 1`,
      [citd.id, lab.name, lab.capacity, lab.floor, lab.image]
    );
    console.log(`[seed-citd-labs] Upserted "${lab.name}" (${lab.floor}, ${lab.image}).`);
  }

  // ---- 4. Verify ----
  const [rows] = await pool.query(
    'SELECT id, name, room_type, capacity, floor, image_url, is_active FROM rooms WHERE building_id = ? ORDER BY id',
    [citd.id]
  );
  console.log('\nCITD BUILDING ROOMS NOW:');
  rows.forEach((r) => console.log(`  #${r.id} ${r.name} | ${r.room_type} | cap ${r.capacity} | ${r.floor} | ${r.image_url} | active ${r.is_active}`));

  await pool.end();
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
