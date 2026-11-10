-- ============================================================================
-- CSPC Campus Laboratory & Room Reservation Portal - Database Seed
-- Standard Buildings, Laboratories, and Room Records
--
-- Safe to re-run: Uses ON CONFLICT (name) / ON CONFLICT (building_id, name)
-- ============================================================================

-- Ensure required columns exist
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS building_code VARCHAR(30) DEFAULT NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(255) DEFAULT NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor VARCHAR(50) DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 1. CSPC Buildings
-- ----------------------------------------------------------------------------
INSERT INTO buildings (name, building_code, location, cover_image_url, description)
VALUES
  ('CCS BUILDING', 'CCS', 'Main Campus - West Wing', '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg', 'College of Computer Studies — Computer Science, IT, and specialized computing labs.'),
  ('CAS BUILDING', 'CAS', 'Main Campus - East Wing', '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg', 'College of Arts and Sciences — Educational technology, language, and vocational training facilities.'),
  ('GREENBUILDING', 'GB', 'Campus Quadrangle', '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg', 'CSPC Green Building — Eco-friendly modern academic and laboratory facilities.'),
  ('ACADEMIC BUILDING II', 'ACAD2', 'Academic Zone', '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'Academic Building II — Science, physics, chemistry, and specialized food laboratories.'),
  ('MULTI PURPOSE BUILDING', 'MPB', 'Student Activity Complex', '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg', 'Multi-Purpose Building — Assembly halls, business, and computer laboratories.'),
  ('ACADEMIC BUILDING I', 'ACAD1', 'Academic Zone', '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'Academic Building I — Lecture halls and foundational academic spaces.'),
  ('CHS BUILDING', 'CHS', 'Health Science Quadrangle', '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg', 'College of Health Sciences — Nursing, clinical simulation, and medical science laboratories.'),
  ('CITD BUILDING', 'CITD', 'Technology Complex', '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'College of Industrial Technology & Development — Industrial workshops, culinary, and fabrication labs.'),
  ('LSB BUILDING', 'LSB', 'Science Complex', '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'Laboratory Science Building — Advanced engineering, electronics, hydraulics, and chemistry.')
ON CONFLICT (name) DO UPDATE SET
  building_code = EXCLUDED.building_code,
  location = COALESCE(EXCLUDED.location, buildings.location),
  cover_image_url = EXCLUDED.cover_image_url,
  description = EXCLUDED.description;

-- ----------------------------------------------------------------------------
-- 2. Laboratories and Rooms
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ccs_id INT;
  v_cas_id INT;
  v_citd_id INT;
  v_lsb_id INT;
  v_gb_id INT;
  v_acad2_id INT;
  v_mpb_id INT;
  v_acad1_id INT;
  v_chs_id INT;
BEGIN
  SELECT id INTO v_ccs_id FROM buildings WHERE name = 'CCS BUILDING';
  SELECT id INTO v_cas_id FROM buildings WHERE name = 'CAS BUILDING';
  SELECT id INTO v_citd_id FROM buildings WHERE name = 'CITD BUILDING';
  SELECT id INTO v_lsb_id FROM buildings WHERE name = 'LSB BUILDING';
  SELECT id INTO v_gb_id FROM buildings WHERE name = 'GREENBUILDING';
  SELECT id INTO v_acad2_id FROM buildings WHERE name = 'ACADEMIC BUILDING II';
  SELECT id INTO v_mpb_id FROM buildings WHERE name = 'MULTI PURPOSE BUILDING';
  SELECT id INTO v_acad1_id FROM buildings WHERE name = 'ACADEMIC BUILDING I';
  SELECT id INTO v_chs_id FROM buildings WHERE name = 'CHS BUILDING';

  -- CCS Building Laboratories
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_ccs_id, 'MAC LABORATORY', 'laboratory', 40, '2nd Floor', '/img/mac-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_ccs_id, 'OPEN LABORATORY', 'laboratory', 40, '2nd Floor', '/img/open-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'CS LABORATORY', 'laboratory', 40, '3rd Floor', '/img/cs-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_ccs_id, 'ERP LABORATORY', 'laboratory', 40, '3rd Floor', '/img/erp-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'IT LABORATORY 1', 'laboratory', 40, '3rd Floor', '/img/it-lab1.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'IT LABORATORY 2', 'laboratory', 40, '3rd Floor', '/img/it-lab2.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'LIS LABORATORY', 'laboratory', 40, '4th Floor', '/img/lis-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'NAS LABORATORY', 'laboratory', 40, '4th Floor', '/img/nas-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'RISE LABORATORY', 'laboratory', 40, '4th Floor', '/img/rise-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_ccs_id, 'Computer LABORATORY 1', 'laboratory', 45, '2nd Floor', '/img/it-lab1.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_ccs_id, 'Computer LABORATORY 2', 'laboratory', 45, '2nd Floor', '/img/it-lab2.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_ccs_id, 'Multimedia Laboratory', 'laboratory', 30, '3rd Floor', '/img/cs-lab.jpg', TRUE, TRUE, TRUE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- CAS Building Laboratories
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_cas_id, 'BTVDED-FSM LABORATORY', 'laboratory', 30, '2nd Floor', '/img/btvded-fsm-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_cas_id, 'BTVDED LABORATORY', 'laboratory', 30, '2nd Floor', '/img/btvded-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_cas_id, 'CTDE COM LABORATORY', 'laboratory', 40, '2nd Floor', '/img/ctde-com-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_cas_id, 'COMLAB 307', 'laboratory', 40, '3rd Floor', '/img/comlab-307.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_cas_id, 'DEVELOPMENT LAB', 'laboratory', 30, '3rd Floor', '/img/development-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_cas_id, 'SPEECH AND LANGUAGE LAB', 'laboratory', 30, '3rd Floor', '/img/speech-language-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_cas_id, 'Electrical LABORATORY', 'laboratory', 35, '1st Floor', '/img/ee-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_cas_id, 'Drafting Laboratory', 'laboratory', 40, '2nd Floor', '/img/open-lab.jpg', TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- CITD Building Laboratories
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_citd_id, 'COOKERY LABORATORY', 'laboratory', 40, '1st Floor', '/img/cookery-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_citd_id, 'FABRICATION LABORATORY', 'laboratory', 40, '1st Floor', '/img/fabrication-lab.jpg', FALSE, FALSE, FALSE, TRUE),
    (v_citd_id, 'LATHE LABORATORY', 'laboratory', 40, '1st Floor', '/img/lathe-lab.jpg', FALSE, FALSE, FALSE, TRUE),
    (v_citd_id, 'LATHE 2 LABORATORY', 'laboratory', 40, '1st Floor', '/img/lathe2-lab.jpg', FALSE, FALSE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- LSB Building Laboratories
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_lsb_id, 'CHEMISTRY LABORATORY', 'laboratory', 40, '1st Floor', '/img/chemistry-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'HYDRAULIC LABORATORY', 'laboratory', 40, '1st Floor', '/img/hydraulic-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'HC LABORATORY', 'laboratory', 40, '1st Floor', '/img/hc-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'PHYSICS LABORATORY', 'laboratory', 40, '1st Floor', '/img/physics-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'EE LABORATORY', 'laboratory', 40, '2nd Floor', '/img/ee-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'MECHATRONICS LABORATORY', 'laboratory', 40, '2nd Floor', '/img/mechatronics-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'ME LABORATORY', 'laboratory', 40, '2nd Floor', '/img/me-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_lsb_id, 'ECTW LABORATORY', 'laboratory', 40, '2nd Floor', '/img/ectw-lab.jpg', FALSE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- Green Building Laboratories
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_gb_id, 'Green Laboratory 1', 'laboratory', 40, '1st Floor', '/img/open-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_gb_id, 'Green Laboratory 2', 'laboratory', 40, '2nd Floor', '/img/development-lab.jpg', TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- Academic Building II
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_acad2_id, 'Chemistry LABORATORY', 'laboratory', 32, '1st Floor', '/img/chemistry-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_acad2_id, 'Physics LABORATORY', 'laboratory', 32, '1st Floor', '/img/physics-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_acad2_id, 'Laboratory 3', 'laboratory', 32, '2nd Floor', '/img/open-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_acad2_id, 'Food LABORATORY', 'laboratory', 32, '2nd Floor', '/img/cookery-lab.jpg', FALSE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- Multi-Purpose Building
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_mpb_id, 'Steno LABORATORY', 'laboratory', 40, '1st Floor', '/img/mac-lab.jpg', FALSE, TRUE, FALSE, TRUE),
    (v_mpb_id, 'Computer LABORATORY 1', 'laboratory', 40, '2nd Floor', '/img/comlab-307.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_mpb_id, 'Computer LABORATORY 2', 'laboratory', 40, '2nd Floor', '/img/it-lab1.jpg', TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- Academic Building I
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_acad1_id, 'Lecture Hall A', 'hall', 50, '1st Floor', '/img/open-lab.jpg', TRUE, TRUE, TRUE, TRUE),
    (v_acad1_id, 'Science Laboratory 1', 'laboratory', 40, '2nd Floor', '/img/physics-lab.jpg', TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

  -- CHS Building
  INSERT INTO rooms (building_id, name, room_type, capacity, floor, image_url, has_projector, has_aircon, has_sound, is_active)
  VALUES
    (v_chs_id, 'Nursing Simulation Lab', 'laboratory', 35, '1st Floor', '/img/hc-lab.jpg', TRUE, TRUE, FALSE, TRUE),
    (v_chs_id, 'Health Sciences Laboratory', 'laboratory', 40, '2nd Floor', '/img/chemistry-lab.jpg', TRUE, TRUE, FALSE, TRUE)
  ON CONFLICT (building_id, name) DO UPDATE SET
    room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, floor = EXCLUDED.floor, image_url = EXCLUDED.image_url, is_active = TRUE;

END $$;

