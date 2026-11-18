/**
 * InteractionManager.mjs
 * Handles 3D raycast hover/selection, drag-to-move across ESD desk and inside PC case,
 * rotation (R key / button), inspection camera focus, and safe removal.
 * Disables OrbitControls cleanly whenever dragging a component so camera controls
 * never fight hardware manipulation.
 */

import * as THREE from 'three';
import { COMPONENT_STATE } from './AssemblyManager.mjs';

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
    this.deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14);
    this.casePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.45);
    this._hitPt = new THREE.Vector3();

    this.dragState = null; // { slotKey, currentPos, rotationStep, pointerId }
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
    const rect = this.sceneMgr.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
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
      this._updatePointerNdc(event);
      this.raycaster.setFromCamera(this.pointerNdc, this.sceneMgr.camera);

      // Dual-plane ergonomic projection:
      // Left side (x < 0.85) maps vertically inside the Case Z-plane;
      // Right side maps horizontally onto ESD Workbench Prep/Staging plane!
      let projected = false;
      if (this.raycaster.ray.intersectPlane(this.deskPlane, this._hitPt)) {
        if (this._hitPt.x >= 0.75) {
          this._hitPt.y = Math.max(0.08, this.dragState.currentPos.y > 0.8 ? 0.16 : this.dragState.currentPos.y);
          projected = true;
        }
      }
      if (!projected) {
        const zDepth = this.dragState.slotKey === 'mb' ? -0.68 : -0.42;
        this.casePlane.constant = -zDepth;
        if (this.raycaster.ray.intersectPlane(this.casePlane, this._hitPt)) {
          this._hitPt.y = Math.max(0.25, Math.min(4.65, this._hitPt.y));
          projected = true;
        }
      }

      if (!projected) return;

      this.dragState.currentPos = {
        x: Math.max(-4.5, Math.min(5.2, this._hitPt.x)),
        y: this._hitPt.y,
        z: Math.max(-2.8, Math.min(2.8, this._hitPt.z)),
      };

      const entry = this.asm.slots[this.dragState.slotKey];
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
      } else if (lastEval?.status === 'no_anchor' && currentPos.x < 0.6) {
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
