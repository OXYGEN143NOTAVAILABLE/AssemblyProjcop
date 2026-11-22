/**
 * ComponentManager.mjs
 * Synchronizes 3D Three.js component meshes, side panel visibility, thermal paste visual,
 * alignment snap rings, and routed 3D cables with AssemblyManager state.
 */

import * as THREE from 'three';
import { CABLE_DEFINITIONS, SIM_SCALE_MM_TO_UNITS, detectStorageKind } from './SimulationDataManager.mjs';
import { COMPONENT_STATE } from './AssemblyManager.mjs';
import {
  CASE_ORIGIN,
  CASE_MB_ANCHOR,
  CASE_SUB_ANCHORS,
  BENCH_PREP_ORIGIN,
  MB_LOCAL_SOCKETS,
  rotatePointX,
} from './PlacementSnappingSystem.mjs';
import {
  computePortWorldCoords,
  computeCableWaypoints,
  getPsuWorldCenter,
  getStorageMountY,
} from './CableRoutingSystem.mjs';
import { createComponentMesh, createCableMesh, tryAttachExternalGltf } from './ProceduralHardwareFactory.mjs';

export class ComponentManager {
  constructor(sceneManager, assemblyManager) {
    this.sceneMgr = sceneManager;
    this.asm = assemblyManager;

    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'HardwareRoot';
    this.sceneMgr.scene.add(this.rootGroup);

    this.cablesGroup = new THREE.Group();
    this.cablesGroup.name = 'CablesRoot';
    this.sceneMgr.scene.add(this.cablesGroup);

    this.cablePortsGroup = new THREE.Group();
    this.cablePortsGroup.name = 'CablePortsRoot';
    this.sceneMgr.scene.add(this.cablePortsGroup);

    this.meshesBySlot = new Map(); // slotKey -> { group, componentId }
    this.interactableTargets = []; // flattened groups/meshes with userData.slotKey
    this.cablePortTargets = []; // clickable 3D port hotspots with userData.cablePortKey
    this.allFanRotors = [];
    this.showCablePorts = true;
    this.pendingCablePort = null;

    // Thermal paste visual dot
    this.pasteDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.35 })
    );
    this.pasteDot.scale.set(1, 1, 0.35);
    this.pasteDot.visible = false;
    this.sceneMgr.scene.add(this.pasteDot);

    // Alignment snap ring feedback mesh (shown only during active drag near target)
    this.snapGuide = this._createSnapGuide();
    this.snapGuide.visible = false;
    this.sceneMgr.scene.add(this.snapGuide);

    // Live translucent/solid preview mesh when dragging a component from sidebar
    this.dragGhost = null;

    // Highlight state tracking
    this.selectedSlot = null;
    this.hoveredSlot = null;

    this._bindAssemblyEvents();
  }

  _createSnapGuide() {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3ecf5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 32), ringMat);
    const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.04), ringMat);
    const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.45), ringMat);
    g.add(ring, crossH, crossV);
    g.userData.mat = ringMat;
    g.renderOrder = 50;
    return g;
  }

  _bindAssemblyEvents() {
    this.asm.subscribe((event) => {
      if (event === 'state:reset' || event === 'slot:updated' || event === 'slot:removed') {
        this.syncAllMeshes();
        this.syncCables();
        this.syncCablePorts();
        this.syncFasteners();
        this.syncPasteDot();
      } else if (event === 'case:panel') {
        this.syncSidePanel();
        this.syncCablePorts();
      } else if (event === 'cpu:paste') {
        this.syncPasteDot();
      } else if (event === 'cable:updated') {
        this.syncCables();
        this.syncCablePorts();
      }
      this.sceneMgr.requestRender(300);
    });
  }

  syncAllMeshes() {
    const activeSlots = new Set();
    for (const [slotKey, entry] of Object.entries(this.asm.slots)) {
      if (!entry || !entry.component) continue;
      activeSlots.add(slotKey);

      const existing = this.meshesBySlot.get(slotKey);
      const compId = String(entry.component.id);
      if (!existing || existing.componentId !== compId) {
        if (existing) {
          this.rootGroup.remove(existing.group);
          this._disposeGroup(existing.group);
        }
        const group = createComponentMesh(slotKey, entry.component);
        this._tagSlotRecursive(group, slotKey);
        this.rootGroup.add(group);
        this.meshesBySlot.set(slotKey, { group, componentId: compId });

        if (entry.component.gltfUrl) {
          tryAttachExternalGltf(group, entry.component.gltfUrl, entry.component.dimensionsMm).then((ok) => {
            if (ok && this.meshesBySlot.get(slotKey)?.group === group) {
              this._tagSlotRecursive(group, slotKey);
              this.sceneMgr.requestRender(200);
            }
          });
        }
      }

      this._applyTransform(slotKey, entry);
    }

    // Remove meshes whose slots are now empty
    for (const [slotKey, rec] of this.meshesBySlot.entries()) {
      if (!activeSlots.has(slotKey)) {
        this.rootGroup.remove(rec.group);
        this._disposeGroup(rec.group);
        this.meshesBySlot.delete(slotKey);
      }
    }

    this._rebuildInteractablesAndRotors();
    this.syncSidePanel();
    this.syncFasteners();
    this.syncCablePorts();
    this.applyHighlightVisuals();
  }

  _tagSlotRecursive(obj, slotKey) {
    obj.userData.slotKey = slotKey;
    obj.traverse((child) => {
      child.userData.slotKey = slotKey;
      if (child.isMesh && child.material && !child.material.userData?._clonedForHighlight) {
        child.material = child.material.clone();
        child.material.userData._clonedForHighlight = true;
        child.material.userData.baseEmissiveHex = child.material.emissive
          ? child.material.emissive.getHex()
          : 0x000000;
        child.material.userData.baseEmissiveIntensity = child.material.emissiveIntensity ?? 1;
      }
    });
  }

  _applyTransform(slotKey, entry) {
    const rec = this.meshesBySlot.get(slotKey);
    if (!rec) return;
    const g = rec.group;

    g.position.set(entry.position.x, entry.position.y, entry.position.z);

    if (slotKey === 'storage') {
      const sKind = detectStorageKind(entry.component);
      if (entry.mountLocation === 'case_drive_bay') {
        g.position.y = getStorageMountY(entry.component);
      } else if (entry.mountLocation === 'staging' && sKind === 'sata_35') {
        g.position.y = Math.max(0.14, entry.position.y);
      } else if (entry.mountLocation === 'staging' && sKind === 'm2_nvme') {
        g.position.y = Math.max(0.03, entry.position.y);
      }
    } else if (slotKey === 'psu' && entry.mountLocation === 'case_psu_bay') {
      // Align rear AC faceplate flush with rear case cutout regardless of 140mm vs 160mm PSU depth
      const psuPos = getPsuWorldCenter(entry.component, this.asm.slots.case?.component);
      g.position.x = psuPos.x;
    } else if (slotKey === 'gpu' && entry.mountLocation === 'staging') {
      // Rest downward-hanging GPU fan shroud flush on ESD mat surface (Y = 0)
      const thickY = (entry.component?.dimensionsMm?.d || 42) * SIM_SCALE_MM_TO_UNITS;
      g.position.y = Math.max(0.34, thickY - 0.025);
    }

    // Base orientation matches mount location (bench prep pad vs vertical case standoffs vs staging)
    const baseEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    if (slotKey === 'mb' && (entry.mountLocation === 'bench' || entry.mountLocation === 'staging')) {
      baseEuler.set(-Math.PI / 2, 0, 0);
    } else if (
      ['cpu', 'cooler', 'ram'].includes(slotKey) ||
      (slotKey === 'storage' && detectStorageKind(entry.component) === 'm2_nvme')
    ) {
      if (entry.mountLocation === 'staging' || entry.mountLocation === 'mb_on_bench') {
        baseEuler.set(-Math.PI / 2, 0, 0);
      }
    } else if (slotKey === 'case_fan') {
      baseEuler.set(0, entry.mountLocation === 'staging' ? 0 : Math.PI / 2, 0);
    }

    const q = new THREE.Quaternion().setFromEuler(baseEuler);
    const rotAngle = (entry.rotationStep || 0) * (Math.PI / 2);

    if (rotAngle !== 0) {
      const spinQ = new THREE.Quaternion();
      if (slotKey === 'psu') {
        // PSU rotation flips Fan Down (-Y) vs Side vs Fan Up (+Y)
        spinQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotAngle);
      } else if (slotKey === 'case_fan' || (slotKey === 'storage' && detectStorageKind(entry.component) !== 'm2_nvme')) {
        spinQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotAngle);
      } else {
        // PCB/Socket parts spin around their local normal (+Z)
        spinQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotAngle);
      }
      q.multiply(spinQ);
    }

    g.quaternion.copy(q);
  }

  syncSidePanel() {
    const caseRec = this.meshesBySlot.get('case');
    if (!caseRec) return;
    const panel = caseRec.group.userData.sidePanel;
    const closedPos = caseRec.group.userData.closedPanelPos;
    if (!panel || !closedPos) return;

    if (this.asm.sidePanelOpen) {
      // Visually set the glass panel cleanly aside/hidden so interior assembly is unobstructed
      panel.visible = false;
    } else {
      panel.visible = true;
      panel.position.copy(closedPos);
    }
  }

  syncPasteDot() {
    const cpuEntry = this.asm.slots.cpu;
    if (!this.asm.thermalPasteApplied || !cpuEntry || cpuEntry.status === COMPONENT_STATE.STAGED) {
      this.pasteDot.visible = false;
      return;
    }
    this.pasteDot.visible = true;
    const isBench = cpuEntry.mountLocation === 'mb_on_bench';
    if (isBench) {
      this.pasteDot.position.set(cpuEntry.position.x, cpuEntry.position.y + 0.052, cpuEntry.position.z);
      this.pasteDot.rotation.set(-Math.PI / 2, 0, 0);
    } else {
      this.pasteDot.position.set(cpuEntry.position.x, cpuEntry.position.y, cpuEntry.position.z + 0.052);
      this.pasteDot.rotation.set(0, 0, 0);
    }
  }

  _getRoutingContext() {
    return {
      mbMountLocation: this.asm.mbMountLocation || 'case',
      mbComp: this.asm.slots.mb?.component || null,
      coolerComp: this.asm.slots.cooler?.component || null,
      gpuComp: this.asm.slots.gpu?.component || null,
      psuComp: this.asm.slots.psu?.component || null,
      storageComp: this.asm.slots.storage?.component || null,
      caseComp: this.asm.slots.case?.component || null,
    };
  }

  _getPortWorldCoords() {
    return computePortWorldCoords(this._getRoutingContext());
  }

  syncFasteners() {
    const mbRec = this.meshesBySlot.get('mb');
    const mbEntry = this.asm.slots.mb;
    if (mbRec) {
      const cpuEntry = this.asm.slots.cpu;
      const ramEntry = this.asm.slots.ram;
      const lever = mbRec.group.userData.cpuLeverPivot;
      if (lever) {
        const cpuSecured = Boolean(cpuEntry && cpuEntry.status !== COMPONENT_STATE.STAGED && cpuEntry.secured);
        lever.rotation.x = cpuSecured ? 0 : -0.78;
      }
      const dimmLatches = mbRec.group.userData.dimmLatches;
      if (Array.isArray(dimmLatches)) {
        const ramSecured = Boolean(ramEntry && ramEntry.status !== COMPONENT_STATE.STAGED && ramEntry.secured);
        for (const clip of dimmLatches) {
          clip.rotation.x = ramSecured ? 0 : -0.58;
        }
      }
      const mbScrews = mbRec.group.userData.fastenerScrews;
      if (Array.isArray(mbScrews)) {
        const showMbScrews = Boolean(mbEntry?.secured && this.asm.mbMountLocation === 'case');
        mbScrews.forEach((s) => { s.visible = showMbScrews; });
      }
    }

    for (const slotKey of ['gpu', 'psu']) {
      const rec = this.meshesBySlot.get(slotKey);
      const entry = this.asm.slots[slotKey];
      const screws = rec?.group?.userData?.fastenerScrews;
      if (Array.isArray(screws)) {
        const vis = Boolean(entry && entry.status !== COMPONENT_STATE.STAGED && entry.secured);
        screws.forEach((s) => { s.visible = vis; });
      }
    }
  }

  setShowCablePorts(show) {
    this.showCablePorts = Boolean(show);
    this.syncCablePorts();
    this.sceneMgr.requestRender(150);
  }

  setPendingCablePort(portKey) {
    this.pendingCablePort = portKey || null;
    this.syncCablePorts();
    this.sceneMgr.requestRender(150);
  }

  syncCablePorts() {
    while (this.cablePortsGroup.children.length > 0) {
      const child = this.cablePortsGroup.children.pop();
      this._disposeGroup(child);
    }
    this.cablePortTargets = [];

    if (!this.showCablePorts || !this.asm.sidePanelOpen || this.asm.mbMountLocation !== 'case') {
      return;
    }

    const coords = this._getPortWorldCoords();
    const installed = (slot) => Boolean(this.asm.slots[slot] && this.asm.slots[slot].status !== COMPONENT_STATE.STAGED);
    const storageKind = this.asm.slots.storage?.component
      ? detectStorageKind(this.asm.slots.storage.component)
      : null;
    const activePorts = new Map();

    // Determine valid endpoint ports for currently installed components
    for (const def of CABLE_DEFINITIONS) {
      if (!installed(def.from) || !installed(def.to)) continue;
      if ((def.from === 'storage' || def.to === 'storage') && storageKind === 'm2_nvme') continue;
      const isConn = Boolean(this.asm.cables[def.id]?.connected);

      const addPort = (portKey, partnerKey, label) => {
        if (!coords[portKey]) return;
        const prev = activePorts.get(portKey) || { portKey, label, connectedCount: 0, totalCount: 0, partners: new Set() };
        prev.totalCount += 1;
        if (isConn) prev.connectedCount += 1;
        prev.partners.add(partnerKey);
        activePorts.set(portKey, prev);
      };

      addPort(def.fromPortKey, def.toPortKey, def.from.toUpperCase());
      addPort(def.toPortKey, def.fromPortKey, def.portLabel);
    }

    const pendingInfo = this.pendingCablePort ? activePorts.get(this.pendingCablePort) : null;

    for (const [portKey, info] of activePorts.entries()) {
      const pt = coords[portKey];
      const isSelected = portKey === this.pendingCablePort;
      const isValidMatch = Boolean(pendingInfo && pendingInfo.partners.has(portKey));
      const allConnected = info.connectedCount === info.totalCount && info.totalCount > 0;

      const colorHex = isSelected
        ? 0xfacc15
        : isValidMatch
          ? 0xf59e0b
          : allConnected
            ? 0x22c55e
            : 0x38bdf8;

      const holder = new THREE.Group();
      const offsetX = portKey.startsWith('psu_') ? 0.08 : 0;
      const offsetZ = portKey.startsWith('psu_') ? 0 : portKey === 'sata_drive' ? -0.08 : 0.08;
      holder.position.set(pt.x + offsetX, pt.y, pt.z + offsetZ);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(isSelected || isValidMatch ? 0.095 : 0.072, 12, 10),
        new THREE.MeshBasicMaterial({ color: colorHex })
      );
      sphere.userData.cablePortKey = portKey;
      sphere.userData.cablePortLabel = info.label;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.09, 0.135, 18),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      ring.userData.cablePortKey = portKey;
      ring.userData.cablePortLabel = info.label;

      holder.add(sphere, ring);
      this.cablePortsGroup.add(holder);
      this.cablePortTargets.push(sphere, ring);
    }
  }

  syncCables() {
    while (this.cablesGroup.children.length > 0) {
      const child = this.cablesGroup.children.pop();
      this._disposeGroup(child);
    }

    if (this.asm.mbMountLocation !== 'case') return;
    const routingCtx = this._getRoutingContext();

    for (const def of CABLE_DEFINITIONS) {
      if (!this.asm.cables[def.id]?.connected) continue;
      const waypoints = computeCableWaypoints(def, routingCtx);
      if (!waypoints || waypoints.length < 2) continue;
      this.cablesGroup.add(createCableMesh(def, waypoints[0], waypoints[waypoints.length - 1], waypoints));
    }
  }

  _rebuildInteractablesAndRotors() {
    this.interactableTargets = [];
    this.allFanRotors = [];
    for (const [slotKey, rec] of this.meshesBySlot.entries()) {
      // Allow clicking case or any hardware part cleanly
      this.interactableTargets.push(rec.group);
      if (Array.isArray(rec.group.userData.fanRotors)) {
        for (const r of rec.group.userData.fanRotors) {
          this.allFanRotors.push(r);
        }
      }
      void slotKey;
    }
  }

  setSelection(slotKey) {
    this.selectedSlot = slotKey;
    this.applyHighlightVisuals();
    this.sceneMgr.requestRender(120);
  }

  setHover(slotKey) {
    if (this.hoveredSlot === slotKey) return;
    this.hoveredSlot = slotKey;
    this.applyHighlightVisuals();
    this.sceneMgr.requestRender(120);
  }

  applyHighlightVisuals() {
    for (const [slotKey, rec] of this.meshesBySlot.entries()) {
      const entry = this.asm.slots[slotKey];
      const isSelected = slotKey === this.selectedSlot;
      const isHovered = slotKey === this.hoveredSlot;
      const isBad = entry?.status === COMPONENT_STATE.INSTALLED_INCORRECT;

      rec.group.traverse((child) => {
        if (!child.isMesh || !child.material || !child.material.emissive) return;
        const m = child.material;
        // Skip tempered glass & glowing indicators
        if (m.transparent) return;
        if (isBad && slotKey !== 'case') {
          m.emissive.setHex(0xdc2626);
          m.emissiveIntensity = isSelected ? 0.35 : 0.22;
        } else if (isSelected && slotKey !== 'case') {
          m.emissive.setHex(0x22c55e);
          m.emissiveIntensity = 0.28;
        } else if (isHovered && slotKey !== 'case') {
          m.emissive.setHex(0x38bdf8);
          m.emissiveIntensity = 0.18;
        } else {
          m.emissive.setHex(m.userData.baseEmissiveHex ?? 0x000000);
          m.emissiveIntensity = m.userData.baseEmissiveIntensity ?? 1;
        }
      });
    }
  }

  showSnapGuide(evalResult) {
    if (!evalResult || !evalResult.withinRange || !evalResult.target) {
      this.snapGuide.visible = false;
      this.sceneMgr.requestRender(80);
      return;
    }
    this.snapGuide.visible = true;
    const p = evalResult.target.position;
    const isBench = Boolean(evalResult.target.baseEuler && Math.abs(evalResult.target.baseEuler.x) > 0.5);
    this.snapGuide.position.set(p.x, isBench ? p.y + 0.06 : p.y, isBench ? p.z : p.z + 0.08);
    if (evalResult.target.baseEuler) {
      this.snapGuide.rotation.set(
        evalResult.target.baseEuler.x,
        evalResult.target.baseEuler.y,
        evalResult.target.baseEuler.z
      );
    } else {
      this.snapGuide.rotation.set(0, 0, 0);
    }
    const color =
      evalResult.status === 'aligned'
        ? 0x3ecf5e
        : evalResult.status === 'misaligned'
          ? 0xf59e0b
          : 0xef4444;
    this.snapGuide.userData.mat.color.setHex(color);
    this.sceneMgr.requestRender(100);
  }

  hideSnapGuide() {
    if (this.snapGuide.visible) {
      this.snapGuide.visible = false;
      this.sceneMgr.requestRender(80);
    }
  }

  getObjectForSlot(slotKey) {
    return this.meshesBySlot.get(slotKey)?.group || null;
  }

  /**
   * Moves an object smoothly during live pointer drag before committing drop.
   */
  setLiveDragTransform(slotKey, worldPos, rotationStep) {
    const rec = this.meshesBySlot.get(slotKey);
    if (!rec) return;
    const fakeEntry = {
      ...(this.asm.slots[slotKey] || {}),
      position: worldPos,
      rotationStep,
      mountLocation: worldPos.x < -0.05 ? 'case' : 'staging',
    };
    this._applyTransform(slotKey, fakeEntry);
    this.sceneMgr.requestRender(120);
  }

  startDragGhost(slotKey, comp) {
    this.clearDragGhost();
    if (!slotKey || !comp || slotKey === 'case') return;
    const group = createComponentMesh(slotKey, comp);
    group.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.78;
      }
    });
    group.visible = false;
    this.sceneMgr.scene.add(group);
    this.dragGhost = { slotKey, comp, group };
  }

  updateDragGhost(worldPos, evalResult) {
    if (!this.dragGhost) return;
    const { slotKey, comp, group } = this.dragGhost;
    const snapTarget = evalResult?.withinRange && !evalResult?.blocked ? evalResult.target : null;
    const pos = snapTarget?.position || worldPos;
    if (!pos) return;
    group.visible = true;
    group.position.set(pos.x, pos.y, pos.z);

    if (snapTarget?.baseEuler) {
      group.rotation.set(snapTarget.baseEuler.x, snapTarget.baseEuler.y, snapTarget.baseEuler.z);
    } else if (
      slotKey === 'mb' ||
      ['cpu', 'cooler', 'ram'].includes(slotKey) ||
      (slotKey === 'storage' && detectStorageKind(comp) === 'm2_nvme')
    ) {
      group.rotation.set(pos.x < -0.05 ? 0 : -Math.PI / 2, 0, 0);
    } else if (slotKey === 'case_fan') {
      group.rotation.set(0, pos.x < -0.05 ? Math.PI / 2 : 0, 0);
    } else {
      group.rotation.set(0, 0, 0);
    }
    this.sceneMgr.requestRender(120);
  }

  clearDragGhost() {
    if (!this.dragGhost) return;
    this.sceneMgr.scene.remove(this.dragGhost.group);
    this._disposeGroup(this.dragGhost.group);
    this.dragGhost = null;
    this.sceneMgr.requestRender(80);
  }

  spinFans(dt) {
    if (!this.asm.isPowered || !this.allFanRotors.length) return false;
    for (const rotor of this.allFanRotors) {
      rotor.rotation.z += dt * 11.5;
    }
    return true;
  }

  _disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.bumpMap) m.bumpMap.dispose();
            if (m.roughnessMap) m.roughnessMap.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          if (obj.material.bumpMap) obj.material.bumpMap.dispose();
          if (obj.material.roughnessMap) obj.material.roughnessMap.dispose();
          obj.material.dispose();
        }
      }
    });
  }
}
