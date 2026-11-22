/**
 * CableRoutingSystem.mjs
 * Pure 3D spatial cable routing, dynamic hardware-aware port coordinates,
 * and obstacle bounding-box calculators for collision-free PC wiring and
 * accurate millimeter-scale component alignment. Zero DOM / Three.js dependency.
 */

import { SIM_SCALE_MM_TO_UNITS, detectStorageKind } from './SimulationDataManager.mjs';
import {
  CASE_ORIGIN,
  CASE_MB_ANCHOR,
  CASE_SUB_ANCHORS,
  BENCH_PREP_ORIGIN,
  MB_LOCAL_SOCKETS,
} from './PlacementSnappingSystem.mjs';

const S = SIM_SCALE_MM_TO_UNITS;

/**
 * Returns exact world-space structural bounds for the active PC case.
 */
export function getCaseLayoutMetrics(caseComp = null) {
  const dims = caseComp?.dimensionsMm || { w: 220, h: 460, d: 460 };
  const d = (dims.d || 460) * S; // World X span (rear to front)
  const h = (dims.h || 460) * S; // World Y span (bottom to top)
  const w = (dims.w || 220) * S; // World Z span (back steel panel to glass)

  const rearWallOuterX = CASE_ORIGIN.x - d / 2;
  const rearWallInnerX = rearWallOuterX + 0.058;
  const frontInnerX = CASE_ORIGIN.x + d / 2 - 0.28;
  const floorTopY = 0.11;
  const roofInnerY = h - 0.068;
  const backPanelInnerZ = -w / 2 + 0.06;
  const glassInnerZ = w / 2 - 0.055;

  const mbTrayZ = -0.76; // Thickness 0.04 => front -0.74, back -0.78
  const rearChannelZ = Math.max(backPanelInnerZ + 0.14, -0.88);
  const grommetX = CASE_ORIGIN.x + 0.45; // -2.20 in world X
  const shroudLen = d * 0.62;
  const shroudTopY = 1.12;
  const shroudFrontX = rearWallOuterX + shroudLen + 0.06;

  return {
    d,
    h,
    w,
    rearWallOuterX,
    rearWallInnerX,
    frontInnerX,
    floorTopY,
    roofInnerY,
    backPanelInnerZ,
    glassInnerZ,
    mbTrayZ,
    rearChannelZ,
    grommetX,
    shroudLen,
    shroudTopY,
    shroudFrontX,
  };
}

/**
 * Computes world-space PSU center so the rear AC faceplate sits flush
 * against the case rear PSU cutout regardless of PSU depth (140mm / 160mm / 180mm).
 */
export function getPsuWorldCenter(psuComp = null, caseComp = null) {
  const layout = getCaseLayoutMetrics(caseComp);
  const psuLenX = (psuComp?.dimensionsMm?.d || 140) * S;
  return {
    x: layout.rearWallOuterX + 0.04 + psuLenX * 0.5,
    y: CASE_SUB_ANCHORS.psu.y,
    z: CASE_SUB_ANCHORS.psu.z,
    lenX: psuLenX,
    hY: (psuComp?.dimensionsMm?.h || 86) * S,
    wZ: (psuComp?.dimensionsMm?.w || 150) * S,
  };
}

/**
 * Computes world-space Y center for a SATA drive resting flush on the case drive shelf
 * (shelf center Y = 0.36, top surface = 0.388).
 */
export function getStorageMountY(storageComp = null) {
  const kind = detectStorageKind(storageComp);
  if (kind === 'sata_35') return 0.515; // half-height 0.125 -> bottom 0.390 on 0.388 shelf
  return 0.436; // 2.5" SSD half-height 0.046 -> bottom 0.390 on 0.388 shelf
}

/**
 * Computes exact world-space GPU geometry envelope using real ATX orientation
 * where PCB + PCIe fingers sit at y = 0 and heatsink/shroud hang downward (-Y).
 */
export function getGpuWorldMetrics(gpuComp = null, mbOrigin = CASE_MB_ANCHOR) {
  const dims = gpuComp?.dimensionsMm || { w: 268, h: 118, d: 42 };
  const len = dims.w * S;
  const depthZ = dims.h * S;
  const thickY = dims.d * S;
  const shiftX = (len - 2.0) * 0.5;
  const anchorX = mbOrigin.x + MB_LOCAL_SOCKETS.gpu.x;
  const anchorY = mbOrigin.y + MB_LOCAL_SOCKETS.gpu.y;
  const anchorZ = mbOrigin.z + MB_LOCAL_SOCKETS.gpu.z;

  const centerX = anchorX + shiftX;
  const minX = centerX - len * 0.5;
  const maxX = centerX + len * 0.5;
  const maxY = anchorY + 0.048; // Backplate top sits just above PCIe slot PCB plane
  const minY = anchorY - Math.max(0.32, thickY - 0.035);
  const minZ = anchorZ;
  const maxZ = anchorZ + depthZ;

  // Power header at local (centerShiftX + len * 0.32, 0.0, depthZ - 0.04)
  const pwrPort = {
    x: centerX + len * 0.32,
    y: anchorY + 0.004,
    z: anchorZ + depthZ - 0.015,
  };

  return {
    len,
    depthZ,
    thickY,
    shiftX,
    anchorX,
    anchorY,
    anchorZ,
    centerX,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    pwrPort,
  };
}

/**
 * Resolves exact world-space port coordinates for all installed components,
 * dynamically adapting to ATX / Micro-ATX / Mini-ITX motherboards, GPU dimensions,
 * PSU depth, CPU cooler profile, and 2.5" vs 3.5" SATA drives.
 */
export function computePortWorldCoords(context = {}) {
  const {
    mbMountLocation = 'case',
    mbComp = null,
    coolerComp = null,
    gpuComp = null,
    psuComp = null,
    storageComp = null,
    caseComp = null,
  } = context;

  const mbOrigin = mbMountLocation === 'case' ? CASE_MB_ANCHOR : BENCH_PREP_ORIGIN;
  const layout = getCaseLayoutMetrics(caseComp);

  const mbDims = mbComp?.dimensionsMm || { w: 244, h: 305, d: 24 };
  const isMiniItx = mbDims.w < 200 || mbDims.h < 200;
  const isMicro = !isMiniItx && mbDims.h < 270;

  // Exact motherboard header locations matching ProceduralHardwareFactory.createMotherboardModel
  // (boardRoot rotates +90° around X: boardRoot (x, y, z) -> MB local (x, -z, y))
  const mb24 = isMiniItx
    ? { x: mbOrigin.x + 0.42, y: mbOrigin.y + 0.42, z: mbOrigin.z + 0.095 }
    : { x: mbOrigin.x + 1.15, y: mbOrigin.y + 0.45, z: mbOrigin.z + 0.095 };

  const mbEps = isMiniItx
    ? { x: mbOrigin.x - 0.64, y: mbOrigin.y + 1.45, z: mbOrigin.z + 0.095 }
    : { x: mbOrigin.x - 0.625, y: mbOrigin.y + 1.45, z: mbOrigin.z + 0.095 };

  const mbCpuFan = isMiniItx
    ? { x: mbOrigin.x + 0.30, y: mbOrigin.y + 1.41, z: mbOrigin.z + 0.08 }
    : { x: mbOrigin.x + 0.68, y: mbOrigin.y + 1.41, z: mbOrigin.z + 0.08 };

  const mbSata = isMiniItx
    ? { x: mbOrigin.x + 0.42, y: mbOrigin.y - 0.04, z: mbOrigin.z + 0.055 }
    : { x: mbOrigin.x + 1.205, y: mbOrigin.y - 0.70, z: mbOrigin.z + 0.055 };

  const mbSysFan = isMiniItx
    ? { x: mbOrigin.x + 0.36, y: mbOrigin.y + 0.90, z: mbOrigin.z + 0.08 }
    : { x: mbOrigin.x + 1.14, y: mbOrigin.y + 0.90, z: mbOrigin.z + 0.08 };

  const mbJfp1 = isMiniItx
    ? { x: mbOrigin.x + 0.24, y: mbOrigin.y - 0.14, z: mbOrigin.z + 0.08 }
    : isMicro
      ? { x: mbOrigin.x + 0.47, y: mbOrigin.y - 0.87, z: mbOrigin.z + 0.08 }
      : { x: mbOrigin.x + 0.76, y: mbOrigin.y - 1.47, z: mbOrigin.z + 0.08 };

  // Dynamic PSU modular socket bank face (+X side of PSU)
  const psu = getPsuWorldCenter(psuComp, caseComp);
  const psuFaceX = psu.x + psu.lenX * 0.5 + 0.045;

  // Dynamic GPU power header
  const gpu = getGpuWorldMetrics(gpuComp, mbOrigin);

  // Dynamic CPU cooler PWM lead exit right on the upper-right fan rim
  const coolerType = coolerComp?.coolerType || ((coolerComp?.dimensionsMm?.h || 155) < 95 ? 'low_profile' : 'tower');
  const coolerAnchorX = mbOrigin.x + MB_LOCAL_SOCKETS.cooler.x;
  const coolerAnchorY = mbOrigin.y + MB_LOCAL_SOCKETS.cooler.y;
  const coolerAnchorZ = mbOrigin.z + MB_LOCAL_SOCKETS.cooler.z;
  const coolerLead =
    coolerType === 'low_profile'
      ? { x: coolerAnchorX + 0.38, y: coolerAnchorY + 0.38, z: coolerAnchorZ + 0.38 }
      : coolerType === 'dual_tower'
        ? { x: coolerAnchorX + 0.52, y: coolerAnchorY + 0.54, z: coolerAnchorZ + 0.52 }
        : { x: coolerAnchorX + 0.46, y: coolerAnchorY + 0.52, z: coolerAnchorZ + 0.48 };

  // Distinct SATA 15-pin Power vs 7-pin Data rear connectors on drive shelf
  const storageKind = detectStorageKind(storageComp);
  const driveY = getStorageMountY(storageComp);
  const driveZ = CASE_SUB_ANCHORS.sata_bay.z;
  const driveX = CASE_SUB_ANCHORS.sata_bay.x;
  const sataBackZ = storageKind === 'sata_35' ? driveZ - 0.755 : driveZ - 0.515;
  const sataPortY = storageKind === 'sata_35' ? driveY - 0.052 : driveY - 0.010;
  const sataPwrPort = {
    x: driveX + (storageKind === 'sata_35' ? -0.21 : -0.17),
    y: sataPortY,
    z: sataBackZ,
  };
  const sataDataPort = {
    x: driveX + (storageKind === 'sata_35' ? 0.04 : 0.045),
    y: sataPortY,
    z: sataBackZ,
  };
  // Unified midpoint anchor for clickable 3D port ring indicator (`sata_drive`)
  const sataDriveIndicator = {
    x: driveX - 0.07,
    y: sataPortY + 0.02,
    z: sataBackZ,
  };

  // Rear 120mm case fan PWM pigtail exit (points -Z toward motherboard tray when mounted)
  const fanLead = {
    x: CASE_SUB_ANCHORS.case_fan.x + 0.02,
    y: CASE_SUB_ANCHORS.case_fan.y - 0.31,
    z: CASE_SUB_ANCHORS.case_fan.z - 0.54,
  };

  // Case front-panel harness entry at lower-right rubber grommet
  const caseFp = {
    x: layout.grommetX,
    y: isMicro ? 1.72 : 1.38,
    z: layout.mbTrayZ + 0.04,
  };

  return {
    psu_main: { x: psuFaceX, y: psu.y + 0.16, z: psu.z - 0.34 },
    psu_eps: { x: psuFaceX, y: psu.y + 0.16, z: psu.z + 0.15 },
    psu_pcie: { x: psuFaceX, y: psu.y - 0.14, z: psu.z + 0.34 },
    psu_sata: { x: psuFaceX, y: psu.y - 0.14, z: psu.z - 0.36 },
    mb_24pin: mb24,
    mb_eps: mbEps,
    mb_cpufan: mbCpuFan,
    mb_sata: mbSata,
    mb_sysfan: mbSysFan,
    mb_jfp1: mbJfp1,
    cooler_lead: coolerLead,
    gpu_pwr: gpu.pwrPort,
    sata_drive: sataDriveIndicator,
    sata_drive_pwr: sataPwrPort,
    sata_drive_data: sataDataPort,
    fan_lead: fanLead,
    case_fp: caseFp,
  };
}

/**
 * Computes realistic, obstacle-free 3D waypoints for each PC cable so no wire
 * ever passes through the motherboard, GPU, CPU cooler, RAM, or solid steel walls.
 */
export function computeCableWaypoints(cableDef, context = {}) {
  const coords = computePortWorldCoords(context);
  const layout = getCaseLayoutMetrics(context.caseComp);
  const mbOrigin = context.mbMountLocation === 'case' ? CASE_MB_ANCHOR : BENCH_PREP_ORIGIN;
  const gpu = getGpuWorldMetrics(context.gpuComp, mbOrigin);

  const id = cableDef?.id;
  const rearZ = layout.rearChannelZ; // -0.88 (strictly behind mbTray -0.78, inside back wall -1.04)
  const gromX = layout.grommetX; // -2.20
  const topChannelY = Math.min(layout.roofInnerY - 0.05, mbOrigin.y + 1.59); // ~4.45 (strictly above MB top 4.385)

  if (id === 'c_24pin') {
    const s = coords.psu_main;
    const e = coords.mb_24pin;
    return [
      { ...s },
      { x: s.x + 0.18, y: s.y, z: -0.54 },
      { x: s.x + 0.34, y: s.y + 0.12, z: rearZ },
      { x: gromX + 0.02, y: 1.56, z: rearZ },
      { x: gromX + 0.02, y: e.y, z: rearZ },
      { x: gromX, y: e.y, z: layout.mbTrayZ + 0.04 }, // Emerge cleanly through rubber grommet
      { x: Math.max(e.x + 0.16, gromX - 0.08), y: e.y, z: e.z + 0.16 },
      { x: e.x, y: e.y, z: e.z + 0.13 }, // Align straight in front of 24-pin socket (-Z entry)
      { ...e },
    ];
  }

  if (id === 'c_8pin_cpu') {
    const s = coords.psu_eps;
    const e = coords.mb_eps;
    const epsBackZ = Math.max(layout.backPanelInnerZ + 0.12, rearZ - 0.02); // Separate lane behind 24-pin in rear channel
    return [
      { ...s },
      { x: s.x + 0.18, y: s.y, z: -0.14 },
      { x: s.x + 0.30, y: s.y - 0.03, z: -0.62 },
      { x: s.x + 0.28, y: 1.05, z: epsBackZ },
      { x: s.x + 0.14, y: 2.35, z: epsBackZ },
      { x: e.x + 0.22, y: topChannelY - 0.02, z: epsBackZ },
      { x: e.x, y: topChannelY, z: epsBackZ },
      { x: e.x, y: topChannelY, z: layout.mbTrayZ + 0.05 }, // Pop through top-left EPS cutout above MB
      { x: e.x, y: topChannelY - 0.02, z: e.z + 0.05 },
      { ...e },
    ];
  }

  if (id === 'c_pcie_8') {
    const s = coords.psu_pcie;
    const e = coords.gpu_pwr;
    // Clamp front sweep strictly inside tempered glass panel (with 7mm clearance)
    const frontClearZ = Math.min(layout.glassInnerZ - 0.08, e.z + 0.19);
    const grommetZ = Math.min(frontClearZ - 0.06, 0.58);
    // Route safely inside PSU shroud, up through shroud PCIe grommet, outside GPU shroud, then straight into GPU header
    const riseX = Math.max(s.x + 0.26, Math.min(layout.shroudFrontX - 0.16, e.x));
    return [
      { ...s },
      { x: s.x + 0.20, y: s.y, z: Math.min(grommetZ, s.z + 0.14) },
      { x: riseX, y: 0.72, z: grommetZ },
      { x: riseX, y: layout.shroudTopY + 0.04, z: grommetZ }, // Emerge cleanly through PSU shroud grommet
      { x: e.x, y: Math.max(layout.shroudTopY + 0.34, gpu.minY - 0.14), z: frontClearZ },
      { x: e.x, y: e.y - 0.12, z: frontClearZ },
      { x: e.x, y: e.y, z: Math.min(frontClearZ, e.z + 0.13) },
      { ...e },
    ];
  }

  if (id === 'c_cpu_fan') {
    const s = coords.cooler_lead;
    const e = coords.mb_cpufan;
    // Hug cleanly above the RAM DIMM latches (y = 4.11) and top edge of cooler
    const clearY = Math.min(topChannelY - 0.04, Math.max(e.y + 0.02, 4.28));
    return [
      { ...s },
      { x: s.x + 0.06, y: Math.max(s.y + 0.12, 4.18), z: Math.min(s.z, -0.14) },
      { x: (s.x + e.x) * 0.5 + 0.06, y: clearY, z: -0.34 },
      { x: e.x, y: clearY, z: e.z + 0.06 },
      { ...e },
    ];
  }

  if (id === 'c_case_fan') {
    const s = coords.fan_lead;
    const e = coords.mb_sysfan;
    // Tuck cleanly up the rear corner above the I/O armor, across the ceiling gap ABOVE the cooler & RAM, then down the right edge
    const rearHugX = layout.rearWallInnerX + 0.11;
    const ceilY = topChannelY; // ~4.45 (strictly above VRM heatsink 4.30 and cooler 4.12!)
    const rightMarginX = Math.max(e.x + 0.06, mbOrigin.x + 1.24);
    return [
      { ...s },
      { x: rearHugX, y: Math.max(s.y + 0.25, 3.65), z: -0.28 },
      { x: rearHugX + 0.08, y: ceilY, z: -0.38 },
      { x: mbOrigin.x - 0.10, y: ceilY, z: -0.50 },
      { x: rightMarginX, y: ceilY - 0.02, z: -0.54 },
      { x: rightMarginX, y: e.y + 0.14, z: -0.54 },
      { x: e.x + 0.06, y: e.y, z: e.z + 0.04 },
      { ...e },
    ];
  }

  if (id === 'c_sata_pwr') {
    const s = coords.psu_sata;
    const e = coords.sata_drive_pwr;
    const tunnelY = 0.24; // Passes cleanly through PSU shroud front lower tunnel cutout (Y 0.12..0.52)
    return [
      { ...s },
      { x: s.x + 0.18, y: tunnelY + 0.06, z: -0.44 },
      { x: layout.shroudFrontX - 0.12, y: tunnelY, z: -0.56 },
      { x: layout.shroudFrontX + 0.14, y: tunnelY, z: -0.60 }, // Cleanly through lower shroud bulkhead opening
      { x: e.x - 0.16, y: e.y - 0.04, z: Math.min(e.z - 0.16, -0.76) },
      { x: e.x, y: e.y, z: e.z - 0.14 },
      { ...e },
    ];
  }

  if (id === 'c_sata_data') {
    const s = coords.sata_drive_data;
    const e = coords.mb_sata;
    return [
      { ...s },
      { x: s.x, y: s.y, z: s.z - 0.15 },
      { x: s.x - 0.22, y: s.y + 0.14, z: rearZ },
      { x: gromX + 0.04, y: 1.35, z: rearZ },
      { x: gromX + 0.04, y: e.y, z: rearZ },
      { x: gromX, y: e.y, z: layout.mbTrayZ + 0.04 }, // Emerge cleanly through rubber grommet
      { x: Math.max(e.x + 0.12, gromX - 0.06), y: e.y, z: e.z - 0.025 }, // Stay flush to PCB behind GPU shroud
      { ...e },
    ];
  }

  if (id === 'c_front_panel') {
    const s = coords.case_fp;
    const e = coords.mb_jfp1;
    // Tuck cleanly below motherboard bottom / below GPU along PSU shroud deck
    const lowY = Math.max(layout.shroudTopY + 0.10, e.y - 0.14);
    return [
      { ...s },
      { x: s.x - 0.06, y: lowY, z: -0.62 },
      { x: (s.x + e.x) * 0.5, y: lowY, z: -0.54 },
      { x: e.x, y: lowY, z: e.z + 0.05 },
      { ...e },
    ];
  }

  // Fallback for any custom cable definition
  const s = coords[cableDef?.fromPortKey] || { x: 0, y: 1, z: 0 };
  const e = coords[cableDef?.toPortKey] || { x: 0, y: 2, z: 0 };
  return [
    { ...s },
    { x: (s.x + e.x) * 0.5, y: (s.y + e.y) * 0.5, z: Math.min(s.z, e.z) - 0.08 },
    { ...e },
  ];
}

/**
 * Pure AABB obstacle calculator for installed hardware components inside the case,
 * used by automated spatial verification tests to prove cables never clip through parts.
 */
export function getComponentObstacleBoxes(context = {}) {
  const mbOrigin = context.mbMountLocation === 'case' ? CASE_MB_ANCHOR : BENCH_PREP_ORIGIN;
  const gpu = getGpuWorldMetrics(context.gpuComp, mbOrigin);
  const coolerType = context.coolerComp?.coolerType || ((context.coolerComp?.dimensionsMm?.h || 155) < 95 ? 'low_profile' : 'tower');
  const coolerH = Math.min(1.56, ((context.coolerComp?.dimensionsMm?.h || 155) * S) - 0.04);
  const cX = mbOrigin.x + MB_LOCAL_SOCKETS.cooler.x;
  const cY = mbOrigin.y + MB_LOCAL_SOCKETS.cooler.y;
  const cZ = mbOrigin.z + MB_LOCAL_SOCKETS.cooler.z;

  // Cooler fin stack core AABB (trimmed slightly at outer fan lead exit so endpoint contact isn't flagged)
  const coolerHalfX = coolerType === 'low_profile' ? 0.36 : coolerType === 'dual_tower' ? 0.54 : 0.36;
  const coolerHalfY = coolerType === 'low_profile' ? 0.36 : 0.48;
  const coolerBox = {
    name: 'cpu_cooler',
    minX: cX - coolerHalfX,
    maxX: cX + coolerHalfX,
    minY: cY - coolerHalfY,
    maxY: cY + coolerHalfY,
    minZ: cZ + 0.06,
    maxZ: cZ + (coolerType === 'low_profile' ? 0.44 : coolerH - 0.04),
  };

  // GPU heatsink/shroud interior body AABB (inset 0.04 from +Z header face so plug seating isn't flagged)
  const gpuBox = {
    name: 'gpu_body',
    minX: gpu.minX + 0.04,
    maxX: gpu.maxX - 0.04,
    minY: gpu.minY + 0.03,
    maxY: gpu.maxY - 0.02,
    minZ: gpu.minZ + 0.04,
    maxZ: gpu.maxZ - 0.05,
  };

  // RAM DIMM array AABB (A2/B2 sticks at MB-local x = 0.73..0.93, y = 0.58 ± 0.65, z = 0.06..0.44)
  const ramBox = {
    name: 'ram_sticks',
    minX: mbOrigin.x + 0.68,
    maxX: mbOrigin.x + 0.98,
    minY: mbOrigin.y + 0.58 - 0.64,
    maxY: mbOrigin.y + 0.58 + 0.64,
    minZ: mbOrigin.z + 0.06,
    maxZ: mbOrigin.z + 0.44,
  };

  // Motherboard interior PCB plane (inset from outer edge headers so edge plugs aren't flagged)
  const mbDims = context.mbComp?.dimensionsMm || { w: 244, h: 305, d: 24 };
  const isMiniItx = mbDims.w < 200 || mbDims.h < 200;
  const isMicro = !isMiniItx && mbDims.h < 270;
  const mbBottom = isMiniItx ? 0.175 : isMicro ? 0.915 : 1.525;
  const mbLeft = mbOrigin.x - 1.12;
  const mbRight = mbOrigin.x + (isMiniItx ? 0.36 : 1.06);
  const mbPcbCoreBox = {
    name: 'motherboard_pcb_core',
    minX: mbLeft,
    maxX: mbRight,
    minY: mbOrigin.y - mbBottom + 0.12,
    maxY: mbOrigin.y + 1.36,
    minZ: mbOrigin.z - 0.03,
    maxZ: mbOrigin.z + 0.03,
  };

  return [coolerBox, gpuBox, ramBox, mbPcbCoreBox];
}

/**
 * Evaluates a piecewise centripetal-like Catmull-Rom interpolation over raw {x,y,z} waypoints
 * in pure JS (zero Three.js needed) for unit-testing cable collision clearance.
 */
export function sampleWaypoints(points, samplesPerSeg = 8) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      // Standard cubic Hermite / Catmull-Rom (tau = 0.25) matching centripetal anti-overshoot behavior
      const tau = 0.25;
      const interp = (v0, v1, v2, v3) => {
        const m1 = tau * (v2 - v0);
        const m2 = tau * (v3 - v1);
        return (
          v1 +
          m1 * t +
          (3 * (v2 - v1) - 2 * m1 - m2) * t2 +
          (2 * (v1 - v2) + m1 + m2) * t3
        );
      };
      out.push({
        x: interp(p0.x, p1.x, p2.x, p3.x),
        y: interp(p0.y, p1.y, p2.y, p3.y),
        z: interp(p0.z, p1.z, p2.z, p3.z),
      });
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

export function pointInsideBox(pt, box) {
  return (
    pt.x > box.minX &&
    pt.x < box.maxX &&
    pt.y > box.minY &&
    pt.y < box.maxY &&
    pt.z > box.minZ &&
    pt.z < box.maxZ
  );
}
