/**
 * AssemblyManager.mjs
 * Manages PC assembly progression, physical dependency constraints,
 * configurable valid installation sequences, and component states:
 *   'uninstalled' | 'staged' | 'placed' | 'installed_correct' | 'installed_incorrect'
 */

import {
  HARDWARE_SLOTS,
  SLOT_DISPLAY_NAMES,
  CABLE_DEFINITIONS,
  detectStorageKind,
} from './SimulationDataManager.mjs';
import {
  PlacementSnappingSystem,
  CASE_ORIGIN,
  STAGING_ANCHORS,
  normalizeRotationStep,
} from './PlacementSnappingSystem.mjs';

export const COMPONENT_STATE = Object.freeze({
  UNINSTALLED: 'uninstalled',
  STAGED: 'staged',
  PLACED: 'placed',
  INSTALLED_CORRECT: 'installed_correct',
  INSTALLED_INCORRECT: 'installed_incorrect',
});

export const SEQUENCE_PRESETS = Object.freeze({
  bench_first: {
    id: 'bench_first',
    name: 'Bench Pre-Assembly First (Recommended)',
    steps: [
      { id: 'prep_case', label: '1. Prepare PC Case & remove side panel' },
      { id: 'mb_bench', label: '2. Stage Motherboard on ESD prep pad' },
      { id: 'cpu', label: '3. Align & seat CPU into socket' },
      { id: 'cooler', label: '4. Apply thermal paste & mount CPU Cooler' },
      { id: 'ram', label: '5. Align & seat RAM into DIMM slots' },
      { id: 'mb_case', label: '6. Mount Motherboard sub-assembly into Case' },
      { id: 'psu', label: '7. Install Power Supply (fan down)' },
      { id: 'storage', label: '8. Install Storage Drive (M.2 / SATA)' },
      { id: 'gpu', label: '9. Install Graphics Card into PCIe x16' },
      { id: 'case_fan', label: '10. Mount Rear Case Fan (optional)' },
      { id: 'cables', label: '11. Route & connect power & data cables' },
      { id: 'inspect', label: '12. Close panel & run Final Inspection' },
    ],
  },
  case_first: {
    id: 'case_first',
    name: 'Case-First Installation',
    steps: [
      { id: 'prep_case', label: '1. Prepare PC Case & remove side panel' },
      { id: 'psu', label: '2. Install Power Supply in shroud bay' },
      { id: 'mb_case', label: '3. Install Motherboard into Case standoffs' },
      { id: 'cpu', label: '4. Install CPU into socket' },
      { id: 'ram', label: '5. Install RAM into DIMM slots' },
      { id: 'cooler', label: '6. Apply thermal paste & mount CPU Cooler' },
      { id: 'storage', label: '7. Install Storage Drive' },
      { id: 'gpu', label: '8. Install Graphics Card into PCIe x16' },
      { id: 'case_fan', label: '9. Mount Case Fan' },
      { id: 'cables', label: '10. Connect Power & Data Cables' },
      { id: 'inspect', label: '11. Final Assembly Validation' },
    ],
  },
  freeform: {
    id: 'freeform',
    name: 'Open Lab (Flexible Order)',
    steps: [
      { id: 'prep_case', label: 'Open side panel for interior access' },
      { id: 'core_hw', label: 'Install Case, MB, CPU, Cooler, RAM, Storage, GPU, PSU' },
      { id: 'cables', label: 'Connect power, cooling & front-panel cables' },
      { id: 'inspect', label: 'Run Final Assembly Validation' },
    ],
  },
});

export class AssemblyManager {
  constructor(snappingSystem = new PlacementSnappingSystem()) {
    this.snapping = snappingSystem;
    this.listeners = new Set();
    this.reset();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event, detail) {
    for (const fn of this.listeners) {
      try {
        fn(event, detail);
      } catch (err) {
        console.error('AssemblyManager listener error:', err);
      }
    }
  }

  reset(defaultCaseComponent = null, sequenceId = 'bench_first') {
    this.sequenceId = SEQUENCE_PRESETS[sequenceId] ? sequenceId : 'bench_first';
    this.sidePanelOpen = false;
    this.mbMountLocation = null; // null | 'bench' | 'case'
    this.thermalPasteApplied = false;
    this.isPowered = false;
    this.selectedSlot = null;

    this.slots = {};
    for (const slot of HARDWARE_SLOTS) {
      this.slots[slot] = null;
    }

    if (defaultCaseComponent) {
      this.slots.case = {
        slot: 'case',
        component: defaultCaseComponent,
        status: COMPONENT_STATE.INSTALLED_CORRECT,
        mountLocation: 'workstation',
        position: { ...CASE_ORIGIN },
        rotationStep: 0,
        secured: true,
        aligned: true,
        misalignedReason: null,
      };
    }

    this.cables = {};
    for (const c of CABLE_DEFINITIONS) {
      this.cables[c.id] = {
        id: c.id,
        connected: false,
        connectedAt: null,
      };
    }

    this.emit('state:reset', this.getState());
  }

  setSequencePreset(sequenceId) {
    if (!SEQUENCE_PRESETS[sequenceId]) return false;
    this.sequenceId = sequenceId;
    this.emit('sequence:changed', { sequenceId });
    return true;
  }

  setSidePanelOpen(open) {
    this.sidePanelOpen = Boolean(open);
    this.emit('case:panel', { open: this.sidePanelOpen });
  }

  applyThermalPaste(applied = true) {
    if (!this.slots.cpu || this.slots.cpu.status === COMPONENT_STATE.STAGED) {
      return { ok: false, reason: 'Install the CPU into the motherboard socket before applying thermal paste.' };
    }
    if (this.slots.cooler && this.slots.cooler.status !== COMPONENT_STATE.STAGED) {
      return { ok: false, reason: 'Remove the CPU Cooler first to access the CPU heatspreader.' };
    }
    this.thermalPasteApplied = Boolean(applied);
    this.emit('cpu:paste', { applied: this.thermalPasteApplied });
    return { ok: true };
  }

  /**
   * Spawns/selects a component from the catalog onto the workbench staging tray
   * for inspection, rotation, and manual placement into the PC.
   */
  stageComponent(slotKey, component) {
    if (!HARDWARE_SLOTS.includes(slotKey) || !component) {
      return { ok: false, reason: 'Invalid component slot.' };
    }

    if (slotKey === 'case') {
      // Replacing active PC case swaps chassis seamlessly while preserving staged state
      this.slots.case = {
        slot: 'case',
        component,
        status: COMPONENT_STATE.INSTALLED_CORRECT,
        mountLocation: 'workstation',
        position: { ...CASE_ORIGIN },
        rotationStep: 0,
        secured: true,
        aligned: true,
        misalignedReason: null,
      };
      this.selectedSlot = 'case';
      this.emit('slot:updated', { slot: 'case', entry: this.slots.case });
      return { ok: true, entry: this.slots.case };
    }

    // Prevent hot-swapping an installed part if another installed part physically blocks it
    if (this.slots[slotKey] && this.slots[slotKey].status !== COMPONENT_STATE.STAGED) {
      const check = this.canRemoveComponent(slotKey);
      if (!check.allowed) {
        return { ok: false, reason: check.reason };
      }
      this.removeComponent(slotKey, { silent: true });
    }

    const stagingPos = STAGING_ANCHORS[slotKey] || { x: 2.5, y: 0.2, z: 1.5 };
    const entry = {
      slot: slotKey,
      component,
      status: COMPONENT_STATE.STAGED,
      mountLocation: 'staging',
      position: { ...stagingPos },
      rotationStep: 0,
      secured: false,
      aligned: true,
      misalignedReason: null,
    };

    this.slots[slotKey] = entry;
    this.selectedSlot = slotKey;
    this.emit('slot:updated', { slot: slotKey, entry });
    return { ok: true, entry };
  }

  /**
   * Rotates the active/selected component by deltaSteps * 90 degrees.
   * Re-evaluates orientation state if the component is already placed.
   */
  rotateComponent(slotKey, deltaSteps = 1) {
    const entry = this.slots[slotKey];
    if (!entry) return { ok: false, reason: 'No component in that slot.' };
    if (slotKey === 'case') return { ok: false, reason: 'PC Case remains anchored on the workstation mat.' };

    // If secured by screws/latches, prompt or automatically un-secure for adjustment if permitted
    if (entry.secured) {
      return { ok: false, reason: `Unfasten/remove ${SLOT_DISPLAY_NAMES[slotKey]} before rotating it.` };
    }

    entry.rotationStep = normalizeRotationStep(entry.rotationStep + deltaSteps);

    if (entry.status !== COMPONENT_STATE.STAGED) {
      const evalRes = this.snapping.evaluatePlacement(
        slotKey,
        entry.position,
        entry.rotationStep,
        this._snappingContext(entry.component)
      );
      if (evalRes.withinRange && !evalRes.blocked) {
        entry.aligned = evalRes.aligned;
        entry.misalignedReason = evalRes.reason;
        entry.status = evalRes.aligned ? COMPONENT_STATE.PLACED : COMPONENT_STATE.INSTALLED_INCORRECT;
      }
    }

    this.emit('slot:updated', { slot: slotKey, entry });
    return { ok: true, rotationStep: entry.rotationStep, entry };
  }

  /**
   * Attempts to place a dragged component at worldPos. If within snap radius
   * and physically unblocked, snaps it into the socket/slot/bay; otherwise leaves
   * it wherever the student set it on the workbench staging zone.
   */
  placeComponentAt(slotKey, worldPos, rotationStep = null) {
    const entry = this.slots[slotKey];
    if (!entry) return { ok: false, reason: 'Component is not active in the scene.' };
    if (slotKey === 'case') return { ok: false, reason: 'PC Case stays grounded on the ESD mat.' };

    if (rotationStep !== null && rotationStep !== undefined) {
      entry.rotationStep = normalizeRotationStep(rotationStep);
    }

    const evalRes = this.snapping.evaluatePlacement(
      slotKey,
      worldPos,
      entry.rotationStep,
      this._snappingContext(entry.component)
    );

    if (evalRes.blocked) {
      return { ok: false, blocked: true, reason: evalRes.reason };
    }

    if (!evalRes.withinRange) {
      // Dropped outside snap radius: leave as STAGED at clamped tabletop position
      entry.status = COMPONENT_STATE.STAGED;
      entry.mountLocation = 'staging';
      entry.secured = false;
      entry.position = {
        x: Math.max(-5.9, Math.min(8.1, worldPos.x)),
        y: Math.max(STAGING_ANCHORS[slotKey]?.y ?? 0.1, worldPos.y),
        z: Math.max(-3.35, Math.min(3.35, worldPos.z)),
      };
      if (slotKey === 'mb') {
        this.mbMountLocation = null;
      }
      this.emit('slot:updated', { slot: slotKey, entry });
      return { ok: true, snapped: false, entry };
    }

    // Snap cleanly to anchor (note: misaligned orientation IS allowed to place as INSTALLED_INCORRECT
    // so ValidationEngine evaluates & grades orientation mistakes after assembly!)
    entry.position = { ...evalRes.snapPosition };
    entry.mountLocation = evalRes.target.mountLocation;
    entry.aligned = evalRes.aligned;
    entry.misalignedReason = evalRes.reason;
    entry.secured = false; // User secures via latch/screws or single-click secure action
    entry.status = evalRes.aligned
      ? COMPONENT_STATE.PLACED
      : COMPONENT_STATE.INSTALLED_INCORRECT;

    if (slotKey === 'mb') {
      this.mbMountLocation = evalRes.target.mountLocation; // 'bench' or 'case'
      this._syncMotherboardChildren();
    }

    this.emit('slot:updated', { slot: slotKey, entry, snapTarget: evalRes.target });
    return {
      ok: true,
      snapped: true,
      aligned: evalRes.aligned,
      reason: evalRes.reason,
      target: evalRes.target,
      entry,
    };
  }

  /**
   * Fastens retention bracket, DIMM latches, or mounting screws for a placed part.
   */
  secureComponent(slotKey) {
    const entry = this.slots[slotKey];
    if (!entry) return { ok: false, reason: 'Component not present.' };
    if (entry.status === COMPONENT_STATE.STAGED) {
      return { ok: false, reason: `Place ${SLOT_DISPLAY_NAMES[slotKey]} into its mount point first.` };
    }
    entry.secured = true;
    entry.status = entry.aligned
      ? COMPONENT_STATE.INSTALLED_CORRECT
      : COMPONENT_STATE.INSTALLED_INCORRECT;
    this.emit('slot:updated', { slot: slotKey, entry });
    return { ok: true, entry };
  }

  /**
   * Releases retention bracket, DIMM latches, or mounting screws so a component
   * can be rotated, repositioned, or removed.
   */
  unsecureComponent(slotKey) {
    const entry = this.slots[slotKey];
    if (!entry) return { ok: false, reason: 'Component not present.' };
    if (slotKey === 'case') return { ok: false, reason: 'PC Case remains anchored on the mat.' };
    const blockCheck = this.canRemoveComponent(slotKey);
    if (!blockCheck.allowed) {
      return { ok: false, reason: blockCheck.reason };
    }
    entry.secured = false;
    if (entry.status !== COMPONENT_STATE.STAGED) {
      entry.status = entry.aligned
        ? COMPONENT_STATE.PLACED
        : COMPONENT_STATE.INSTALLED_INCORRECT;
    }
    this.emit('slot:updated', { slot: slotKey, entry });
    return { ok: true, entry };
  }

  /**
   * Direct convenience helper for keyboard/accessibility placement (e.g. clicking "Move to Mount")
   * while still preserving current rotationStep and physical dependency gates!
   */
  snapToNearestValidAnchor(slotKey, preferredLocation = null) {
    const entry = this.slots[slotKey];
    if (!entry) return { ok: false, reason: 'Component not active.' };
    const ctx = this._snappingContext(entry.component);
    const candidates = this.snapping.getTargetAnchors(slotKey, ctx);
    if (!candidates.length) {
      const check = this.snapping.evaluatePlacement(slotKey, entry.position, entry.rotationStep, ctx);
      return { ok: false, reason: check.reason || 'No valid mount point available yet.' };
    }
    const chosen =
      (preferredLocation && candidates.find((c) => c.mountLocation === preferredLocation)) ||
      candidates[0];
    return this.placeComponentAt(slotKey, chosen.position, entry.rotationStep);
  }

  canRemoveComponent(slotKey) {
    if (slotKey === 'case') {
      return { allowed: false, reason: 'Cannot remove the main PC Case from the workstation.' };
    }
    const entry = this.slots[slotKey];
    if (!entry) return { allowed: false, reason: 'Slot is already empty.' };

    // Installed cooler physically covers CPU socket
    if (slotKey === 'cpu' && this.slots.cooler && this.slots.cooler.status !== COMPONENT_STATE.STAGED) {
      return { allowed: false, reason: 'Remove the CPU Cooler first before unseating the CPU.' };
    }

    // Installed motherboard children physically attached to MB
    if (slotKey === 'mb') {
      if (this.slots.gpu && this.slots.gpu.status !== COMPONENT_STATE.STAGED) {
        return { allowed: false, reason: 'Remove the GPU from the PCIe slot before removing the Motherboard.' };
      }
      if (this.slots.cooler && this.slots.cooler.status !== COMPONENT_STATE.STAGED) {
        return { allowed: false, reason: 'Remove the CPU Cooler before removing the Motherboard.' };
      }
      if (this.slots.cpu && this.slots.cpu.status !== COMPONENT_STATE.STAGED) {
        return { allowed: false, reason: 'Remove the CPU before removing the Motherboard.' };
      }
      if (this.slots.ram && this.slots.ram.status !== COMPONENT_STATE.STAGED) {
        return { allowed: false, reason: 'Remove the RAM before removing the Motherboard.' };
      }
    }

    return { allowed: true, reason: null };
  }

  removeComponent(slotKey, options = {}) {
    const check = this.canRemoveComponent(slotKey);
    if (!check.allowed) {
      return { ok: false, reason: check.reason };
    }

    this.slots[slotKey] = null;
    if (slotKey === 'mb') this.mbMountLocation = null;
    if (slotKey === 'cpu') this.thermalPasteApplied = false;

    // Disconnect cables attached to removed component
    for (const def of CABLE_DEFINITIONS) {
      if (def.from === slotKey || def.to === slotKey) {
        if (this.cables[def.id]?.connected) {
          this.cables[def.id] = { id: def.id, connected: false, connectedAt: null };
        }
      }
    }

    if (this.selectedSlot === slotKey) {
      this.selectedSlot = null;
    }

    if (!options.silent) {
      this.emit('slot:removed', { slot: slotKey });
    }
    return { ok: true };
  }

  connectCable(cableId) {
    const def = CABLE_DEFINITIONS.find((c) => c.id === cableId);
    if (!def) return { ok: false, reason: 'Unknown cable.' };

    if (!this.sidePanelOpen) {
      return { ok: false, reason: 'Open the PC Case side panel to route cables inside.' };
    }

    // Both endpoint components must be physically inside the case (placed or installed)
    const fromEntry = this.slots[def.from];
    const toEntry = this.slots[def.to];

    if (!fromEntry || fromEntry.status === COMPONENT_STATE.STAGED) {
      return { ok: false, reason: `Install ${SLOT_DISPLAY_NAMES[def.from] || def.from} before connecting ${def.name}.` };
    }
    if (!toEntry || toEntry.status === COMPONENT_STATE.STAGED) {
      return { ok: false, reason: `Install ${SLOT_DISPLAY_NAMES[def.to] || def.to} before connecting ${def.name}.` };
    }
    if (def.to === 'mb' && this.mbMountLocation !== 'case') {
      return { ok: false, reason: `Mount the Motherboard inside the PC Case before connecting ${def.name}.` };
    }

    this.cables[cableId] = {
      id: cableId,
      connected: true,
      connectedAt: new Date().toISOString(),
    };
    this.emit('cable:updated', { cableId, connected: true });
    return { ok: true, def };
  }

  disconnectCable(cableId) {
    if (!this.cables[cableId]) return { ok: false, reason: 'Unknown cable.' };
    this.cables[cableId] = {
      id: cableId,
      connected: false,
      connectedAt: null,
    };
    this.emit('cable:updated', { cableId, connected: false });
    return { ok: true };
  }

  _snappingContext(component = null) {
    const installedSlots = {};
    for (const key of HARDWARE_SLOTS) {
      const entry = this.slots[key];
      if (entry && entry.status !== COMPONENT_STATE.STAGED) {
        installedSlots[key] = entry;
      }
    }
    return {
      mbMountLocation: this.mbMountLocation,
      sidePanelOpen: this.sidePanelOpen,
      installedSlots,
      component,
      caseComponent: this.slots.case?.component || null,
      storageKind: component ? detectStorageKind(component) : 'm2_nvme',
    };
  }

  _syncMotherboardChildren() {
    if (!this.mbMountLocation) return;
    for (const childKey of ['cpu', 'cooler', 'ram', 'storage']) {
      const entry = this.slots[childKey];
      if (!entry || entry.status === COMPONENT_STATE.STAGED) continue;
      if (childKey === 'storage' && detectStorageKind(entry.component) !== 'm2_nvme') continue;

      const anchors = this.snapping.getTargetAnchors(childKey, this._snappingContext(entry.component));
      if (anchors.length > 0) {
        entry.position = { ...anchors[0].position };
        entry.mountLocation = anchors[0].mountLocation;
        this.emit('slot:updated', { slot: childKey, entry });
      }
    }
  }

  getState() {
    return {
      sequenceId: this.sequenceId,
      sidePanelOpen: this.sidePanelOpen,
      mbMountLocation: this.mbMountLocation,
      thermalPasteApplied: this.thermalPasteApplied,
      isPowered: this.isPowered,
      selectedSlot: this.selectedSlot,
      slots: { ...this.slots },
      cables: { ...this.cables },
    };
  }
}
