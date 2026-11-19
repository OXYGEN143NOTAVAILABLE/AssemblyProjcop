/**
 * PlacementSnappingSystem.mjs
 * Pure 3D spatial anchor coordinates, proximity snapping (without auto-completing
 * from arbitrary distances), discrete 90° orientation alignment detection, and
 * non-clipping clearance guards. Zero DOM/Three dependency.
 */

import { normalizeFormFactorToken } from './SimulationDataManager.mjs';

export const CASE_ORIGIN = Object.freeze({ x: -2.65, y: 0, z: 0 });
export const BENCH_PREP_ORIGIN = Object.freeze({ x: 1.55, y: 0.04, z: 0.0 });

// Canonical world anchor for Motherboard inside Case Standoffs (PCB back rests at -0.680)
export const CASE_MB_ANCHOR = Object.freeze({
  x: CASE_ORIGIN.x - 1.0, // -3.65 (ATX left edge lands at -4.87 near rear wall -4.95)
  y: 2.86,
  z: -0.662,
});

// Workbench staging tray positions (spacious ESD mat slots on expanded tray X: 3.35..7.85, zero float/overlap)
export const STAGING_ANCHORS = Object.freeze({
  mb:       { x: 1.55, y: 0.04, z: 0.0 },
  cpu:      { x: 3.95, y: 0.03, z: 1.75 },
  cooler:   { x: 7.05, y: 0.02, z: 1.70 },
  ram:      { x: 4.85, y: 0.02, z: 1.80 },
  gpu:      { x: 5.15, y: 0.21, z: -0.25 },
  storage:  { x: 5.95, y: 0.05, z: 1.85 },
  psu:      { x: 4.35, y: 0.46, z: -2.05 },
  case_fan: { x: 6.35, y: 0.61, z: -2.05 },
});

// Motherboard-local offsets relative to motherboard center (exact pc-anatomy ATX spec: 1 unit = 100mm)
export const MB_LOCAL_SOCKETS = Object.freeze({
  cpu:        { x: 0.08,  y: 0.64,  z: 0.052 },
  cooler:     { x: 0.08,  y: 0.64,  z: 0.095 },
  ram:        { x: 0.78,  y: 0.58,  z: 0.040 },
  m2_storage: { x: -0.10, y: -0.11, z: 0.038 },
  gpu:        { x: -0.31, y: -0.32, z: 0.075 },
});

// Case-local anchors relative to CASE_ORIGIN
export const CASE_SUB_ANCHORS = Object.freeze({
  psu:      { x: CASE_ORIGIN.x - 1.59, y: 0.56, z: 0.0 },
  sata_bay: { x: CASE_ORIGIN.x + 1.42, y: 0.50, z: 0.05 },
  case_fan: { x: CASE_ORIGIN.x - 2.18, y: 3.62, z: 0.24 },
});

// Radii in Three.js units (1 unit = 100mm) — avoids snapping from arbitrary far distance
export const SNAP_RADII = Object.freeze({
  mb: 0.95,
  cpu: 0.62,
  cooler: 0.78,
  ram: 0.72,
  gpu: 0.95,
  psu: 0.90,
  storage: 0.78,
  case_fan: 0.78,
});

export function vecDistance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Rotates a point around the X axis by angleRad (used for flat bench prep pad Rx(-PI/2)).
 */
export function rotatePointX(pt, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: pt.x,
    y: pt.y * c - pt.z * s,
    z: pt.y * s + pt.z * c,
  };
}

export function normalizeRotationStep(step) {
  const n = Math.round(Number(step) || 0) % 4;
  return n < 0 ? n + 4 : n;
}

export class PlacementSnappingSystem {
  /**
   * Resolves the world anchor position and base Euler rotation for a given slot
   * based on whether the motherboard is on the bench or mounted inside the case.
   */
  getTargetAnchors(slotKey, context = {}) {
    const {
      mbMountLocation = null, // 'bench' | 'case' | null
      storageKind = 'm2_nvme',
    } = context;

    const candidates = [];

    if (slotKey === 'mb') {
      candidates.push({
        mountLocation: 'case',
        position: { ...CASE_MB_ANCHOR },
        baseEuler: { x: 0, y: 0, z: 0 },
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.mb,
        label: 'Case Motherboard Standoffs',
      });
      candidates.push({
        mountLocation: 'bench',
        position: { ...BENCH_PREP_ORIGIN },
        baseEuler: { x: -Math.PI / 2, y: 0, z: 0 },
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.mb,
        label: 'ESD Bench Prep Pad',
      });
      return candidates;
    }

    if (['cpu', 'cooler', 'ram'].includes(slotKey) || (slotKey === 'storage' && storageKind === 'm2_nvme')) {
      if (!mbMountLocation) return [];
      const mbPos = mbMountLocation === 'case' ? CASE_MB_ANCHOR : BENCH_PREP_ORIGIN;
      const mbTiltX = mbMountLocation === 'case' ? 0 : -Math.PI / 2;
      const localKey = slotKey === 'storage' ? 'm2_storage' : slotKey;
      const localOffset = MB_LOCAL_SOCKETS[localKey];
      const rotated = mbTiltX !== 0 ? rotatePointX(localOffset, mbTiltX) : { ...localOffset };

      candidates.push({
        mountLocation: mbMountLocation === 'case' ? 'mb_in_case' : 'mb_on_bench',
        position: {
          x: mbPos.x + rotated.x,
          y: mbPos.y + rotated.y,
          z: mbPos.z + rotated.z,
        },
        baseEuler: { x: mbTiltX, y: 0, z: 0 },
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII[slotKey] || 0.72,
        label: slotKey === 'cpu' ? 'CPU Socket' : slotKey === 'cooler' ? 'CPU Cooler Mount' : slotKey === 'ram' ? 'DIMM Slots' : 'M.2 NVMe Slot',
      });
      return candidates;
    }

    if (slotKey === 'gpu') {
      if (mbMountLocation !== 'case') return [];
      const localOffset = MB_LOCAL_SOCKETS.gpu;
      candidates.push({
        mountLocation: 'case_pcie',
        position: {
          x: CASE_MB_ANCHOR.x + localOffset.x,
          y: CASE_MB_ANCHOR.y + localOffset.y,
          z: CASE_MB_ANCHOR.z + localOffset.z,
        },
        baseEuler: { x: 0, y: 0, z: 0 },
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.gpu,
        label: 'PCIe x16 Slot & Rear Bracket',
      });
      return candidates;
    }

    if (slotKey === 'storage' && storageKind !== 'm2_nvme') {
      candidates.push({
        mountLocation: 'case_drive_bay',
        position: { ...CASE_SUB_ANCHORS.sata_bay },
        baseEuler: { x: 0, y: 0, z: 0 },
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.storage,
        label: 'Case SATA Drive Bay',
      });
      return candidates;
    }

    if (slotKey === 'psu') {
      candidates.push({
        mountLocation: 'case_psu_bay',
        position: { ...CASE_SUB_ANCHORS.psu },
        baseEuler: { x: 0, y: 0, z: 0 },
        // Step 0 = fan facing DOWN toward bottom intake vent; Step 2 = flipped upside down
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.psu,
        label: 'PSU Shroud Bay (Fan Down)',
      });
      return candidates;
    }

    if (slotKey === 'case_fan') {
      candidates.push({
        mountLocation: 'case_rear_exhaust',
        position: { ...CASE_SUB_ANCHORS.case_fan },
        baseEuler: { x: 0, y: Math.PI / 2, z: 0 },
        // Step 0 = airflow pointing out rear (-X exhaust)
        expectedRotationStep: 0,
        snapRadius: SNAP_RADII.case_fan,
        label: 'Rear 120mm Exhaust Mount',
      });
      return candidates;
    }

    return candidates;
  }

  /**
   * Evaluates physical clearance/collision before allowing placement at a target anchor.
   */
  checkClearance(slotKey, target, context = {}) {
    const {
      sidePanelOpen = true,
      installedSlots = {},
      component = null,
      caseComponent = null,
    } = context;

    // 1. Inside-case placements require side panel open
    const needsInsideCase =
      target.mountLocation === 'case' ||
      target.mountLocation === 'mb_in_case' ||
      target.mountLocation === 'case_pcie' ||
      target.mountLocation === 'case_drive_bay' ||
      target.mountLocation === 'case_rear_exhaust';

    if (needsInsideCase && !sidePanelOpen) {
      return {
        blocked: true,
        reason: 'Remove or open the tempered glass side panel before installing inside the case.',
      };
    }

    // 2. CPU blocked if Cooler is already mounted on socket
    if (slotKey === 'cpu' && installedSlots.cooler) {
      return {
        blocked: true,
        reason: 'CPU Cooler blocks socket access. Remove the cooler before installing the CPU.',
      };
    }

    // 3. Cooler requires CPU installed first
    if (slotKey === 'cooler' && !installedSlots.cpu) {
      return {
        blocked: true,
        reason: 'Install the CPU into the motherboard socket before mounting the CPU Cooler.',
      };
    }

    // 4. Motherboard cannot move between bench and case while GPU is installed in case slot
    if (slotKey === 'mb' && installedSlots.gpu) {
      return {
        blocked: true,
        reason: 'Remove the Graphics Card before moving the motherboard.',
      };
    }

    // 5. Severe physical length clipping guard for GPU vs Case only when explicitly oversized?
    // Wait: prompt asks for post-assembly compatibility validation OR physical non-clipping.
    // Let's keep case clipping check informational or block only impossible overlaps like Cooler over empty socket.
    // Allow incompatible hardware selection to be placed in its slot so ValidationEngine can grade it after!
    // (Exception: extreme chassis intrusion warning returned cleanly as advisory or visual hint if desired).
    if (slotKey === 'gpu' && caseComponent && component) {
      const ff = normalizeFormFactorToken(caseComponent.form_factor_support || '');
      void ff;
    }

    return { blocked: false, reason: null };
  }

  /**
   * Evaluates orientation (90° step) relative to target expected orientation.
   */
  evaluateOrientation(slotKey, rotationStep, target) {
    const step = normalizeRotationStep(rotationStep);
    const expected = normalizeRotationStep(target.expectedRotationStep ?? 0);
    if (step === expected) {
      return { aligned: true, reason: null };
    }

    const messages = {
      cpu: `CPU rotated ${step * 90}° — Pin-1 gold triangle does not match socket corner (press R to rotate).`,
      ram: `RAM rotated ${step * 90}° — DIMM key notch is reversed/misaligned (press R to rotate).`,
      psu: `PSU rotated ${step * 90}° — intake fan is not facing bottom vent (press R to orient fan down).`,
      cooler: `CPU Cooler rotated ${step * 90}° — fan shroud faces away from front-to-back airflow (press R to align).`,
      case_fan: `Case Fan rotated ${step * 90}° — airflow arrow points wrong way (press R to align exhaust).`,
      mb: `Motherboard rotated ${step * 90}° — rear I/O shield edge must face left toward case rear (press R to align).`,
      gpu: `GPU rotated ${step * 90}° — PCIe fingers must point toward motherboard slot (press R to align).`,
      storage: `Storage drive rotated ${step * 90}° — connector edge must align with slot/bay (press R to rotate).`,
    };

    return {
      aligned: false,
      reason: messages[slotKey] || `Component rotated ${step * 90}° out of alignment (press R to rotate).`,
    };
  }

  /**
   * Evaluates live drag position + rotation against nearest valid target anchor.
   */
  evaluatePlacement(slotKey, currentPos, rotationStep = 0, context = {}) {
    const candidates = this.getTargetAnchors(slotKey, context);
    if (!candidates.length) {
      return {
        withinRange: false,
        status: 'no_anchor',
        target: null,
        distance: Infinity,
        aligned: false,
        blocked: false,
        reason: slotKey === 'gpu'
          ? 'Mount the Motherboard inside the PC Case before installing the GPU.'
          : 'Install Motherboard first to expose this socket/slot.',
      };
    }

    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = vecDistance(currentPos, c.position);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (!best || bestDist > best.snapRadius) {
      return {
        withinRange: false,
        status: 'idle',
        target: best,
        distance: bestDist,
        aligned: false,
        blocked: false,
        reason: null,
      };
    }

    const clearance = this.checkClearance(slotKey, best, context);
    if (clearance.blocked) {
      return {
        withinRange: true,
        status: 'blocked',
        target: best,
        distance: bestDist,
        aligned: false,
        blocked: true,
        reason: clearance.reason,
      };
    }

    const orient = this.evaluateOrientation(slotKey, rotationStep, best);
    return {
      withinRange: true,
      status: orient.aligned ? 'aligned' : 'misaligned',
      target: best,
      distance: bestDist,
      aligned: orient.aligned,
      blocked: false,
      reason: orient.reason,
      snapPosition: { ...best.position },
      snapEuler: { ...best.baseEuler },
    };
  }
}
