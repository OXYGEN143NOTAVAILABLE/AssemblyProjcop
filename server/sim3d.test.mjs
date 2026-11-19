import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialStore } from './seedData.mjs';
import {
  adminCpuToSim,
  adminFanToSim,
  adminGpuToSim,
  adminMoboToSim,
  adminPsuToSim,
  adminRamToSim,
  adminStorageToSim,
} from './logic.mjs';
import {
  SimulationDataManager,
  CASE_SPEC_CATALOG,
  CPU_COOLER_CATALOG,
  CABLE_DEFINITIONS,
  TROUBLESHOOTING_PRESETS,
} from '../frontend/static/js/sim3d/SimulationDataManager.mjs';
import { PlacementSnappingSystem, BENCH_PREP_ORIGIN, CASE_MB_ANCHOR, CASE_SUB_ANCHORS, STAGING_ANCHORS } from '../frontend/static/js/sim3d/PlacementSnappingSystem.mjs';
import { AssemblyManager, COMPONENT_STATE } from '../frontend/static/js/sim3d/AssemblyManager.mjs';
import { ValidationEngine } from '../frontend/static/js/sim3d/ValidationEngine.mjs';

function buildTestApiCatalog() {
  const store = createInitialStore();
  return {
    cpu: store.components.cpu.map(adminCpuToSim),
    mb: store.components.mobo.map(adminMoboToSim),
    ram: store.components.ram.map(adminRamToSim),
    gpu: store.components.gpu.map(adminGpuToSim),
    storage: [
      ...store.components.ssd.map((r) => adminStorageToSim(r, 'ssd')),
      ...store.components.hdd.map((r) => adminStorageToSim(r, 'hdd')),
    ],
    psu: store.components.psu.map(adminPsuToSim),
    cooler: store.components.fan.map(adminFanToSim),
    case: [],
  };
}

test('SimulationDataManager hydrates real API components with physical dimensions, Cases, Coolers & Case Fans', () => {
  const dataMgr = new SimulationDataManager();
  const list = dataMgr.hydrateCatalogFromApi(buildTestApiCatalog());
  assert.ok(list.length >= 30);
  assert.equal(dataMgr.getCatalog('case').length, CASE_SPEC_CATALOG.length);
  assert.equal(dataMgr.getCatalog('cooler').length, CPU_COOLER_CATALOG.length);
  assert.equal(dataMgr.getCatalog('case_fan').length, 3);

  const gpu4070 = dataMgr.findComponent('gpu', 4);
  assert.ok(gpu4070);
  assert.ok(gpu4070.dimensionsMm.w >= 240);
  assert.equal(gpu4070.requiresExternalPower, true);

  const nvme = dataMgr.findComponent('storage', 2);
  assert.equal(nvme.storageKind, 'm2_nvme');
});

test('PlacementSnappingSystem rejects distant auto-snap, detects orientation mismatch, and guards clearance', () => {
  const snap = new PlacementSnappingSystem();

  // Far away on staging tray should NOT snap to Case/Bench
  const farRes = snap.evaluatePlacement('mb', STAGING_ANCHORS.cpu, 0, {
    sidePanelOpen: true,
    mbMountLocation: null,
  });
  assert.equal(farRes.withinRange, false);
  assert.equal(farRes.status, 'idle');

  // Near bench prep pad with aligned rotation (step 0) -> snaps aligned
  const benchRes = snap.evaluatePlacement('mb', { ...BENCH_PREP_ORIGIN, x: BENCH_PREP_ORIGIN.x + 0.1 }, 0, {
    sidePanelOpen: true,
    mbMountLocation: null,
  });
  assert.equal(benchRes.withinRange, true);
  assert.equal(benchRes.status, 'aligned');
  assert.equal(benchRes.target.mountLocation, 'bench');

  // Inside case while sidePanelOpen is false -> blocked
  const closedPanel = snap.evaluatePlacement('mb', CASE_MB_ANCHOR, 0, {
    sidePanelOpen: false,
    mbMountLocation: null,
  });
  assert.equal(closedPanel.withinRange, true);
  assert.equal(closedPanel.status, 'blocked');
  assert.equal(closedPanel.blocked, true);

  // CPU rotated 180 deg -> misaligned orientation detected
  const cpuMisaligned = snap.evaluatePlacement('cpu', { x: BENCH_PREP_ORIGIN.x - 0.15, y: BENCH_PREP_ORIGIN.y + 0.05, z: BENCH_PREP_ORIGIN.z - 0.56 }, 2, {
    sidePanelOpen: true,
    mbMountLocation: 'bench',
  });
  assert.equal(cpuMisaligned.withinRange, true);
  assert.equal(cpuMisaligned.status, 'misaligned');
  assert.equal(cpuMisaligned.aligned, false);
});

test('AssemblyManager supports bench-first sub-assembly workflow AND prevents removing blocked parts', () => {
  const dataMgr = new SimulationDataManager();
  dataMgr.hydrateCatalogFromApi(buildTestApiCatalog());
  const asm = new AssemblyManager();
  asm.reset(dataMgr.getDefaultCase(), 'bench_first');
  asm.setSidePanelOpen(true);

  const mb = dataMgr.findComponent('mb', 4); // ASUS ROG STRIX B850-E AM5
  const cpu = dataMgr.findComponent('cpu', 4); // Ryzen 9 7900X AM5
  const cooler = dataMgr.findComponent('cooler', 'cooler_tower_120');

  asm.stageComponent('mb', mb);
  const mbBench = asm.placeComponentAt('mb', BENCH_PREP_ORIGIN, 0);
  assert.equal(mbBench.ok, true);
  assert.equal(mbBench.target.mountLocation, 'bench');
  asm.secureComponent('mb');

  // Install CPU onto motherboard while MB is still on bench
  asm.stageComponent('cpu', cpu);
  const cpuSnap = asm.snapToNearestValidAnchor('cpu');
  assert.equal(cpuSnap.ok, true);
  assert.equal(asm.slots.cpu.mountLocation, 'mb_on_bench');
  asm.secureComponent('cpu');

  // Install Cooler onto CPU on bench
  asm.applyThermalPaste(true);
  asm.stageComponent('cooler', cooler);
  const coolerSnap = asm.snapToNearestValidAnchor('cooler');
  assert.equal(coolerSnap.ok, true);
  asm.secureComponent('cooler');

  // Cannot remove CPU while cooler covers socket
  const blockedRemove = asm.removeComponent('cpu');
  assert.equal(blockedRemove.ok, false);
  assert.match(blockedRemove.reason, /Cooler/i);

  // Moving Motherboard into Case standoffs brings CPU & Cooler along!
  const mbCase = asm.placeComponentAt('mb', CASE_MB_ANCHOR, 0);
  assert.equal(mbCase.ok, true);
  assert.equal(asm.mbMountLocation, 'case');
  assert.equal(asm.slots.cpu.mountLocation, 'mb_in_case');
  assert.equal(asm.slots.cooler.mountLocation, 'mb_in_case');
});

test('AssemblyManager allows placing incompatible or misaligned parts mid-build, then ValidationEngine catches all errors post-assembly', () => {
  const dataMgr = new SimulationDataManager();
  dataMgr.hydrateCatalogFromApi(buildTestApiCatalog());
  const asm = new AssemblyManager();
  const validator = new ValidationEngine();

  asm.reset(dataMgr.getComponent ? dataMgr.getComponent('case') : dataMgr.findComponent('case', 'case_matx_compact'));
  asm.setSidePanelOpen(true);

  // Deliberate mistakes: ATX MB in mATX compact case, Intel CPU on AM5 MB, rotated CPU (180°), DDR3 RAM on DDR5 MB, no thermal paste, upside-down PSU, missing cables!
  asm.stageComponent('mb', dataMgr.findComponent('mb', 4)); // ATX AM5 DDR5
  asm.snapToNearestValidAnchor('mb', 'case');
  asm.secureComponent('mb');

  asm.stageComponent('cpu', dataMgr.findComponent('cpu', 1)); // LGA1700 Intel on AM5!
  asm.rotateComponent('cpu', 2); // 180 deg wrong orientation
  const cpuRes = asm.snapToNearestValidAnchor('cpu');
  assert.equal(cpuRes.ok, true); // MUST NOT block student mid-build!
  assert.equal(cpuRes.aligned, false);
  assert.equal(asm.slots.cpu.status, COMPONENT_STATE.INSTALLED_INCORRECT);

  asm.stageComponent('ram', dataMgr.findComponent('ram', 4)); // DDR3!
  asm.snapToNearestValidAnchor('ram');
  asm.secureComponent('ram');

  asm.stageComponent('cooler', dataMgr.findComponent('cooler', 'cooler_stock_65'));
  asm.snapToNearestValidAnchor('cooler'); // Missing thermal paste!
  asm.secureComponent('cooler');

  asm.stageComponent('psu', dataMgr.findComponent('psu', 1)); // 450W PSU
  asm.rotateComponent('psu', 2); // Fan UP!
  asm.snapToNearestValidAnchor('psu');
  asm.secureComponent('psu');

  asm.stageComponent('gpu', dataMgr.findComponent('gpu', 6)); // RTX 4090 (328mm > 290mm mATX case!)
  asm.snapToNearestValidAnchor('gpu');
  asm.secureComponent('gpu');

  asm.stageComponent('storage', dataMgr.findComponent('storage', 2)); // M.2 NVMe
  asm.snapToNearestValidAnchor('storage');
  asm.secureComponent('storage');

  const report = validator.evaluateAssembly(asm.getState(), dataMgr.loadActivityConfig());
  assert.equal(report.passed, false);
  assert.ok(report.compatibilityIssues.some((c) => c.pair === 'CPU + Motherboard'));
  assert.ok(report.compatibilityIssues.some((c) => c.pair === 'Motherboard + RAM'));
  assert.ok(report.compatibilityIssues.some((c) => c.pair === 'Motherboard + PC Case'));
  assert.ok(report.compatibilityIssues.some((c) => c.pair === 'GPU + PC Case'));
  assert.ok(report.compatibilityIssues.some((c) => c.pair === 'PSU + GPU'));
  assert.ok(report.incorrectlyInstalled.some((i) => i.slot === 'cpu'));
  assert.ok(report.incorrectlyInstalled.some((i) => i.slot === 'cooler'));
  assert.ok(report.incorrectlyInstalled.some((i) => i.slot === 'psu'));
  assert.ok(report.connectionIssues.length >= 4);
});

test('ValidationEngine awards 100% PASS for a properly aligned, secured, compatible & cabled AM5 build', () => {
  const dataMgr = new SimulationDataManager();
  dataMgr.hydrateCatalogFromApi(buildTestApiCatalog());
  const activity = dataMgr.loadActivityConfig({
    id: 1,
    title: 'AM5 Workstation',
    objectives: ['Match AM5 CPU and motherboard', 'Select DDR5 memory', 'Connect cables'],
  });
  const asm = new AssemblyManager();
  const validator = new ValidationEngine();

  asm.reset(dataMgr.findComponent('case', 'case_atx_mid'));
  asm.setSidePanelOpen(true);

  const installPart = (slot, id, loc = null) => {
    asm.stageComponent(slot, dataMgr.findComponent(slot, id));
    const res = asm.snapToNearestValidAnchor(slot, loc);
    assert.equal(res.ok, true, `Failed placing ${slot}`);
    assert.equal(res.aligned, true, `Expected ${slot} aligned`);
    asm.secureComponent(slot);
  };

  installPart('mb', 4, 'case');
  installPart('cpu', 4);
  asm.applyThermalPaste(true);
  installPart('cooler', 'cooler_tower_120');
  installPart('ram', 2); // 32GB DDR5
  installPart('storage', 2); // Samsung 980 NVMe
  installPart('gpu', 4); // RTX 4070 (needs 700W PSU, 268mm <= 345mm case)
  installPart('psu', 4); // RM850e 850W

  assert.equal(asm.connectCable('c_24pin').ok, true);
  assert.equal(asm.connectCable('c_8pin_cpu').ok, true);
  assert.equal(asm.connectCable('c_cpu_fan').ok, true);
  assert.equal(asm.connectCable('c_pcie_8').ok, true);
  assert.equal(asm.connectCable('c_front_panel').ok, true);

  asm.setSidePanelOpen(false); // Re-close side panel after cabling

  const report = validator.evaluateAssembly(asm.getState(), activity);
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.compatibilityIssues.length, 0);
  assert.equal(report.connectionIssues.length, 0);
  assert.equal(report.incorrectlyInstalled.length, 0);
  assert.equal(report.missingComponents.length, 0);
  assert.ok(report.scenarioEvaluation.every((o) => o.passed));

  const payload = dataMgr.exportAssessmentResult(report, asm.getState());
  assert.equal(payload.score, 100);
  assert.equal(payload.buildSnapshot.components.cpu.name, 'Ryzen 9 7900X');
});

test('Phase 2: CABLE_DEFINITIONS include unique bidirectional port-to-port keys', () => {
  const pairSet = new Set();
  for (const def of CABLE_DEFINITIONS) {
    assert.ok(def.fromPortKey, `Missing fromPortKey on ${def.id}`);
    assert.ok(def.toPortKey, `Missing toPortKey on ${def.id}`);
    assert.notEqual(def.fromPortKey, def.toPortKey);
    const pairKey = [def.fromPortKey, def.toPortKey].sort().join('::');
    assert.equal(pairSet.has(pairKey), false, `Duplicate port pair ${pairKey}`);
    pairSet.add(pairKey);
  }
});

test('Phase 2: TROUBLESHOOTING_PRESETS load cleanly from DB catalog, fail with expected faults, and reach 100% when repaired', () => {
  const dataMgr = new SimulationDataManager();
  dataMgr.hydrateCatalogFromApi(buildTestApiCatalog());
  const validator = new ValidationEngine();

  for (const preset of TROUBLESHOOTING_PRESETS) {
    const asm = new AssemblyManager();
    asm.reset(dataMgr.getDefaultCase(), 'freeform');
    asm.setSidePanelOpen(true);

    const rotSteps = preset.faults.rotationSteps || {};
    const unsecured = new Set(preset.faults.unsecured || []);

    const mbComp = dataMgr.findComponent('mb', preset.parts.mb);
    assert.ok(mbComp, `Missing MB ${preset.parts.mb}`);
    asm.stageComponent('mb', mbComp);
    asm.placeComponentAt('mb', CASE_MB_ANCHOR, rotSteps.mb || 0);
    if (!unsecured.has('mb')) asm.secureComponent('mb');

    for (const slot of ['cpu', 'cooler', 'ram', 'storage', 'gpu', 'psu', 'case_fan']) {
      const name = preset.parts[slot];
      if (!name) continue;
      const comp = dataMgr.findComponent(slot, name);
      assert.ok(comp, `Missing ${slot} "${name}" in preset ${preset.id}`);
      asm.stageComponent(slot, comp);
      if (rotSteps[slot]) asm.rotateComponent(slot, rotSteps[slot]);
      asm.snapToNearestValidAnchor(slot);
      if (!unsecured.has(slot)) asm.secureComponent(slot);
    }

    asm.thermalPasteApplied = Boolean(preset.faults.thermalPasteApplied);
    for (const cid of preset.faults.cables) {
      assert.equal(asm.connectCable(cid).ok, true, `Failed connecting fault preset cable ${cid}`);
    }

    const brokenReport = validator.evaluateAssembly(asm.getState(), dataMgr.loadActivityConfig(preset));
    assert.equal(brokenReport.passed, false, `Preset ${preset.id} should initially fail validation`);
    assert.ok(brokenReport.score < 85, `Expected low fault score for ${preset.id}, got ${brokenReport.score}`);

    // Now repair each preset cleanly
    if (preset.id === 'fault_no_post_orientation') {
      // Remove cooler blocking CPU, fix CPU rotation + paste + latch, reinstall cooler, fix PSU & fan orientation, plug remaining cables
      assert.equal(asm.removeComponent('cooler').ok, true);
      assert.equal(asm.rotateComponent('cpu', 3).ok, true); // 1 -> 0
      assert.equal(asm.applyThermalPaste(true).ok, true);
      assert.equal(asm.secureComponent('cpu').ok, true);
      asm.stageComponent('cooler', dataMgr.findComponent('cooler', preset.parts.cooler));
      asm.snapToNearestValidAnchor('cooler');
      asm.secureComponent('cooler');

      asm.unsecureComponent('psu');
      asm.rotateComponent('psu', 2);
      asm.secureComponent('psu');

      asm.unsecureComponent('case_fan');
      asm.rotateComponent('case_fan', 2);
      asm.secureComponent('case_fan');

      asm.secureComponent('gpu');
      asm.connectCable('c_cpu_fan');
      asm.connectCable('c_pcie_8');
      asm.connectCable('c_case_fan');
    } else if (preset.id === 'fault_memory_power_mismatch') {
      const ddr4 = dataMgr.findComponent('ram', 'Fury Beast 16GB DDR4 3200');
      assert.ok(ddr4);
      asm.stageComponent('ram', ddr4);
      asm.snapToNearestValidAnchor('ram');
      asm.secureComponent('ram');

      asm.secureComponent('psu');
      asm.connectCable('c_8pin_cpu');
      asm.connectCable('c_cpu_fan');
      asm.connectCable('c_pcie_8');
      asm.connectCable('c_sata_data');
    }

    asm.setSidePanelOpen(false);
    const repairedReport = validator.evaluateAssembly(asm.getState(), dataMgr.loadActivityConfig(preset));
    assert.equal(repairedReport.passed, true, `Repaired ${preset.id} failed: ${JSON.stringify(repairedReport)}`);
    assert.equal(repairedReport.score, 100);
  }
});

test('Spatial anchors ground every staging part on the ESD mat and align PSU/MB/Fan inside case bounds', () => {
  // Expanded ESD mat bounds: BoxGeometry(14.8, 0.02, 7.2) centered at (1.10, -0.01, 0)
  // World X [-6.30 .. +8.50], Z [-3.60 .. +3.60], top at Y=0
  for (const [slot, pos] of Object.entries(STAGING_ANCHORS)) {
    assert.ok(pos.x >= -6.10 && pos.x <= 8.30, `${slot} staging X=${pos.x} out of mat bounds`);
    assert.ok(pos.z >= -3.40 && pos.z <= 3.40, `${slot} staging Z=${pos.z} out of mat bounds`);
    assert.ok(pos.y > 0 && pos.y <= 0.65, `${slot} staging Y=${pos.y} looks floating`);
    if (slot === 'mb') {
      assert.equal(pos.x, BENCH_PREP_ORIGIN.x, 'Motherboard staging should match BENCH_PREP_ORIGIN');
    } else {
      // Staging tray spans X [3.35 .. 7.85], Z [-3.25 .. +3.25]
      assert.ok(pos.x >= 3.35 && pos.x <= 7.85, `${slot} staging X=${pos.x} outside STAGING TRAY`);
      assert.ok(pos.z >= -3.25 && pos.z <= 3.25, `${slot} staging Z=${pos.z} outside STAGING TRAY`);
    }
  }
  const stagedEntries = Object.entries(STAGING_ANCHORS);
  for (let i = 0; i < stagedEntries.length; i += 1) {
    for (let j = i + 1; j < stagedEntries.length; j += 1) {
      const [slotA, a] = stagedEntries[i];
      const [slotB, b] = stagedEntries[j];
      const xzDist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(xzDist >= 0.70, `Staged parts ${slotA} and ${slotB} overlap (dist=${xzDist.toFixed(2)})`);
    }
  }
  assert.ok(STAGING_ANCHORS.cooler.y <= 0.05, 'Cooler should rest coldplate flush on mat');
  assert.ok(STAGING_ANCHORS.ram.y <= 0.05, 'RAM should rest edge pins flush on mat');
  assert.ok(STAGING_ANCHORS.gpu.y <= 0.25, 'GPU should rest shroud flush on mat');

  // PSU inside case shroud: floor top = 0.11, hY = 0.86 (half 0.43), shroud top = 1.12
  assert.ok(CASE_SUB_ANCHORS.psu.y - 0.43 >= 0.12, 'PSU sinks into case floor');
  assert.ok(CASE_SUB_ANCHORS.psu.y + 0.43 <= 1.10, 'PSU clips top of shroud');

  // Motherboard PCB back (-0.018) must rest at or in front of brass standoff tips (-0.680)
  assert.ok(CASE_MB_ANCHOR.z - 0.018 >= -0.681, 'Motherboard clips into brass standoffs');

  // Rear case fan should sit cleanly toward +Z glass side away from rear I/O shroud (-0.70..-0.34)
  assert.ok(CASE_SUB_ANCHORS.case_fan.z >= 0.20, 'Case fan clips into motherboard I/O shroud');
});


