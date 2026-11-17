-- ============================================================
-- AssemblyPC PostgreSQL Schema
-- Single source of truth for Admin Dashboard and Simulator
-- Database: pc_builder_simulation
-- ============================================================

BEGIN;

-- Rebuild component tables. Saved builds are kept unless you drop them manually.
DROP TABLE IF EXISTS admin_cpu CASCADE;
DROP TABLE IF EXISTS admin_gpu CASCADE;
DROP TABLE IF EXISTS admin_psu CASCADE;
DROP TABLE IF EXISTS admin_ssd CASCADE;
DROP TABLE IF EXISTS admin_hdd CASCADE;
DROP TABLE IF EXISTS admin_fan CASCADE;
DROP TABLE IF EXISTS admin_mobo CASCADE;
DROP TABLE IF EXISTS admin_ram CASCADE;
DROP TABLE IF EXISTS compatibility_test_cases CASCADE;

-- ============================================================
-- ADMIN DASHBOARD COMPONENT TABLES
-- ============================================================

CREATE TABLE admin_cpu (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    family VARCHAR(100),
    cores VARCHAR(50),
    "baseClock" VARCHAR(50),
    "turboClock" VARCHAR(50),
    cache VARCHAR(100),
    igpu VARCHAR(150),
    tdp VARCHAR(50),
    "memSupport" VARCHAR(150),
    socket VARCHAR(50),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_gpu (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "memType" VARCHAR(100),
    "memCapacity" VARCHAR(100),
    "busWidth" VARCHAR(100),
    "coreClock" VARCHAR(100),
    "cudaCores" VARCHAR(100),
    tdp VARCHAR(50),
    psu VARCHAR(100),
    "formFactor" VARCHAR(100),
    release VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_psu (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "powerOutput" VARCHAR(100),
    "psuType" VARCHAR(100),
    efficiency VARCHAR(100),
    "inputVoltage" VARCHAR(100),
    frequency VARCHAR(100),
    cooling VARCHAR(100),
    modular VARCHAR(100),
    "mainPower" VARCHAR(100),
    "cpuPower" VARCHAR(100),
    "pcieConn" VARCHAR(150),
    "sataConn" VARCHAR(150),
    warranty VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_ssd (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "storageType" VARCHAR(100),
    interface VARCHAR(100),
    "formFactor" VARCHAR(100),
    capacity VARCHAR(100),
    nand VARCHAR(100),
    "readSpeed" VARCHAR(100),
    "writeSpeed" VARCHAR(100),
    "readIOPS" VARCHAR(100),
    "writeIOPS" VARCHAR(100),
    cache VARCHAR(100),
    endurance VARCHAR(100),
    power VARCHAR(100),
    encryption VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_hdd (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "storageType" VARCHAR(100),
    interface VARCHAR(100),
    "formFactor" VARCHAR(100),
    capacity VARCHAR(100),
    "readSpeed" VARCHAR(100),
    "writeSpeed" VARCHAR(100),
    "readIOPS" VARCHAR(100),
    "writeIOPS" VARCHAR(100),
    cache VARCHAR(100),
    power VARCHAR(100),
    encryption VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_fan (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    dimensions VARCHAR(100),
    speed VARCHAR(100),
    airflow VARCHAR(100),
    connector VARCHAR(100),
    voltage VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_mobo (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "formFactor" VARCHAR(100),
    chipset VARCHAR(100),
    socket VARCHAR(50),
    "memType" VARCHAR(100),
    dimms VARCHAR(50),
    "maxMem" VARCHAR(100),
    "memSpeed" VARCHAR(150),
    "pciSlots" TEXT,
    "m2Slots" TEXT,
    usb TEXT,
    tier VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_ram (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    "memType" VARCHAR(100),
    capacity VARCHAR(100),
    config VARCHAR(100),
    "formFactor" VARCHAR(100),
    speed VARCHAR(100),
    cas VARCHAR(100),
    voltage VARCHAR(100),
    pins VARCHAR(100),
    ecc VARCHAR(100),
    buffered VARCHAR(100),
    xmp VARCHAR(100),
    released VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_builds (
    build_id SERIAL PRIMARY KEY,
    build_name VARCHAR(150) NOT NULL,
    build_data JSONB NOT NULL,
    owner_role VARCHAR(20),
    owner_id INTEGER,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
    admin_id SERIAL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    display_name VARCHAR(120),
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_users (
    student_id SERIAL PRIMARY KEY,
    school_id VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(180),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pc_scenarios (
    scenario_id SERIAL PRIMARY KEY,
    instructor_id INTEGER REFERENCES admin_users(admin_id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    activity_type VARCHAR(60) DEFAULT 'build',
    tier VARCHAR(60),
    budget NUMERIC(12, 2),
    time_limit_minutes INTEGER,
    objectives JSONB DEFAULT '[]'::jsonb,
    troubleshooting JSONB DEFAULT '[]'::jsonb,
    constraints JSONB DEFAULT '{}'::jsonb,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS build_favorites (
    favorite_id SERIAL PRIMARY KEY,
    build_id INTEGER REFERENCES saved_builds(build_id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(build_id, user_role, user_id)
);

CREATE TABLE IF NOT EXISTS build_hearts (
    heart_id SERIAL PRIMARY KEY,
    build_id INTEGER REFERENCES saved_builds(build_id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(build_id, user_role, user_id)
);

CREATE TABLE IF NOT EXISTS user_badges (
    badge_id SERIAL PRIMARY KEY,
    user_role VARCHAR(20) NOT NULL,
    user_id INTEGER NOT NULL,
    badge_key VARCHAR(80) NOT NULL,
    badge_name VARCHAR(120) NOT NULL,
    badge_description TEXT,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_role, user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS scenario_completions (
    completion_id SERIAL PRIMARY KEY,
    scenario_id INTEGER REFERENCES pc_scenarios(scenario_id) ON DELETE CASCADE,
    user_role VARCHAR(20) NOT NULL,
    user_id INTEGER NOT NULL,
    score INTEGER,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scenario_id, user_role, user_id)
);

CREATE TABLE compatibility_test_cases (
    test_id SERIAL PRIMARY KEY,
    test_name VARCHAR(180) NOT NULL,
    expected_compatible BOOLEAN NOT NULL,
    expected_issues TEXT[] DEFAULT '{}',
    cpu_id INTEGER REFERENCES admin_cpu(id) ON DELETE CASCADE,
    mobo_id INTEGER REFERENCES admin_mobo(id) ON DELETE CASCADE,
    ram_id INTEGER REFERENCES admin_ram(id) ON DELETE CASCADE,
    gpu_id INTEGER REFERENCES admin_gpu(id) ON DELETE CASCADE,
    psu_id INTEGER REFERENCES admin_psu(id) ON DELETE CASCADE,
    ssd_id INTEGER REFERENCES admin_ssd(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_admin_cpu_brand ON admin_cpu (brand);
CREATE INDEX idx_admin_cpu_model ON admin_cpu (model);
CREATE INDEX idx_admin_gpu_brand ON admin_gpu (brand);
CREATE INDEX idx_admin_gpu_model ON admin_gpu (model);
CREATE INDEX idx_admin_psu_brand ON admin_psu (brand);
CREATE INDEX idx_admin_psu_model ON admin_psu (model);
CREATE INDEX idx_admin_ssd_brand ON admin_ssd (brand);
CREATE INDEX idx_admin_ssd_model ON admin_ssd (model);
CREATE INDEX idx_admin_hdd_brand ON admin_hdd (brand);
CREATE INDEX idx_admin_hdd_model ON admin_hdd (model);
CREATE INDEX idx_admin_fan_brand ON admin_fan (brand);
CREATE INDEX idx_admin_fan_model ON admin_fan (model);
CREATE INDEX idx_admin_mobo_brand ON admin_mobo (brand);
CREATE INDEX idx_admin_mobo_model ON admin_mobo (model);
CREATE INDEX idx_admin_ram_brand ON admin_ram (brand);
CREATE INDEX idx_admin_ram_model ON admin_ram (model);
CREATE INDEX idx_compatibility_test_cases_expected ON compatibility_test_cases (expected_compatible);
CREATE INDEX IF NOT EXISTS idx_student_users_school_id ON student_users (school_id);
CREATE INDEX IF NOT EXISTS idx_student_users_email ON student_users (email);
CREATE INDEX IF NOT EXISTS idx_pc_scenarios_instructor ON pc_scenarios (instructor_id);
CREATE INDEX IF NOT EXISTS idx_pc_scenarios_title ON pc_scenarios (title);
CREATE INDEX IF NOT EXISTS idx_pc_scenarios_published ON pc_scenarios (is_published);
CREATE INDEX IF NOT EXISTS idx_saved_builds_owner ON saved_builds (owner_role, owner_id);
CREATE INDEX IF NOT EXISTS idx_build_favorites_user ON build_favorites (user_role, user_id);
CREATE INDEX IF NOT EXISTS idx_build_hearts_build ON build_hearts (build_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges (user_role, user_id);
CREATE INDEX IF NOT EXISTS idx_scenario_completions_user ON scenario_completions (user_role, user_id);

-- ============================================================
-- SAMPLE DATABASE DATA
-- Safe to edit in Admin Dashboard after loading.
-- ============================================================

INSERT INTO admin_cpu
(brand, model, family, cores, "baseClock", "turboClock", cache, igpu, tdp, "memSupport", socket, released)
VALUES
('Intel', 'Core i5-12400', 'Alder Lake', '6C/12T', '2.5 GHz', '4.4 GHz', '18 MB', 'Intel UHD 730', '65W', 'DDR4/DDR5', 'LGA1700', '2022'),
('Intel', 'Core i7-13700K', 'Raptor Lake', '16C/24T', '3.4 GHz', '5.4 GHz', '30 MB', 'Intel UHD 770', '125W', 'DDR4/DDR5', 'LGA1700', '2022'),
('AMD', 'Ryzen 5 5600', 'Zen 3', '6C/12T', '3.5 GHz', '4.4 GHz', '35 MB', 'None', '65W', 'DDR4', 'AM4', '2022'),
('AMD', 'Ryzen 9 7900X', 'Zen 4', '12C/24T', '4.7 GHz', '5.6 GHz', '76 MB', 'Radeon Graphics', '170W', 'DDR5', 'AM5', '2022'),
('Intel', 'Core i5-7500', 'Kaby Lake', '4C/4T', '3.4 GHz', '3.8 GHz', '6 MB', 'Intel HD 630', '65W', 'DDR4', 'LGA1151', '2017');

INSERT INTO admin_mobo
(brand, model, "formFactor", chipset, socket, "memType", dimms, "maxMem", "memSpeed", "pciSlots", "m2Slots", usb, tier, released)
VALUES
('ASUS', 'PRIME H610M-K D4', 'Micro-ATX', 'H610', 'LGA1700', 'DDR4', '2', '64GB', '3200 MHz', '1x PCIe x16', '1', 'USB 3.2 Gen 1, USB 2.0', 'Entry', '2022'),
('MSI', 'PRO B660M-A DDR4', 'Micro-ATX', 'B660', 'LGA1700', 'DDR4', '4', '128GB', '4800 MHz', '1x PCIe x16, 1x PCIe x1', '2', 'USB 3.2 Gen 2, USB 2.0', 'Mainstream', '2022'),
('Gigabyte', 'B550M DS3H', 'Micro-ATX', 'B550', 'AM4', 'DDR4', '4', '128GB', '4733 MHz', '1x PCIe x16, 1x PCIe x1', '2', 'USB 3.2 Gen 1, USB 2.0', 'Mainstream', '2020'),
('ASUS', 'ROG STRIX B850-E', 'ATX', 'B850', 'AM5', 'DDR5', '4', '192GB', '8000 MHz', '2x PCIe x16', '4', 'USB-C, USB 3.2 Gen 2x2', 'High End', '2025'),
('ASUS', 'H110M-K', 'Micro-ATX', 'H110', 'LGA1151', 'DDR4', '2', '32GB', '2133 MHz', '1x PCIe x16, 2x PCIe x1', '0', 'USB 3.0, USB 2.0', 'Entry', '2016'),
('ASRock', 'J5040-ITX', 'Mini-ITX', 'Intel J5040', 'Integrated', 'DDR4', '2x SO-DIMM', '8GB', '2400 MHz', '1x PCIe 2.0 x1', '1', 'USB 3.2 Gen 1, USB 2.0', 'Entry', '2020');

INSERT INTO admin_ram
(brand, model, "memType", capacity, config, "formFactor", speed, cas, voltage, pins, ecc, buffered, xmp, released)
VALUES
('Kingston', 'Fury Beast 16GB DDR4 3200', 'DDR4', '16GB', '2x8GB', 'DIMM', '3200 MHz', 'CL16', '1.35V', '288-pin', 'No', 'Unbuffered', 'XMP 2.0', '2020'),
('Corsair', 'Vengeance 32GB DDR5 5600', 'DDR5', '32GB', '2x16GB', 'DIMM', '5600 MHz', 'CL36', '1.25V', '288-pin', 'No', 'Unbuffered', 'XMP 3.0', '2022'),
('Kingston', 'FURY Beast 32GB DDR5 5200', 'DDR5', '32GB', '2x16GB', 'DIMM', '5200 MHz', 'CL40', '1.25V', '288-pin', 'No', 'Unbuffered', 'XMP 3.0', '2022'),
('Kingston', 'HyperX Fury 8GB DDR3 1600', 'DDR3', '8GB', '2x4GB', 'DIMM', '1600 MHz', 'CL10', '1.5V', '240-pin', 'No', 'Unbuffered', 'XMP 1.3', '2014'),
('Corsair', 'Vengeance LPX 64GB DDR4 3200', 'DDR4', '64GB', '2x32GB', 'DIMM', '3200 MHz', 'CL16', '1.35V', '288-pin', 'No', 'Unbuffered', 'XMP 2.0', '2020'),
('Crucial', '8GB DDR4 2400 SO-DIMM', 'DDR4', '8GB', '1x8GB', 'SO-DIMM', '2400 MHz', 'CL17', '1.2V', '260-pin', 'No', 'Unbuffered', 'None', '2017');

INSERT INTO admin_gpu
(brand, model, "memType", "memCapacity", "busWidth", "coreClock", "cudaCores", tdp, psu, "formFactor", release)
VALUES
('NVIDIA', 'GeForce GTX 1650', 'GDDR5', '4GB', '128-bit', '1485 MHz', '896', '75W', '300W', 'Dual-slot', '2019'),
('NVIDIA', 'GeForce RTX 3050', 'GDDR6', '8GB', '128-bit', '1552 MHz', '2560', '130W', '450W', 'Dual-slot', '2022'),
('NVIDIA', 'GeForce RTX 4060', 'GDDR6', '8GB', '128-bit', '1830 MHz', '3072', '115W', '550W', 'Dual-slot', '2023'),
('NVIDIA', 'GeForce RTX 4070', 'GDDR6X', '12GB', '192-bit', '1920 MHz', '5888', '200W', '700W', 'Dual-slot', '2023'),
('NVIDIA', 'GeForce GTX 750 Ti', 'GDDR5', '2GB', '128-bit', '1020 MHz', '640', '60W', '300W', 'Dual-slot', '2014'),
('NVIDIA', 'GeForce RTX 4090', 'GDDR6X', '24GB', '384-bit', '2235 MHz', '16384', '450W', '850W', 'Triple-slot', '2022');

INSERT INTO admin_psu
(brand, model, "powerOutput", "psuType", efficiency, "inputVoltage", frequency, cooling, modular, "mainPower", "cpuPower", "pcieConn", "sataConn", warranty, released)
VALUES
('Corsair', 'CV450 450W 80+ Bronze', '450W', 'ATX', '80+ Bronze', '100-240V', '50-60Hz', '120mm Fan', 'Non-modular', '24-pin ATX', '1x 8-pin EPS', '1x 6+2-pin', '4', '3 years', '2020'),
('Corsair', 'CV550 550W 80+ Bronze', '550W', 'ATX', '80+ Bronze', '100-240V', '50-60Hz', '120mm Fan', 'Non-modular', '24-pin ATX', '1x 8-pin EPS', '2x 6+2-pin', '6', '3 years', '2020'),
('Cooler Master', 'MWE 650W 80+ Bronze', '650W', 'ATX', '80+ Bronze', '100-240V', '50-60Hz', '120mm Fan', 'Non-modular', '24-pin ATX', '1x 8-pin EPS', '4x 6+2-pin', '6', '5 years', '2021'),
('Corsair', 'RM850e 850W 80+ Gold', '850W', 'ATX', '80+ Gold', '100-240V', '50-60Hz', '140mm Fan', 'Fully modular', '24-pin ATX', '2x 8-pin EPS', '4x 6+2-pin', '8', '7 years', '2023'),
('Corsair', 'CX430 430W 80+ Bronze', '430W', 'ATX', '80+ Bronze', '100-240V', '50-60Hz', '120mm Fan', 'Non-modular', '24-pin ATX', '1x 4+4-pin EPS', '1x 6+2-pin', '4', '3 years', '2013');

INSERT INTO admin_ssd
(brand, model, "storageType", interface, "formFactor", capacity, nand, "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", cache, endurance, power, encryption, released)
VALUES
('Samsung', '870 EVO 500GB SATA SSD', 'SSD', 'SATA', '2.5 inch', '500GB', 'TLC', '560 MB/s', '530 MB/s', '98000', '88000', 'DRAM', '300 TBW', '3W', 'AES 256-bit', '2021'),
('Samsung', '980 1TB NVMe SSD', 'SSD', 'M.2 NVMe', 'M.2 2280', '1TB', 'TLC', '3500 MB/s', '3000 MB/s', '500000', '480000', 'HMB', '600 TBW', '5W', 'None', '2021'),
('Kingston', 'NV2 500GB NVMe SSD', 'SSD', 'M.2 NVMe', 'M.2 2280', '500GB', 'QLC/TLC', '3500 MB/s', '2100 MB/s', '190000', '220000', 'HMB', '160 TBW', '5W', 'None', '2022'),
('Crucial', 'MX100 256GB SATA SSD', 'SSD', 'SATA', '2.5 inch', '256GB', 'MLC', '550 MB/s', '330 MB/s', '85000', '70000', 'DRAM', '72 TBW', '3W', 'AES 256-bit', '2014');

INSERT INTO admin_hdd
(brand, model, "storageType", interface, "formFactor", capacity, "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", cache, power, encryption, released)
VALUES
('Seagate', 'Barracuda 1TB HDD', 'HDD', 'SATA', '3.5 inch', '1TB', '210 MB/s', '190 MB/s', '120', '120', '64MB', '5.3W', 'None', '2018'),
('Western Digital', 'Blue 2TB HDD', 'HDD', 'SATA', '3.5 inch', '2TB', '215 MB/s', '200 MB/s', '150', '150', '256MB', '5.6W', 'None', '2020'),
('Western Digital', 'Blue 500GB HDD', 'HDD', 'SATA', '3.5 inch', '500GB', '126 MB/s', '110 MB/s', '75', '75', '16MB', '5.4W', 'None', '2012');

INSERT INTO admin_fan
(brand, model, dimensions, speed, airflow, connector, voltage, released)
VALUES
('Cooler Master', 'SickleFlow 120', '120x120x25mm', '650-1800 RPM', '62', '4-pin PWM', '12V', '2020'),
('Corsair', 'AF120 Elite', '120x120x25mm', '400-1850 RPM', '59', '4-pin PWM', '12V', '2022'),
('Cooler Master', 'Blade Master 120', '120x120x25mm', '600-2000 RPM', '76', '4-pin PWM', '12V', '2010');

-- Compatibility checker test cases.
-- These rows point to real catalog components so QA can test expected PASS/FAIL builds.
INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'PASS: AM5 DDR5 balanced build',
    TRUE,
    ARRAY[]::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to pass: matching socket, DDR5 RAM, M.2 slot, GPU slot, and enough PSU wattage.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Ryzen 9 7900X'
  AND m.model = 'ROG STRIX B850-E'
  AND r.model = 'Vengeance 32GB DDR5 5600'
  AND g.model = 'GeForce RTX 4070'
  AND p.model = 'RM850e 850W 80+ Gold'
  AND s.model = '980 1TB NVMe SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: CPU socket mismatch',
    FALSE,
    ARRAY['CPU socket mismatch']::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because AM4 CPU is paired with an LGA1700 motherboard.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Ryzen 5 5600'
  AND m.model = 'PRIME H610M-K D4'
  AND r.model = 'Fury Beast 16GB DDR4 3200'
  AND g.model = 'GeForce GTX 1650'
  AND p.model = 'CV450 450W 80+ Bronze'
  AND s.model = '870 EVO 500GB SATA SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: DDR3 RAM on DDR4 motherboard',
    FALSE,
    ARRAY['RAM type mismatch']::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because DDR3 RAM is paired with a DDR4 motherboard.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Core i5-7500'
  AND m.model = 'H110M-K'
  AND r.model = 'HyperX Fury 8GB DDR3 1600'
  AND g.model = 'GeForce GTX 750 Ti'
  AND p.model = 'CX430 430W 80+ Bronze'
  AND s.model = 'MX100 256GB SATA SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: PSU wattage too low for GPU',
    FALSE,
    ARRAY['PSU wattage too low']::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because a 450W PSU is paired with a GPU that recommends 700W.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Core i5-12400'
  AND m.model = 'PRIME H610M-K D4'
  AND r.model = 'Fury Beast 16GB DDR4 3200'
  AND g.model = 'GeForce RTX 4070'
  AND p.model = 'CV450 450W 80+ Bronze'
  AND s.model = '870 EVO 500GB SATA SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: NVMe drive without M.2 slot',
    FALSE,
    ARRAY['NVMe requires M.2 slot']::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because the motherboard has zero M.2 slots and the selected SSD is NVMe.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Core i5-7500'
  AND m.model = 'H110M-K'
  AND r.model = 'Fury Beast 16GB DDR4 3200'
  AND g.model = 'GeForce GTX 750 Ti'
  AND p.model = 'CX430 430W 80+ Bronze'
  AND s.model = '980 1TB NVMe SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: RAM capacity exceeds motherboard limit',
    FALSE,
    ARRAY['RAM capacity exceeds motherboard maximum']::TEXT[],
    c.id, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because 64GB RAM is paired with a motherboard that supports only 32GB.'
FROM admin_cpu c, admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE c.model = 'Core i5-7500'
  AND m.model = 'H110M-K'
  AND r.model = 'Vengeance LPX 64GB DDR4 3200'
  AND g.model = 'GeForce GTX 750 Ti'
  AND p.model = 'CX430 430W 80+ Bronze'
  AND s.model = 'MX100 256GB SATA SSD';

INSERT INTO compatibility_test_cases
(test_name, expected_compatible, expected_issues, cpu_id, mobo_id, ram_id, gpu_id, psu_id, ssd_id, notes)
SELECT
    'FAIL: Motherboard has no PCIe x16 GPU slot',
    FALSE,
    ARRAY['Missing PCIe x16 slot']::TEXT[],
    NULL, m.id, r.id, g.id, p.id, s.id,
    'Expected to fail because a GPU is selected but the motherboard lists no PCIe x16 slot.'
FROM admin_mobo m, admin_ram r, admin_gpu g, admin_psu p, admin_ssd s
WHERE m.model = 'J5040-ITX'
  AND r.model = '8GB DDR4 2400 SO-DIMM'
  AND g.model = 'GeForce GTX 750 Ti'
  AND p.model = 'CX430 430W 80+ Bronze'
  AND s.model = 'MX100 256GB SATA SSD';

-- Default admin login:
-- username: admin
-- password: admin123
INSERT INTO admin_users (username, password_hash, display_name, role)
VALUES (
    'admin',
    '$2b$12$8RxPTdEiIxJZVcKS0ciEHOEOTqt3gV2Uox37ObdPjbcCmmA/4C/b6',
    'Administrator',
    'admin'
)
ON CONFLICT (username) DO NOTHING;

COMMIT;
