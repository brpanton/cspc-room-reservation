/**
 * One-shot database bootstrapper.
 *
 *   npm run init-db
 *
 * 1. Creates the cspc_reservation database and all tables (schema.sql)
 * 2. Seeds demo buildings, rooms and one account per role.
 *
 * It is safe to re-run: schema.sql uses CREATE TABLE IF NOT EXISTS and the
 * seeders use INSERT ... ON CONFLICT DO UPDATE / "skip if exists" checks.
 *
 * Requires DATABASE_URL in .env pointing to the PostgreSQL server (e.g.
 * postgres://user:pass@localhost:5432/postgres). The script will create the
 * target database (default cspc_reservation) if it does not exist.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_NAME = process.env.DB_NAME || 'cspc_reservation';

const rootPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/** Splits schema.sql into individual statements (strips comments first). */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  console.log(`[init-db] Connecting to PostgreSQL as DATABASE_URL...`);
  const root = await rootPool.connect();

  try {
    // ---- 0. Create target database if missing ----------------------------
    const { rows: dbRows } = await root.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_NAME]
    );
    if (!dbRows.length) {
      await root.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`[init-db] Created database "${DB_NAME}".`);
    } else {
      console.log(`[init-db] Database "${DB_NAME}" already exists.`);
    }
  } finally {
    root.release();
  }

  // ---- 1. Schema -------------------------------------------------------
  const appPool = new Pool({
    connectionString: `${process.env.DATABASE_URL.replace(/\/[^\/]+$/, `/${DB_NAME}`)}`,
    ssl: { rejectUnauthorized: false }
  });

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  for (const statement of splitStatements(schemaSql)) {
    await appPool.query(statement);
  }
  console.log(`[init-db] Schema applied (database "${DB_NAME}").`);

  // ---- 2. Buildings ----------------------------------------------------
  const legacyBuildingNames = [
    ['ICT Building', 'CCS BUILDING'],
    ['Engineering Laboratory', 'CAS BUILDING'],
    ['Main Hall', 'GREENBUILDING'],
    ['Science Building', 'ACADEMIC BUILDING II'],
    ['MULTI PORPUSE BUILDING', 'MULTI PURPOSE BUILDING']
  ];
  for (const [oldName, newName] of legacyBuildingNames) {
    const { rows: legacyRows } = await appPool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', [oldName]);
    const { rows: replacementRows } = await appPool.query('SELECT id FROM buildings WHERE name = $1 LIMIT 1', [newName]);
    if (legacyRows[0] && !replacementRows[0]) {
      await appPool.query('UPDATE buildings SET name = $1, location = NULL WHERE id = $2', [newName, legacyRows[0].id]);
    }
  }

  const buildings = [
    ['CCS BUILDING', null],
    ['CAS BUILDING', null],
    ['GREENBUILDING', null],
    ['ACADEMIC BUILDING II', null],
    ['MULTI PURPOSE BUILDING', null],
    ['ACADEMIC BUILDING I', null],
    ['CHS BUILDING', null],
    ['CITD BUILDING', null],
    ['LSB BUILDING', null]
  ];
  for (const [name, location] of buildings) {
    await appPool.query(
      'INSERT INTO buildings (name, location) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET location = EXCLUDED.location',
      [name, location]
    );
  }
  console.log(`[init-db] Seeded ${buildings.length} buildings.`);

  const { rows: buildingRows } = await appPool.query('SELECT id, name FROM buildings');
  const buildingId = Object.fromEntries(buildingRows.map((b) => [b.name, b.id]));

  // ---- 3. Rooms / Labs -------------------------------------------------
  const rooms = [
    [buildingId['CCS BUILDING'], 'Computer LABORATORY 1', 'laboratory', 45, 1, 1, 1],
    [buildingId['CCS BUILDING'], 'Computer LABORATORY 2', 'laboratory', 45, 1, 1, 0],
    [buildingId['CCS BUILDING'], 'Multimedia Laboratory', 'laboratory', 30, 1, 1, 1],
    [buildingId['CCS BUILDING'], 'MAC LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'OPEN LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'CS LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'ERP LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'IT LABORATORY 1', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'IT LABORATORY 2', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'LIS LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'NAS LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CCS BUILDING'], 'RISE LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CITD BUILDING'], 'COOKERY LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CITD BUILDING'], 'FABRICATION LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CITD BUILDING'], 'LATHE LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CITD BUILDING'], 'LATHE 2 LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'CHEMISTRY LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'HYDRAULIC LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'HC LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'PHYSICS LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'EE LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'MECHATRONICS LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'ME LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['LSB BUILDING'], 'ECTW LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['CAS BUILDING'], 'Electrical LABORATORY', 'laboratory', 35, 0, 0, 0],
    [buildingId['CAS BUILDING'], 'Drafting Laboratory', 'laboratory', 40, 1, 1, 0],
    [buildingId['CAS BUILDING'], 'BTVDED-FSM LABORATORY', 'laboratory', 30, 0, 0, 0],
    [buildingId['CAS BUILDING'], 'BTVDED LABORATORY', 'laboratory', 30, 0, 0, 0],
    [buildingId['CAS BUILDING'], 'CTDE COM LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['MULTI PURPOSE BUILDING'], 'Steno LABORATORY', 'laboratory', 40, 0, 0, 0],
    [buildingId['MULTI PURPOSE BUILDING'], 'Computer LABORATORY 1', 'laboratory', 40, 1, 1, 0],
    [buildingId['MULTI PURPOSE BUILDING'], 'Computer LABORATORY 2', 'laboratory', 40, 1, 1, 0],
    [buildingId['GREENBUILDING'], 'Green Laboratory 1', 'laboratory', 40, 0, 0, 0],
    [buildingId['GREENBUILDING'], 'Green Laboratory 2', 'laboratory', 40, 0, 0, 0],
    [buildingId['ACADEMIC BUILDING II'], 'Chemistry LABORATORY', 'laboratory', 32, 0, 0, 0],
    [buildingId['ACADEMIC BUILDING II'], 'Physics LABORATORY', 'laboratory', 32, 1, 1, 0],
    [buildingId['ACADEMIC BUILDING II'], 'Laboratory 3', 'laboratory', 32, 0, 0, 0],
    [buildingId['ACADEMIC BUILDING II'], 'Food LABORATORY', 'laboratory', 32, 0, 0, 0]
  ];

  const targetBuildingIds = [
    buildingId['MULTI PURPOSE BUILDING'],
    buildingId['ACADEMIC BUILDING II'],
    buildingId['GREENBUILDING']
  ];
  const desiredTargetRooms = rooms
    .filter(([building]) => targetBuildingIds.includes(building))
    .map(([, name]) => name);
  const placeholders = targetBuildingIds.map((_, i) => `$${i + 1}`).join(', ');
  const roomNameOffset = targetBuildingIds.length;
  const roomNamePlaceholders = desiredTargetRooms.map((_, i) => `$${roomNameOffset + i + 1}`).join(', ');
  await appPool.query(
    `UPDATE rooms SET is_active = 0
     WHERE building_id IN (${placeholders}) AND name NOT IN (${roomNamePlaceholders})`,
    [...targetBuildingIds, ...desiredTargetRooms]
  );

  for (const r of rooms) {
    await appPool.query(
      `INSERT INTO rooms (building_id, name, room_type, capacity, has_projector, has_aircon, has_sound)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (building_id, name) DO UPDATE SET
         room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity,
         has_projector = EXCLUDED.has_projector, has_aircon = EXCLUDED.has_aircon,
         has_sound = EXCLUDED.has_sound, is_active = 1`,
      r
    );
  }
  console.log(`[init-db] Seeded ${rooms.length} rooms.`);

  // CAS labs carry a floor label and a photo (public/img).
  const casLabPhotos = {
    'BTVDED-FSM LAB': ['/img/btvded-fsm-lab.jpg', '2nd Floor'],
    'BTVDED LAB': ['/img/btvded-lab.jpg', '2nd Floor'],
    'CTDE COM LAB': ['/img/ctde-com-lab.jpg', '2nd Floor'],
    'COMLAB 307': ['/img/comlab-307.jpg', '3rd Floor'],
    'DEVELOPMENT LAB': ['/img/development-lab.jpg', '3rd Floor'],
    'SPEECH AND LANGUAGE LAB': ['/img/speech-language-lab.jpg', '3rd Floor']
  };
  for (const [labName, [photo, floor]] of Object.entries(casLabPhotos)) {
    await appPool.query(
      'UPDATE rooms SET floor = $1, image_url = $2 WHERE building_id = $3 AND name = $4',
      [floor, photo, buildingId['CAS BUILDING'], labName]
    );
  }

  // CCS labs carry a floor label and a photo (public/img).
  const ccsLabPhotos = {
    'MAC LABORATORY': ['/img/mac-lab.jpg', '2nd Floor'],
    'OPEN LABORATORY': ['/img/open-lab.jpg', '2nd Floor'],
    'CS LABORATORY': ['/img/cs-lab.jpg', '3rd Floor'],
    'ERP LABORATORY': ['/img/erp-lab.jpg', '3rd Floor'],
    'IT LABORATORY 1': ['/img/it-lab1.jpg', '3rd Floor'],
    'IT LABORATORY 2': ['/img/it-lab2.jpg', '3rd Floor'],
    'LIS LABORATORY': ['/img/lis-lab.jpg', '4th Floor'],
    'NAS LABORATORY': ['/img/nas-lab.jpg', '4th Floor'],
    'RISE LABORATORY': ['/img/rise-lab.jpg', '4th Floor'],
    'COOKERY LABORATORY': ['/img/cookery-lab.jpg', '1st Floor'],
    'FABRICATION LABORATORY': ['/img/fabrication-lab.jpg', '1st Floor'],
    'LATHE LABORATORY': ['/img/lathe-lab.jpg', '1st Floor'],
    'LATHE 2 LABORATORY': ['/img/lathe2-lab.jpg', '1st Floor'],
    'CHEMISTRY LABORATORY': ['/img/chemistry-lab.jpg', '1st Floor'],
    'HYDRAULIC LABORATORY': ['/img/hydraulic-lab.jpg', '1st Floor'],
    'HC LABORATORY': ['/img/hc-lab.jpg', '1st Floor'],
    'PHYSICS LABORATORY': ['/img/physics-lab.jpg', '1st Floor']
  };
  for (const [labName, [photo, floor]] of Object.entries(ccsLabPhotos)) {
    await appPool.query(
      'UPDATE rooms SET floor = $1, image_url = $2 WHERE building_id = $3 AND name = $4',
      [floor, photo, buildingId['CCS BUILDING'], labName]
    );
  }

  // CITD labs carry a floor label and a photo (public/img).
  const citdLabPhotos = {
    'COOKERY LABORATORY': ['/img/cookery-lab.jpg', '1st Floor'],
    'FABRICATION LABORATORY': ['/img/fabrication-lab.jpg', '1st Floor'],
    'LATHE LABORATORY': ['/img/lathe-lab.jpg', '1st Floor'],
    'LATHE 2 LABORATORY': ['/img/lathe2-lab.jpg', '1st Floor']
  };
  for (const [labName, [photo, floor]] of Object.entries(citdLabPhotos)) {
    await appPool.query(
      'UPDATE rooms SET floor = $1, image_url = $2 WHERE building_id = $3 AND name = $4',
      [floor, photo, buildingId['CITD BUILDING'], labName]
    );
  }

  // LSB labs carry a floor label and a photo (public/img).
  const lsbLabPhotos = {
    'CHEMISTRY LABORATORY': ['/img/chemistry-lab.jpg', '1st Floor'],
    'HYDRAULIC LABORATORY': ['/img/hydraulic-lab.jpg', '1st Floor'],
    'HC LABORATORY': ['/img/hc-lab.jpg', '1st Floor'],
    'PHYSICS LABORATORY': ['/img/physics-lab.jpg', '1st Floor'],
    'EE LABORATORY': ['/img/ee-lab.jpg', '2nd Floor'],
    'MECHATRONICS LABORATORY': ['/img/mechatronics-lab.jpg', '2nd Floor'],
    'ME LABORATORY': ['/img/me-lab.jpg', '2nd Floor'],
    'ECTW LABORATORY': ['/img/ectw-lab.jpg', '2nd Floor']
  };
  for (const [labName, [photo, floor]] of Object.entries(lsbLabPhotos)) {
    await appPool.query(
      'UPDATE rooms SET floor = $1, image_url = $2 WHERE building_id = $3 AND name = $4',
      [floor, photo, buildingId['LSB BUILDING'], labName]
    );
  }

  // ---- 4. Accounts (one per role) ---------------------------------------
  // No credentials are hardcoded. The admin password comes from
  // SEED_ADMIN_PASSWORD in .env; when it is unset a strong random password is
  // generated instead. Only the bcrypt hash is stored in `users` -- the
  // plaintext is printed once below so you can record it (or change it later
  // from the admin dashboard).
  function seedPassword(envVar) {
    const configured = (process.env[envVar] || '').trim();
    if (configured) return configured;
    return crypto.randomBytes(15).toString('base64url'); // 20 chars, unguessable
  }

  const adminPassword = seedPassword('SEED_ADMIN_PASSWORD');
  const demoPassword = seedPassword('SEED_DEMO_PASSWORD');
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const demoHash = await bcrypt.hash(demoPassword, 10);

  const users = [
    ['2021-00123', 'Juan Dela Cruz', 'student@cspc.edu.ph', 'student', 'BS Computer Science', demoHash],
    ['FAC-0098', 'Prof. Maria Santos', 'faculty@cspc.edu.ph', 'faculty', 'College of Computer Studies', demoHash],
    ['CUST-0001', 'Engr. Pedro Reyes', 'custodian@cspc.edu.ph', 'custodian', 'Physical Facilities Office', demoHash],
    ['ADMIN-0001', 'Ms. Ana Bautista', 'admin@cspc.edu.ph', 'admin', 'Management Information Systems', adminHash]
  ];
  for (const [schoolId, fullName, email, role, dept, hash] of users) {
    await appPool.query(
      `INSERT INTO users (school_id, full_name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (school_id) DO UPDATE SET
         full_name = EXCLUDED.full_name, role = EXCLUDED.role,
         department = EXCLUDED.department, password_hash = EXCLUDED.password_hash`,
      [schoolId, fullName, email, hash, role, dept]
    );
  }
  console.log('[init-db] Seeded 4 accounts (only bcrypt hashes are stored in the database).');
  console.log('\n  ADMIN credentials -- save these somewhere safe:');
  console.log('    School ID : ADMIN-0001');
  console.log('    Email     : admin@cspc.edu.ph');
  console.log(`    Password  : ${adminPassword}${process.env.SEED_ADMIN_PASSWORD ? '' : '  (randomly generated)'}`);
  console.log('\n  Demo accounts (student/faculty/custodian):');
  console.log(`    Password  : ${demoPassword}${process.env.SEED_DEMO_PASSWORD ? '' : '  (randomly generated)'}`);
  console.log('\n  To choose your own, set SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD in .env and re-run this script.\n');

  await appPool.end();
  console.log('\n[init-db] Done. Start the app with:  npm start');
  console.log('[init-db] Then open http://localhost:' + (process.env.PORT || 3000));
}

main().catch((err) => {
  console.error('\n[init-db] FAILED:', err.message);
  if (err.code === '28P01') {
    console.error('[init-db] Check DATABASE_URL credentials in your .env file.');
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('[init-db] PostgreSQL does not appear to be running on that host/port.');
  }
  process.exit(1);
});
