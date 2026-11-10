/**
 * Comprehensive CSPC Campus Database Seeder
 *
 * Restores and synchronizes all official CSPC Buildings, Rooms, and Laboratories
 * with verified image URLs, building codes, capacities, and floor levels.
 *
 * Safe to re-run: Uses ON CONFLICT DO UPDATE so it never throws duplicate key errors.
 *
 * Run with:
 *   node scripts/seed.js
 *   or
 *   npm run seed
 */
'use strict';
require('dotenv').config();
const pool = require('../db');

const BUILDINGS = [
  {
    name: 'CCS BUILDING',
    building_code: 'CCS',
    location: 'Main Campus - West Wing',
    cover_image_url: '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg',
    description: 'College of Computer Studies — Computer Science, IT, and specialized computing labs.'
  },
  {
    name: 'CAS BUILDING',
    building_code: 'CAS',
    location: 'Main Campus - East Wing',
    cover_image_url: '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg',
    description: 'College of Arts and Sciences — Educational technology, language, and vocational training facilities.'
  },
  {
    name: 'GREENBUILDING',
    building_code: 'GB',
    location: 'Campus Quadrangle',
    cover_image_url: '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg',
    description: 'CSPC Green Building — Eco-friendly modern academic and laboratory facilities.'
  },
  {
    name: 'ACADEMIC BUILDING II',
    building_code: 'ACAD2',
    location: 'Academic Zone',
    cover_image_url: '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    description: 'Academic Building II — Science, physics, chemistry, and specialized food laboratories.'
  },
  {
    name: 'MULTI PURPOSE BUILDING',
    building_code: 'MPB',
    location: 'Student Activity Complex',
    cover_image_url: '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    description: 'Multi-Purpose Building — Assembly halls, business, and computer laboratories.'
  },
  {
    name: 'ACADEMIC BUILDING I',
    building_code: 'ACAD1',
    location: 'Academic Zone',
    cover_image_url: '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg',
    description: 'Academic Building I — Lecture halls and foundational academic spaces.'
  },
  {
    name: 'CHS BUILDING',
    building_code: 'CHS',
    location: 'Health Science Quadrangle',
    cover_image_url: '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg',
    description: 'College of Health Sciences — Nursing, clinical simulation, and medical science laboratories.'
  },
  {
    name: 'CITD BUILDING',
    building_code: 'CITD',
    location: 'Technology Complex',
    cover_image_url: '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    description: 'College of Industrial Technology & Development — Industrial workshops, culinary, and fabrication labs.'
  },
  {
    name: 'LSB BUILDING',
    building_code: 'LSB',
    location: 'Science Complex',
    cover_image_url: '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg',
    description: 'Laboratory Science Building — Advanced engineering, electronics, hydraulics, and chemistry.'
  }
];

const ROOMS = [
  // ------------------------------------------------ CCS BUILDING
  {
    building: 'CCS BUILDING',
    name: 'MAC LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/mac-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CCS BUILDING',
    name: 'OPEN LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/open-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'CS LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '3rd Floor',
    image_url: '/img/cs-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CCS BUILDING',
    name: 'ERP LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '3rd Floor',
    image_url: '/img/erp-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'IT LABORATORY 1',
    room_type: 'laboratory',
    capacity: 40,
    floor: '3rd Floor',
    image_url: '/img/it-lab1.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'IT LABORATORY 2',
    room_type: 'laboratory',
    capacity: 40,
    floor: '3rd Floor',
    image_url: '/img/it-lab2.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'LIS LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '4th Floor',
    image_url: '/img/lis-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'NAS LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '4th Floor',
    image_url: '/img/nas-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'RISE LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '4th Floor',
    image_url: '/img/rise-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CCS BUILDING',
    name: 'Computer LABORATORY 1',
    room_type: 'laboratory',
    capacity: 45,
    floor: '2nd Floor',
    image_url: '/img/it-lab1.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CCS BUILDING',
    name: 'Computer LABORATORY 2',
    room_type: 'laboratory',
    capacity: 45,
    floor: '2nd Floor',
    image_url: '/img/it-lab2.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CCS BUILDING',
    name: 'Multimedia Laboratory',
    room_type: 'laboratory',
    capacity: 30,
    floor: '3rd Floor',
    image_url: '/img/cs-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },

  // ------------------------------------------------ CAS BUILDING
  {
    building: 'CAS BUILDING',
    name: 'BTVDED-FSM LABORATORY',
    room_type: 'laboratory',
    capacity: 30,
    floor: '2nd Floor',
    image_url: '/img/btvded-fsm-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CAS BUILDING',
    name: 'BTVDED LABORATORY',
    room_type: 'laboratory',
    capacity: 30,
    floor: '2nd Floor',
    image_url: '/img/btvded-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CAS BUILDING',
    name: 'CTDE COM LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/ctde-com-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CAS BUILDING',
    name: 'COMLAB 307',
    room_type: 'laboratory',
    capacity: 40,
    floor: '3rd Floor',
    image_url: '/img/comlab-307.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CAS BUILDING',
    name: 'DEVELOPMENT LAB',
    room_type: 'laboratory',
    capacity: 30,
    floor: '3rd Floor',
    image_url: '/img/development-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CAS BUILDING',
    name: 'SPEECH AND LANGUAGE LAB',
    room_type: 'laboratory',
    capacity: 30,
    floor: '3rd Floor',
    image_url: '/img/speech-language-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'CAS BUILDING',
    name: 'Electrical LABORATORY',
    room_type: 'laboratory',
    capacity: 35,
    floor: '1st Floor',
    image_url: '/img/ee-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CAS BUILDING',
    name: 'Drafting Laboratory',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/open-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ CITD BUILDING
  {
    building: 'CITD BUILDING',
    name: 'COOKERY LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/cookery-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CITD BUILDING',
    name: 'FABRICATION LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/fabrication-lab.jpg',
    has_projector: false,
    has_aircon: false,
    has_sound: false
  },
  {
    building: 'CITD BUILDING',
    name: 'LATHE LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/lathe-lab.jpg',
    has_projector: false,
    has_aircon: false,
    has_sound: false
  },
  {
    building: 'CITD BUILDING',
    name: 'LATHE 2 LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/lathe2-lab.jpg',
    has_projector: false,
    has_aircon: false,
    has_sound: false
  },

  // ------------------------------------------------ LSB BUILDING
  {
    building: 'LSB BUILDING',
    name: 'CHEMISTRY LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/chemistry-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'HYDRAULIC LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/hydraulic-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'HC LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/hc-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'PHYSICS LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/physics-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'EE LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/ee-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'MECHATRONICS LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/mechatronics-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'ME LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/me-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'LSB BUILDING',
    name: 'ECTW LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/ectw-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ GREENBUILDING
  {
    building: 'GREENBUILDING',
    name: 'Green Laboratory 1',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/open-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'GREENBUILDING',
    name: 'Green Laboratory 2',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/development-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ ACADEMIC BUILDING II
  {
    building: 'ACADEMIC BUILDING II',
    name: 'Chemistry LABORATORY',
    room_type: 'laboratory',
    capacity: 32,
    floor: '1st Floor',
    image_url: '/img/chemistry-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'ACADEMIC BUILDING II',
    name: 'Physics LABORATORY',
    room_type: 'laboratory',
    capacity: 32,
    floor: '1st Floor',
    image_url: '/img/physics-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'ACADEMIC BUILDING II',
    name: 'Laboratory 3',
    room_type: 'laboratory',
    capacity: 32,
    floor: '2nd Floor',
    image_url: '/img/open-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'ACADEMIC BUILDING II',
    name: 'Food LABORATORY',
    room_type: 'laboratory',
    capacity: 32,
    floor: '2nd Floor',
    image_url: '/img/cookery-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ MULTI PURPOSE BUILDING
  {
    building: 'MULTI PURPOSE BUILDING',
    name: 'Steno LABORATORY',
    room_type: 'laboratory',
    capacity: 40,
    floor: '1st Floor',
    image_url: '/img/mac-lab.jpg',
    has_projector: false,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'MULTI PURPOSE BUILDING',
    name: 'Computer LABORATORY 1',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/comlab-307.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'MULTI PURPOSE BUILDING',
    name: 'Computer LABORATORY 2',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/it-lab1.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ ACADEMIC BUILDING I
  {
    building: 'ACADEMIC BUILDING I',
    name: 'Lecture Hall A',
    room_type: 'hall',
    capacity: 50,
    floor: '1st Floor',
    image_url: '/img/open-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: true
  },
  {
    building: 'ACADEMIC BUILDING I',
    name: 'Science Laboratory 1',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/physics-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },

  // ------------------------------------------------ CHS BUILDING
  {
    building: 'CHS BUILDING',
    name: 'Nursing Simulation Lab',
    room_type: 'laboratory',
    capacity: 35,
    floor: '1st Floor',
    image_url: '/img/hc-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  },
  {
    building: 'CHS BUILDING',
    name: 'Health Sciences Laboratory',
    room_type: 'laboratory',
    capacity: 40,
    floor: '2nd Floor',
    image_url: '/img/chemistry-lab.jpg',
    has_projector: true,
    has_aircon: true,
    has_sound: false
  }
];

async function seed() {
  console.log('--- Starting CSPC Campus Database Seeder ---');

  // Ensure necessary columns exist in the database schema
  await pool.query(`
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_code VARCHAR(30) DEFAULT NULL;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(255) DEFAULT NULL;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor VARCHAR(50) DEFAULT NULL;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT NULL;
  `);

  // 1. Seed Buildings
  console.log(`\n[1/3] Seeding ${BUILDINGS.length} CSPC Buildings...`);
  const buildingIdMap = {};

  for (const b of BUILDINGS) {
    const { rows } = await pool.query(
      `INSERT INTO buildings (name, building_code, location, cover_image_url, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         building_code = EXCLUDED.building_code,
         location = COALESCE(EXCLUDED.location, buildings.location),
         cover_image_url = EXCLUDED.cover_image_url,
         description = EXCLUDED.description
       RETURNING id, name`,
      [b.name, b.building_code, b.location, b.cover_image_url, b.description]
    );
    const id = rows[0]?.id;
    buildingIdMap[b.name] = id;
    console.log(`  ✓ Building: [${b.building_code}] ${b.name} (id: ${id}, cover: ${b.cover_image_url})`);
  }

  // 2. Seed Rooms / Laboratories
  console.log(`\n[2/3] Seeding ${ROOMS.length} CSPC Laboratories and Rooms...`);
  let roomCount = 0;

  for (const r of ROOMS) {
    const buildingId = buildingIdMap[r.building];
    if (!buildingId) {
      console.warn(`  ⚠ Warning: Building "${r.building}" not found for room "${r.name}". Skipping.`);
      continue;
    }

    const { rows } = await pool.query(
      `INSERT INTO rooms
         (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       ON CONFLICT (building_id, name) DO UPDATE SET
         room_type = EXCLUDED.room_type,
         capacity = EXCLUDED.capacity,
         floor = EXCLUDED.floor,
         image_url = EXCLUDED.image_url,
         has_projector = EXCLUDED.has_projector,
         has_aircon = EXCLUDED.has_aircon,
         has_sound = EXCLUDED.has_sound,
         is_active = TRUE
       RETURNING id, name`,
      [
        buildingId,
        r.name,
        r.room_type,
        r.capacity,
        r.floor,
        r.image_url,
        r.has_projector,
        r.has_aircon,
        r.has_sound
      ]
    );

    const roomId = rows[0]?.id;
    roomCount++;
    console.log(`  ✓ Room #${roomId}: ${r.name} | ${r.building} (${r.floor}) | cap: ${r.capacity} | img: ${r.image_url}`);
  }

  // 3. Synchronize facility_images for Showcase Carousel
  console.log(`\n[3/3] Synchronizing facility_images for Showcase and Galleries...`);
  // Ensure facility_images table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facility_images (
      id            SERIAL PRIMARY KEY,
      target_type   VARCHAR(20)  NOT NULL CHECK (target_type IN ('room', 'building')),
      room_id       INT          DEFAULT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      building_id   INT          DEFAULT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      image_url     VARCHAR(255) NOT NULL,
      caption       VARCHAR(160) DEFAULT NULL,
      is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
      display_order INT          NOT NULL DEFAULT 0,
      uploaded_by   INT          DEFAULT NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_fi_target CHECK (
        (target_type = 'room'     AND room_id IS NOT NULL) OR
        (target_type = 'building' AND building_id IS NOT NULL)
      )
    );
  `);

  // Clear obsolete or mismatched room/building facility_images and re-populate cleanly
  await pool.query('DELETE FROM facility_images');

  // Insert building primary covers
  for (const b of BUILDINGS) {
    const bId = buildingIdMap[b.name];
    if (bId && b.cover_image_url) {
      await pool.query(
        `INSERT INTO facility_images (target_type, building_id, image_url, caption, is_primary, display_order)
         VALUES ('building', $1, $2, $3, TRUE, 0)`,
        [bId, b.cover_image_url, `${b.name} Exterior`]
      );
    }
  }

  // Insert room primary photos
  const { rows: allRooms } = await pool.query(
    'SELECT id, name, image_url FROM rooms WHERE is_active = TRUE AND image_url IS NOT NULL'
  );
  for (const room of allRooms) {
    await pool.query(
      `INSERT INTO facility_images (target_type, room_id, image_url, caption, is_primary, display_order)
       VALUES ('room', $1, $2, $3, TRUE, 0)`,
      [room.id, room.image_url, `${room.name} — Facility View`]
    );
  }

  console.log(`  ✓ Synced ${BUILDINGS.length} building covers and ${allRooms.length} room photos in facility_images.`);
  console.log(`\n=== Seeding Complete: ${BUILDINGS.length} Buildings and ${roomCount} Rooms restored! ===\n`);
}

if (require.main === module) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed Error:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { seed, BUILDINGS, ROOMS };

