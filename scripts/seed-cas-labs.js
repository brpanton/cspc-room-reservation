/* Adds floor/image_url to rooms (if missing) and seeds the CAS BUILDING
   labs with their photos. Safe to re-run (idempotent). */
'use strict';
require('dotenv').config();
const pool = require('../db');

const CAS_LABS = [
  { name: 'BTVDED-FSM LAB', image: '/img/btvded-fsm-lab.jpg', capacity: 30, floor: '2nd Floor' },
  { name: 'BTVDED LAB', image: '/img/btvded-lab.jpg', capacity: 30, floor: '2nd Floor' },
  { name: 'CTDE COM LAB', image: '/img/ctde-com-lab.jpg', capacity: 40, floor: '2nd Floor' },
  { name: 'COMLAB 307', image: '/img/comlab-307.jpg', capacity: 40, floor: '3rd Floor' },
  { name: 'DEVELOPMENT LAB', image: '/img/development-lab.jpg', capacity: 30, floor: '3rd Floor' },
  { name: 'SPEECH AND LANGUAGE LAB', image: '/img/speech-language-lab.jpg', capacity: 30, floor: '3rd Floor' }
];

(async () => {
  // ---- 1. Columns (older databases) ----
  const { rows: cols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'floor'"
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(50) DEFAULT NULL');
    console.log('[seed-cas-labs] Added rooms.floor column.');
  }
  const { rows: imgCols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'image_url'"
  );
  if (!imgCols.length) {
    await pool.query('ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) DEFAULT NULL');
    console.log('[seed-cas-labs] Added rooms.image_url column.');
  }

  // ---- 2. CAS building ----
  const { rows: casRows } = await pool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', ['CAS BUILDING']);
  const cas = casRows[0];
  if (!cas) throw new Error('CAS BUILDING not found in buildings table.');

  // ---- 3. Upsert the CAS labs ----
  for (const lab of CAS_LABS) {
    await pool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES ($1, $2, 'laboratory', $3, $4, $5, FALSE, FALSE, FALSE, TRUE)
       ON CONFLICT (building_id, name) DO UPDATE SET
         room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity,
         floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE`,
      [cas.id, lab.name, lab.capacity, lab.floor, lab.image]
    );
    console.log(`[seed-cas-labs] Upserted "${lab.name}" (${lab.floor}, ${lab.image}).`);
  }

  // ---- 4. Verify ----
  const { rows } = await pool.query(
    'SELECT id, name, room_type, capacity, floor, image_url, is_active FROM rooms WHERE building_id = $1 ORDER BY id',
    [cas.id]
  );
  console.log('\nCAS BUILDING ROOMS NOW:');
  rows.forEach((r) => console.log(`  #${r.id} ${r.name} | ${r.room_type} | cap ${r.capacity} | ${r.floor} | ${r.image_url} | active ${r.is_active}`));

  await pool.end();
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
