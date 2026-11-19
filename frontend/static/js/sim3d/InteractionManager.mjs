/**
 * InteractionManager.mjs
 * Handles 3D raycast hover/selection, drag-to-move across ESD desk and inside PC case,
 * rotation (R key / button), inspection camera focus, and safe removal.
 * Disables OrbitControls cleanly whenever dragging a component so camera controls
 * never fight hardware manipulation.
 */

import * as THREE from 'three';
import { COMPONENT_STATE } from './AssemblyManager.mjs';
import { CASE_MB_ANCHOR, CASE_SUB_ANCHORS, STAGING_ANCHORS } from './PlacementSnappingSystem.mjs';
import { detectStorageKind } from './SimulationDataManager.mjs';

export class InteractionManager {
  constructor(sceneManager, componentManager, assemblyManager, callbacks = {}) {
    this.sceneMgr = sceneManager;
    this.compMgr = componentManager;
    this.asm = assemblyManager;
    this.callbacks = callbacks;

    this.readOnly = false;
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.lastHoverCheckMs = 0;

    // Pre-allocated drag planes & scratch vectors
    this.deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.04);
    this.casePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.56);
    this._hitPt = new THREE.Vector3();

    this.dragState = null; // { slotKey, currentPos, rotationStep }
    this.externalDrag = null; // { slotKey, comp, lastEval, currentPos }
    this.downInfo = null;

    this._bindEvents();
  }

  setReadOnly(ro) {
    this.readOnly = Boolean(ro);
    if (this.readOnly && this.dragState) {
      this._cancelDrag();
    }
  }

  _bindEvents() {
    const dom = this.sceneMgr.renderer.domElement;
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onKeyDown = (e) => this._handleKeyDown(e);

    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _updatePointerNdc(event) {
    this._setNdcFromClient(event.clientX, event.clientY);
  }

  _setNdcFromClient(clientX, clientY) {
    const rect = this.sceneMgr.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.pointerNdc.x = ((clientX - rect.left) / w) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / h) * 2 + 1;
  }

  _getStagingGroundY(slotKey, comp = null) {
    if (slotKey === 'storage' && comp) {
      const kind = detectStorageKind(comp);
      if (kind === 'sata_35') return 0.14;
      if (kind === 'm2_nvme') return 0.03;
      return 0.05;
    }
    return STAGING_ANCHORS[slotKey]?.y ?? 0.05;
  }

  _getCaseZDepth(slotKey, comp = null) {
    if (slotKey === 'mb') return CASE_MB_ANCHOR.z;
    if (slotKey === 'psu') return CASE_SUB_ANCHORS.psu.z;
    if (slotKey === 'case_fan') return CASE_SUB_ANCHORS.case_fan.z;
    if (slotKey === 'storage' && comp && detectStorageKind(comp) !== 'm2_nvme') {
      return CASE_SUB_ANCHORS.sata_bay.z;
    }
    return CASE_MB_ANCHOR.z + 0.08;
  }

  _projectClientToWorld(clientX, clientY, slotKey, comp = null) {
    this._setNdcFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNdc, this.sceneMgr.camera);

    const benchY = this._getStagingGroundY(slotKey, comp);
    this.deskPlane.constant = -benchY;

    let projected = false;
    if (this.raycaster.ray.intersectPlane(this.deskPlane, this._hitPt)) {
      if (this._hitPt.x >= -0.05) {
        this._hitPt.y = benchY;
        projected = true;
      }
    }
    if (!projected) {
      const zDepth = this._getCaseZDepth(slotKey, comp);
      this.casePlane.constant = -zDepth;
      if (this.raycaster.ray.intersectPlane(this.casePlane, this._hitPt)) {
        this._hitPt.y = Math.max(0.25, Math.min(4.65, this._hitPt.y));
        projected = true;
      }
    }
    if (!projected && this.raycaster.ray.intersectPlane(this.deskPlane, this._hitPt)) {
      this._hitPt.y = benchY;
      projected = true;
    }
    if (!projected) return null;

    return {
      x: Math.max(-5.9, Math.min(8.1, this._hitPt.x)),
      y: this._hitPt.y,
      z: Math.max(-3.35, Math.min(3.35, this._hitPt.z)),
    };
  }

  _pickCablePort(event) {
    if (!this.compMgr.cablePortTargets?.length) return null;
    this._updatePointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.sceneMgr.camera);
    const hits = this.raycaster.intersectObjects(this.compMgr.cablePortTargets, false);
    if (!hits.length) return null;
    const u = hits[0].object?.userData;
    return u?.cablePortKey ? { portKey: u.cablePortKey, label: u.cablePortLabel } : null;
  }

  _pickSlot(event) {
    this._updatePointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.sceneMgr.camera);
    const hits = this.raycaster.intersectObjects(this.compMgr.interactableTargets, true);
    if (!hits.length) return null;

    // Check direct mechanical fastener hotspot click (CPU ILM lever / DIMM latch) when target slot is placed
    const fastHit = hits.find((h) => {
      const targetSlot = h.object?.userData?.fastenerTargetSlot;
      if (!targetSlot) return false;
      const tEntry = this.asm.slots[targetSlot];
      return Boolean(tEntry && tEntry.status !== COMPONENT_STATE.STAGED);
    });
    if (fastHit) {
      return {
        slotKey: fastHit.object.userData.fastenerTargetSlot,
        fastenerSlot: fastHit.object.userData.fastenerTargetSlot,
        hit: fastHit,
      };
    }

    // Prefer picking non-case internal hardware components over the outer case frame
    const hwHit = hits.find((h) => h.object?.userData?.slotKey && h.object.userData.slotKey !== 'case');
    if (hwHit) return { slotKey: hwHit.object.userData.slotKey, hit: hwHit };

    const caseHit = hits.find((h) => h.object?.userData?.slotKey === 'case');
    if (caseHit) return { slotKey: 'case', hit: caseHit };
    return null;
  }

  _handlePointerDown(event) {
    if (event.button !== 0) return;

    // Direct 3D Cable Port click takes precedence when cable ports are active
    if (!this.readOnly) {
      const portHit = this._pickCablePort(event);
      if (portHit) {
        this.downInfo = { slotKey: null, x: event.clientX, y: event.clientY };
        this.callbacks.onCablePortClick?.(portHit.portKey, portHit.label);
        return;
      }
    }

    const picked = this._pickSlot(event);
    if (!picked) {
      this.downInfo = { slotKey: null, x: event.clientX, y: event.clientY };
      return;
    }

    if (!this.readOnly && picked.fastenerSlot) {
      this.downInfo = { slotKey: picked.fastenerSlot, x: event.clientX, y: event.clientY };
      this.selectSlot(picked.fastenerSlot);
      this.callbacks.onFastenerClick?.(picked.fastenerSlot);
      return;
    }

    const { slotKey } = picked;
    this.downInfo = { slotKey, x: event.clientX, y: event.clientY };

    // Always allow selecting/inspecting a component (even in read-only mode)
    this.selectSlot(slotKey);

    if (this.readOnly || slotKey === 'case') return;

    const entry = this.asm.slots[slotKey];
    if (!entry) return;

    // Start dragging if not locked behind another part or fastened with screws
    if (entry.secured) {
      this.callbacks.onFeedback?.(
        `${entry.component?.name || slotKey} is secured. Click "Unfasten" to adjust or remove.`,
        'info'
      );
      return;
    }

    const canRemove = this.asm.canRemoveComponent(slotKey);
    if (!canRemove.allowed) {
      this.callbacks.onFeedback?.(canRemove.reason, 'warn');
      return;
    }

    // Begin physical drag and lock OrbitControls cleanly
    this.sceneMgr.setOrbitEnabled(false);
    this.sceneMgr.renderer.domElement.style.cursor = 'grabbing';

    this.dragState = {
      slotKey,
      currentPos: { ...entry.position },
      rotationStep: entry.rotationStep || 0,
      lastEval: null,
    };
  }

  _handlePointerMove(event) {
    if (this.dragState) {
      const entry = this.asm.slots[this.dragState.slotKey];
      const worldPos = this._projectClientToWorld(
        event.clientX,
        event.clientY,
        this.dragState.slotKey,
        entry?.component
      );
      if (!worldPos) return;

      this.dragState.currentPos = worldPos;
      const ctx = this.asm._snappingContext(entry?.component);
      const evalRes = this.asm.snapping.evaluatePlacement(
        this.dragState.slotKey,
        this.dragState.currentPos,
        this.dragState.rotationStep,
        ctx
      );
      this.dragState.lastEval = evalRes;

      if (evalRes.withinRange && !evalRes.blocked && evalRes.snapPosition) {
        this.compMgr.setLiveDragTransform(this.dragState.slotKey, evalRes.snapPosition, this.dragState.rotationStep);
      } else {
        this.compMgr.setLiveDragTransform(this.dragState.slotKey, this.dragState.currentPos, this.dragState.rotationStep);
      }

      this.compMgr.showSnapGuide(evalRes);
      this.callbacks.onDragStatus?.(this.dragState.slotKey, evalRes);
      return;
    }

    // Throttled hover highlight (~25Hz)
    const now = performance.now();
    if (now - this.lastHoverCheckMs < 40) return;
    this.lastHoverCheckMs = now;

    // Only hover when mouse is actually over canvas
    const targetEl = document.elementFromPoint(event.clientX, event.clientY);
    if (targetEl !== this.sceneMgr.renderer.domElement) {
      this.compMgr.setHover(null);
      return;
    }

    if (!this.readOnly) {
      const portHit = this._pickCablePort(event);
      if (portHit) {
        this.compMgr.setHover(null);
        this.sceneMgr.renderer.domElement.style.cursor = 'pointer';
        this.callbacks.onHoverPort?.(portHit);
        return;
      }
    }

    const picked = this._pickSlot(event);
    const hovered = picked ? picked.slotKey : null;
    this.compMgr.setHover(hovered);
    this.sceneMgr.renderer.domElement.style.cursor =
      picked?.fastenerSlot || hovered === 'case' ? 'pointer' : hovered ? 'grab' : 'default';
    this.callbacks.onHoverChange?.(hovered, picked?.fastenerSlot || null);
  }

  _handlePointerUp(event) {
    if (this.dragState) {
      const { slotKey, currentPos, rotationStep, lastEval } = this.dragState;
      this.dragState = null;
      this.compMgr.hideSnapGuide();
      this.sceneMgr.setOrbitEnabled(true);
      this.sceneMgr.renderer.domElement.style.cursor = 'default';
      this.callbacks.onDragStatus?.(slotKey, null);

      const res = this.asm.placeComponentAt(slotKey, currentPos, rotationStep);
      if (res.blocked) {
        // Restore previous mesh transform & show non-intrusive feedback
        this.compMgr.syncAllMeshes();
        this.callbacks.onFeedback?.(res.reason, 'warn');
      } else if (res.snapped) {
        this.callbacks.onFeedback?.(
          res.aligned
            ? `Aligned at ${res.target?.label || 'mount'} — click Secure / Latch to lock.`
            : res.reason,
          res.aligned ? 'ok' : 'warn'
        );
      } else if (lastEval?.status === 'no_anchor' && currentPos.x < -0.1) {
        this.callbacks.onFeedback?.(lastEval.reason, 'info');
      }
      return;
    }

    if (this.downInfo && !this.downInfo.slotKey) {
      const dist = Math.hypot(event.clientX - this.downInfo.x, event.clientY - this.downInfo.y);
      if (dist < 4 && event.target === this.sceneMgr.renderer.domElement) {
        this.selectSlot(null);
      }
    }
    this.downInfo = null;
  }

  _cancelDrag() {
    if (!this.dragState) return;
    this.dragState = null;
    this.compMgr.hideSnapGuide();
    this.sceneMgr.setOrbitEnabled(true);
    this.sceneMgr.renderer.domElement.style.cursor = 'default';
    this.compMgr.syncAllMeshes();
    this.callbacks.onDragStatus?.(null, null);
  }

  beginExternalDrag(slotKey, comp) {
    if (this.readOnly || !slotKey || !comp) return;
    this.externalDrag = { slotKey, comp, lastEval: null, currentPos: null };
    if (slotKey !== 'case') {
      this.compMgr.startDragGhost(slotKey, comp);
    }
  }

  updateExternalDrag(clientX, clientY) {
    if (this.readOnly || !this.externalDrag) return null;
    const { slotKey, comp } = this.externalDrag;
    if (slotKey === 'case') {
      const fakeEval = { withinRange: true, status: 'aligned', target: { label: 'PC Case Workstation Bay' } };
      this.callbacks.onDragStatus?.('case', fakeEval);
      return fakeEval;
    }
    const worldPos = this._projectClientToWorld(clientX, clientY, slotKey, comp);
    if (!worldPos) return null;
    this.externalDrag.currentPos = worldPos;

    const evalRes = this.asm.snapping.evaluatePlacement(
      slotKey,
      worldPos,
      0,
      this.asm._snappingContext(comp)
    );
    this.externalDrag.lastEval = evalRes;
    this.compMgr.updateDragGhost(worldPos, evalRes);
    this.compMgr.showSnapGuide(evalRes);
    this.callbacks.onDragStatus?.(slotKey, evalRes);
    return evalRes;
  }

  cancelExternalDrag() {
    if (!this.externalDrag) return;
    this.externalDrag = null;
    this.compMgr.clearDragGhost();
    this.compMgr.hideSnapGuide();
    this.callbacks.onDragStatus?.(null, null);
  }

  finishExternalDrag(clientX, clientY, fallbackPayload = null) {
    const active = this.externalDrag || fallbackPayload;
    this.externalDrag = null;
    this.compMgr.clearDragGhost();
    this.compMgr.hideSnapGuide();
    this.callbacks.onDragStatus?.(null, null);

    if (this.readOnly || !active?.slotKey || !active?.comp) {
      return { ok: false, reason: 'Nothing to drop.' };
    }

    const { slotKey, comp } = active;
    if (slotKey === 'case') {
      const res = this.asm.stageComponent('case', comp);
      if (!res.ok) {
        this.callbacks.onFeedback?.(res.reason, 'warn');
        return res;
      }
      this.selectSlot('case');
      this.callbacks.onFeedback?.(`Switched PC Case to ${comp.name}`, 'ok');
      return res;
    }

    const worldPos = this._projectClientToWorld(clientX, clientY, slotKey, comp);
    const stageRes = this.asm.stageComponent(slotKey, comp);
    if (!stageRes.ok) {
      this.callbacks.onFeedback?.(stageRes.reason, 'warn');
      return stageRes;
    }

    if (!worldPos) {
      this.selectSlot(slotKey);
      this.callbacks.onFeedback?.(`${comp.name} placed on ESD Staging Tray.`, 'ok');
      return { ok: true, snapped: false };
    }

    const placeRes = this.asm.placeComponentAt(slotKey, worldPos, 0);
    this.selectSlot(slotKey);

    if (placeRes.blocked) {
      this.callbacks.onFeedback?.(placeRes.reason, 'warn');
      return placeRes;
    }
    if (placeRes.snapped) {
      this.callbacks.onFeedback?.(
        placeRes.aligned
          ? `Aligned at ${placeRes.target?.label || 'mount'} — click Secure / Latch to lock.`
          : placeRes.reason,
        placeRes.aligned ? 'ok' : 'warn'
      );
      return placeRes;
    }

    this.callbacks.onFeedback?.(`${comp.name} dropped on workbench — drag into socket/bay or click Snap.`, 'ok');
    return placeRes;
  }

  _handleKeyDown(event) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = event.key.toLowerCase();
    if (key === 'r') {
      if (this.readOnly) return;
      if (this.dragState) {
        this.dragState.rotationStep = (this.dragState.rotationStep + 1) % 4;
        const entry = this.asm.slots[this.dragState.slotKey];
        const evalRes = this.asm.snapping.evaluatePlacement(
          this.dragState.slotKey,
          this.dragState.currentPos,
          this.dragState.rotationStep,
          this.asm._snappingContext(entry?.component)
        );
        this.dragState.lastEval = evalRes;
        this.compMgr.setLiveDragTransform(
          this.dragState.slotKey,
          evalRes.withinRange && !evalRes.blocked ? evalRes.snapPosition : this.dragState.currentPos,
          this.dragState.rotationStep
        );
        this.compMgr.showSnapGuide(evalRes);
        this.callbacks.onDragStatus?.(this.dragState.slotKey, evalRes);
        return;
      }
      if (this.asm.selectedSlot && this.asm.selectedSlot !== 'case') {
        const res = this.asm.rotateComponent(this.asm.selectedSlot, 1);
        if (!res.ok) this.callbacks.onFeedback?.(res.reason, 'warn');
        else this.callbacks.onSelectChange?.(this.asm.selectedSlot);
      }
    } else if (key === 'f') {
      if (this.asm.selectedSlot) {
        const obj = this.compMgr.getObjectForSlot(this.asm.selectedSlot);
        if (obj) this.sceneMgr.focusOnObject(obj);
      }
    } else if (key === 'escape') {
      if (this.dragState) {
        this._cancelDrag();
      } else if (this.compMgr.pendingCablePort) {
        this.callbacks.onCancelCableMode?.();
      } else {
        this.selectSlot(null);
      }
    } else if ((key === 'delete' || key === 'backspace') && !this.readOnly) {
      if (this.asm.selectedSlot && this.asm.selectedSlot !== 'case') {
        const res = this.asm.removeComponent(this.asm.selectedSlot);
        if (!res.ok) this.callbacks.onFeedback?.(res.reason, 'warn');
        else this.selectSlot(null);
      }
    }
  }

  selectSlot(slotKey) {
    this.asm.selectedSlot = slotKey;
    this.compMgr.setSelection(slotKey);
    this.callbacks.onSelectChange?.(slotKey);
  }

  dispose() {
    const dom = this.sceneMgr.renderer.domElement;
    dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
