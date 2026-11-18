import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { AppDatabase } from './db.mjs';
import {
  adminCpuToSim,
  adminMoboToSim,
  adminRamToSim,
  adminGpuToSim,
  adminPsuToSim,
  adminStorageToSim,
  compatibilityIssues,
  buildReport,
  normalizeCategory,
} from './logic.mjs';

const sampleCpuAm5 = adminCpuToSim({
  id: 4,
  brand: 'AMD',
  model: 'Ryzen 9 7900X',
  cores: '12C/24T',
  baseClock: '4.7 GHz',
  turboClock: '5.6 GHz',
  igpu: 'Radeon Graphics',
  tdp: '170W',
  memSupport: 'DDR5',
  socket: 'AM5',
});

const sampleCpuAm4 = adminCpuToSim({
  id: 3,
  brand: 'AMD',
  model: 'Ryzen 5 5600',
  cores: '6C/12T',
  tdp: '65W',
  memSupport: 'DDR4',
  socket: 'AM4',
});

const sampleMoboAm5 = adminMoboToSim({
  id: 4,
  brand: 'ASUS',
  model: 'ROG STRIX B850-E',
  formFactor: 'ATX',
  chipset: 'B850',
  socket: 'AM5',
  memType: 'DDR5',
  dimms: '4',
  maxMem: '192GB',
  memSpeed: '8000 MHz',
  pciSlots: '2x PCIe x16',
  m2Slots: '4',
});

const sampleMoboH110 = adminMoboToSim({
  id: 5,
  brand: 'ASUS',
  model: 'H110M-K',
  formFactor: 'Micro-ATX',
  socket: 'LGA1151',
  memType: 'DDR4',
  dimms: '2',
  maxMem: '32GB',
  memSpeed: '2133 MHz',
  pciSlots: '1x PCIe x16',
  m2Slots: '0',
});

const sampleRamDdr5 = adminRamToSim({
  id: 2,
  brand: 'Corsair',
  model: 'Vengeance 32GB DDR5 5600',
  memType: 'DDR5',
  capacity: '32GB',
  config: '2x16GB',
  formFactor: 'DIMM',
  speed: '5600 MHz',
});

const sampleRamDdr3 = adminRamToSim({
  id: 4,
  brand: 'Kingston',
  model: 'HyperX Fury 8GB DDR3 1600',
  memType: 'DDR3',
  capacity: '8GB',
  config: '2x4GB',
  formFactor: 'DIMM',
  speed: '1600 MHz',
});

const sampleGpu4070 = adminGpuToSim({
  id: 4,
  brand: 'NVIDIA',
  model: 'GeForce RTX 4070',
  memCapacity: '12GB',
  tdp: '200W',
  psu: '700W',
});

const samplePsu850 = adminPsuToSim({
  id: 4,
  brand: 'Corsair',
  model: 'RM850e 850W 80+ Gold',
  powerOutput: '850W',
  modular: 'Fully modular',
  pcieConn: '4x 6+2-pin',
});

const samplePsu450 = adminPsuToSim({
  id: 1,
  brand: 'Corsair',
  model: 'CV450 450W 80+ Bronze',
  powerOutput: '450W',
  modular: 'Non-modular',
  pcieConn: '1x 6+2-pin',
});

const sampleNvme = adminStorageToSim(
  {
    id: 2,
    brand: 'Samsung',
    model: '980 1TB NVMe SSD',
    storageType: 'SSD',
    interface: 'M.2 NVMe',
    capacity: '1TB',
  },
  'ssd'
);

test('balanced AM5 DDR5 build passes compatibility checks', () => {
  const issues = compatibilityIssues({
    cpu: sampleCpuAm5,
    mb: sampleMoboAm5,
    ram: sampleRamDdr5,
    gpu: sampleGpu4070,
    storage: sampleNvme,
    psu: samplePsu850,
  });
  assert.deepEqual(issues, []);
});

test('CPU and motherboard socket mismatch is detected', () => {
  const issues = compatibilityIssues({
    cpu: sampleCpuAm4,
    mb: sampleMoboAm5,
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /CPU socket AM4 is not compatible with motherboard socket AM5/);
});

test('DDR3 RAM on DDR4 motherboard is detected', () => {
  const issues = compatibilityIssues({
    mb: sampleMoboH110,
    ram: sampleRamDdr3,
  });
  assert.ok(issues.some((i) => i.includes('not compatible with motherboard RAM type')));
});

test('PSU wattage lower than GPU recommended is detected', () => {
  const issues = compatibilityIssues({
    gpu: sampleGpu4070,
    psu: samplePsu450,
  });
  assert.ok(issues.some((i) => i.includes('PSU wattage 450W is lower than GPU recommended 700W')));
});

test('NVMe drive without M.2 slot is detected', () => {
  const issues = compatibilityIssues({
    mb: sampleMoboH110,
    storage: sampleNvme,
  });
  assert.ok(issues.some((i) => i.includes('M.2/NVMe storage requires at least one M.2 slot')));
});

test('buildReport calculates power and recommended PSU accurately', () => {
  const lookup = (cat, id) => {
    if (cat === 'cpu' && id === 4) return sampleCpuAm5;
    if (cat === 'mb' && id === 4) return sampleMoboAm5;
    if (cat === 'ram' && id === 2) return sampleRamDdr5;
    if (cat === 'gpu' && id === 4) return sampleGpu4070;
    if (cat === 'storage' && id === 2) return sampleNvme;
    if (cat === 'psu' && id === 4) return samplePsu850;
    return null;
  };
  const report = buildReport(
    { components: { cpu: { id: 4 }, mb: { id: 4 }, ram: { id: 2 }, gpu: { id: 4 }, storage: { id: 2 }, psu: { id: 4 } } },
    lookup
  );
  assert.equal(report.compatible, true);
  // 170 (CPU) + 50 (MB) + 5 (RAM) + 5 (Storage) + (700 - 250 = 450 GPU) = 680W
  assert.equal(report.totalPower, 680);
  assert.equal(report.recommendedPsu, 830);
  assert.equal(report.totalMemory, 32);
  assert.equal(report.gpuMemory, 12);
  assert.equal(report.componentCount, 6);
});

test('normalizeCategory handles aliases', () => {
  assert.equal(normalizeCategory('motherboards'), 'mb');
  assert.equal(normalizeCategory('ssd'), 'storage');
  assert.equal(normalizeCategory('fans'), 'cooler');
  assert.equal(normalizeCategory('unknown'), null);
});

test('AppDatabase persists newly registered student credentials across reopen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemblypc-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db1 = new AppDatabase(dbPath);
    const now = new Date().toISOString();
    const inserted = db1.insertStudent({
      school_id: '2026-9999',
      email: 'persist@lnu.edu.ph',
      password_hash: bcrypt.hashSync('MyPass123!', 10),
      first_name: 'Maria',
      last_name: 'Clara',
      display_name: 'Maria Clara',
      is_active: true,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });
    assert.ok(inserted.student_id > 1);
    db1.close();

    // Reopen fresh instance from same SQLite file
    const db2 = new AppDatabase(dbPath);
    const reloaded = db2.loadStore();
    const found = reloaded.student_users.find((u) => u.school_id === '2026-9999');
    assert.ok(found, 'Registered student must persist after DB reopen');
    assert.equal(found.email, 'persist@lnu.edu.ph');
    assert.equal(bcrypt.compareSync('MyPass123!', found.password_hash), true);
    // Seeded default accounts should not be duplicated
    assert.equal(reloaded.student_users.filter((u) => u.school_id === '2024-0001').length, 1);
    db2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AppDatabase persists password resets and saved builds across reopen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemblypc-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db1 = new AppDatabase(dbPath);
    const store1 = db1.loadStore();
    const student = store1.student_users.find((u) => u.school_id === '2024-0001');
    const newHash = bcrypt.hashSync('ResetPass456!', 10);
    db1.updateStudentPassword(student.student_id, newHash, new Date().toISOString());
    const savedBuild = db1.insertBuild({
      build_name: 'Persisted Lab Rig',
      owner_role: 'student',
      owner_id: student.student_id,
      is_published: true,
      build_data: { components: {}, stats: { score: 100 } },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    db1.close();

    const db2 = new AppDatabase(dbPath);
    const store2 = db2.loadStore();
    const updatedStudent = store2.student_users.find((u) => u.school_id === '2024-0001');
    assert.equal(bcrypt.compareSync('student123', updatedStudent.password_hash), false);
    assert.equal(bcrypt.compareSync('ResetPass456!', updatedStudent.password_hash), true);
    assert.ok(store2.saved_builds.some((b) => b.build_id === savedBuild.build_id && b.build_name === 'Persisted Lab Rig'));
    db2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

