/* Seeds the CITD BUILDING 1st-floor labs with their photos.
   Safe to re-run (idempotent). Run: node scripts/seed-citd-labs.js */
'use strict';
require('dotenv').config();
const pool = require('../db');

const CITD_LABS = [
  { name: 'COOKERY LABORATORY', image: '/img/cookery-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'FABRICATION LABORATORY', image: '/img/fabrication-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'LATHE LABORATORY', image: '/img/lathe-lab.jpg', capacity: 40, floor: '1st Floor' },
  { name: 'LATHE 2 LABORATORY', image: '/img/lathe2-lab.jpg', capacity: 40, floor: '1st Floor' }
];

(async () => {
  // ---- 1. Columns (older databases) ----
  const { rows: cols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'floor'"
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(50) DEFAULT NULL');
    console.log('[seed-citd-labs] Added rooms.floor column.');
  }
  const { rows: imgCols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'image_url'"
  );
  if (!imgCols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) DEFAULT NULL');
    console.log('[seed-citd-labs] Added rooms.image_url column.');
  }

  // ---- 2. CITD building (create if missing) ----
  await pool.query(
    'INSERT INTO buildings (name, location) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET location = EXCLUDED.location',
    ['CITD BUILDING', null]
  );
  const { rows: citdRows } = await pool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', ['CITD BUILDING']);
  const citd = citdRows[0];
  if (!citd) throw new Error('CITD BUILDING not found in buildings table.');

  // ---- 3. Upsert the labs ----
  for (const lab of CITD_LABS) {
    await pool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES ($1, $2, 'laboratory', $3, $4, $5, FALSE, FALSE, FALSE, TRUE)
       ON CONFLICT (building_id, name) DO UPDATE SET
         room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity,
         floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE`,
      [citd.id, lab.name, lab.capacity, lab.floor, lab.image]
    );
    console.log(`[seed-citd-labs] Upserted "${lab.name}" (${lab.floor}, ${lab.image}).`);
  }

  // ---- 4. Verify ----
  const { rows } = await pool.query(
    'SELECT id, name, room_type, capacity, floor, image_url, is_active FROM rooms WHERE building_id = $1 ORDER BY id',
    [citd.id]
  );
  console.log('\nCITD BUILDING ROOMS NOW:');
  rows.forEach((r) => console.log(`  #${r.id} ${r.name} | ${r.room_type} | cap ${r.capacity} | ${r.floor} | ${r.image_url} | active ${r.is_active}`));

  await pool.end();
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
