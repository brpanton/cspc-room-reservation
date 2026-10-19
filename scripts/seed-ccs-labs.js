/* Seeds the CCS BUILDING 2nd-floor labs with their photos.
   Safe to re-run (idempotent). Run: node scripts/seed-ccs-labs.js */
'use strict';
require('dotenv').config();
const pool = require('../db');

const CCS_LABS = [
  { name: 'MAC LABORATORY', image: '/img/mac-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'OPEN LABORATORY', image: '/img/open-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'CS LABORATORY', image: '/img/cs-lab.jpg', capacity: 40, floor: '3rd Floor' },
  { name: 'ERP LABORATORY', image: '/img/erp-lab.jpg', capacity: 40, floor: '3rd Floor' },
  { name: 'IT LABORATORY 1', image: '/img/it-lab1.jpg', capacity: 40, floor: '3rd Floor' },
  { name: 'IT LABORATORY 2', image: '/img/it-lab2.jpg', capacity: 40, floor: '3rd Floor' },
  { name: 'LIS LABORATORY', image: '/img/lis-lab.jpg', capacity: 40, floor: '4th Floor' },
  { name: 'NAS LABORATORY', image: '/img/nas-lab.jpg', capacity: 40, floor: '4th Floor' },
  { name: 'RISE LABORATORY', image: '/img/rise-lab.jpg', capacity: 40, floor: '4th Floor' }
];

(async () => {
  // ---- 1. Columns (older databases) ----
  const { rows: cols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'floor'"
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(50) DEFAULT NULL');
    console.log('[seed-ccs-labs] Added rooms.floor column.');
  }
  const { rows: imgCols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'image_url'"
  );
  if (!imgCols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) DEFAULT NULL');
    console.log('[seed-ccs-labs] Added rooms.image_url column.');
  }

  // ---- 2. CCS building ----
  const { rows: ccsRows } = await pool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', ['CCS BUILDING']);
  const ccs = ccsRows[0];
  if (!ccs) throw new Error('CCS BUILDING not found in buildings table.');

  // ---- 3. Upsert the two labs ----
  for (const lab of CCS_LABS) {
    await pool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES ($1, $2, 'laboratory', $3, $4, $5, FALSE, FALSE, FALSE, TRUE)
       ON CONFLICT (building_id, name) DO UPDATE SET
         room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity,
         floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE`,
      [ccs.id, lab.name, lab.capacity, lab.floor, lab.image]
    );
    console.log(`[seed-ccs-labs] Upserted "${lab.name}" (${lab.floor}, ${lab.image}).`);
  }

  // ---- 4. Verify ----
  const { rows } = await pool.query(
    'SELECT id, name, room_type, capacity, floor, image_url, is_active FROM rooms WHERE building_id = $1 ORDER BY id',
    [ccs.id]
  );
  console.log('\nCCS BUILDING ROOMS NOW:');
  rows.forEach((r) => console.log(`  #${r.id} ${r.name} | ${r.room_type} | cap ${r.capacity} | ${r.floor} | ${r.image_url} | active ${r.is_active}`));

  await pool.end();
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
