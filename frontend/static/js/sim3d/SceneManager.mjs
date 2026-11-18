/**
 * SceneManager.mjs
 * Manages the Three.js WebGL workstation, lighting, PMREM RoomEnvironment,
 * OrbitControls, smooth damped camera presets, focus-on-component, and
 * software-WebGL-safe on-demand render loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CASE_ORIGIN, BENCH_PREP_ORIGIN } from './PlacementSnappingSystem.mjs';

export const CAMERA_PRESETS = Object.freeze({
  default: {
    label: 'Workstation',
    pos: { x: 1.55, y: 5.45, z: 12.4 },
    target: { x: 0.25, y: 1.85, z: 0.0 },
  },
  interior: {
    label: 'Case Interior',
    pos: { x: -1.15, y: 2.65, z: 6.45 },
    target: { x: -1.65, y: 2.15, z: -0.15 },
  },
  bench: {
    label: 'Bench Prep Pad',
    pos: { x: 2.35, y: 3.35, z: 3.15 },
    target: { x: BENCH_PREP_ORIGIN.x, y: 0.12, z: BENCH_PREP_ORIGIN.z },
  },
  psu: {
    label: 'PSU & Drives',
    pos: { x: -0.95, y: 1.45, z: 4.35 },
    target: { x: CASE_ORIGIN.x, y: 0.55, z: 0.0 },
  },
  rear: {
    label: 'Rear I/O & Exhaust',
    pos: { x: -6.1, y: 2.85, z: 3.1 },
    target: { x: -2.25, y: 2.25, z: -0.1 },
  },
});

function detectSoftwareGl(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return /SwiftShader|llvmpipe|Software|WARP/i.test(String(raw || ''));
  } catch {
    return false;
  }
}

export class SceneManager {
  constructor(mountElement) {
    this.mount = mountElement;
    this.disposed = false;
    this.rafId = null;
    this.paceTimeout = null;
    this.renderPending = false;
    this.needsContinuousUntil = 0;

    // Camera transition state
    this.cameraGoalPos = null;
    this.cameraGoalTarget = null;
    this.lastTimeMs = performance.now();

    // Pre-allocated scratch objects (zero per-frame allocations)
    this._box = new THREE.Box3();
    this._size = new THREE.Vector3();
    this._center = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._buildWorkstationEnvironment();
    this._initCameraAndControls();
    this._bindResize();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.requestRender(450);
  }

  _initRenderer() {
    const width = Math.max(320, this.mount.clientWidth || 960);
    const height = Math.max(240, this.mount.clientHeight || 640);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Reliable screenshot verification
    });

    this.isSoftwareGl = detectSoftwareGl(this.renderer);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    if (!this.isSoftwareGl) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.mount.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    const bgHex = 0x101826;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.022);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = this.pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();
  }

  _initLights() {
    const hemi = new THREE.HemisphereLight(0xcbe2ff, 0x263244, 0.95);
    hemi.position.set(0, 10, 0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(5.5, 9.5, 7.0);
    if (!this.isSoftwareGl) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1.0;
      key.shadow.camera.far = 26;
      key.shadow.camera.left = -6.5;
      key.shadow.camera.right = 6.5;
      key.shadow.camera.top = 6.5;
      key.shadow.camera.bottom = -4.5;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.015;
    }
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x88b8ff, 0.85);
    rim.position.set(-6.0, 6.0, -5.5);
    this.scene.add(rim);

    // Focused overhead lab lamp light illuminating interior chassis
    const lampSpot = new THREE.PointLight(0xfff7e8, 5.0, 14, 1.8);
    lampSpot.position.set(-1.1, 5.4, 1.8);
    this.scene.add(lampSpot);
  }

  _makeWorkbenchTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#332920';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 4) {
      const shade = 44 + Math.sin(y * 0.08) * 6 + ((y % 12 === 0) ? 4 : 0);
      ctx.fillStyle = `rgb(${shade + 10}, ${shade}, ${shade - 8})`;
      ctx.fillRect(0, y, 512, 3);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  _makeEsdMatTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#182232';
    ctx.fillRect(0, 0, 1024, 512);

    // Subtle millimeter grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    // Case Footprint Outline (left half)
    ctx.strokeStyle = 'rgba(62, 207, 94, 0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(110, 128, 360, 230);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(62, 207, 94, 0.72)';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('CHASSIS BAY (GROUNDED)', 125, 118);

    // Bench Motherboard Prep Pad Outline (right-middle)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(560, 120, 240, 260);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.fillText('MOTHERBOARD ESD PREP PAD', 560, 108);

    // Staging Parts Strip (far right & front)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(830, 60, 160, 390);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.75)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('STAGING TRAY', 852, 48);

    // Top branding corner
    ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('ESD-SAFE ASSEMBLY WORKBENCH · SCALE 1:1', 28, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  _buildWorkstationEnvironment() {
    this.envGroup = new THREE.Group();
    this.envGroup.name = 'WorkstationEnvironment';

    // Studio floor below desk
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f1623,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(45, 45), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.4;
    this.envGroup.add(floor);

    // Wooden laminate workbench top (top surface strictly at y = 0)
    const woodTex = this._makeWorkbenchTexture();
    const deskMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTex,
      roughness: 0.72,
      metalness: 0.06,
    });
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.28, 7.6), deskMat);
    deskTop.position.set(0.35, -0.145, 0);
    deskTop.receiveShadow = !this.isSoftwareGl;
    this.envGroup.add(deskTop);

    // Steel workbench frame rails & legs
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.78,
    });
    const legGeo = new THREE.BoxGeometry(0.22, 3.12, 0.22);
    for (const [lx, lz] of [[-5.7, -3.3], [6.4, -3.3], [-5.7, 3.3], [6.4, 3.3]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -1.84, lz);
      this.envGroup.add(leg);
    }

    // Dark Anti-Static ESD Mat resting cleanly atop desk (top face at y = 0.002)
    const matTex = this._makeEsdMatTexture();
    const esdMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: matTex,
      roughness: 0.85,
      metalness: 0.04,
    });
    const esdPad = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.02, 5.8), esdMat);
    esdPad.position.set(0.35, -0.01, 0);
    esdPad.receiveShadow = !this.isSoftwareGl;
    this.envGroup.add(esdPad);

    // ESD Grounding Snap & Coiled Wire on front-left corner of mat
    const snapMat = new THREE.MeshStandardMaterial({ color: 0xd4a84f, metalness: 0.85, roughness: 0.25 });
    const snapDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16), snapMat);
    snapDisc.position.set(-4.65, 0.012, 2.45);
    this.envGroup.add(snapDisc);

    // Articulated Overhead LED Bench Lamp (vertical silhouette landmark on rear-left)
    const lampGroup = new THREE.Group();
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.9, 12), legMat);
    lampPost.position.set(-5.3, 2.45, -2.9);
    lampGroup.add(lampPost);

    const lampArm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), legMat);
    lampArm.position.set(-4.05, 4.86, -2.5);
    lampArm.rotation.y = -0.22;
    lampGroup.add(lampArm);

    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.34), legMat);
    lampHead.position.set(-2.5, 4.82, -2.1);
    lampGroup.add(lampHead);

    const ledStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xfff8e6 })
    );
    ledStrip.rotation.x = Math.PI / 2;
    ledStrip.position.set(-2.5, 4.75, -2.1);
    lampGroup.add(ledStrip);
    this.envGroup.add(lampGroup);

    // Subtle ground contact shadow disc beneath PC Case (y = 0.006 prevents Z-fighting)
    const contactCanvas = document.createElement('canvas');
    contactCanvas.width = 128;
    contactCanvas.height = 128;
    const cctx = contactCanvas.getContext('2d');
    const grad = cctx.createRadialGradient(64, 64, 12, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 128, 128);
    const contactTex = new THREE.CanvasTexture(contactCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 3.2),
      new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, opacity: 0.55, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(CASE_ORIGIN.x, 0.008, CASE_ORIGIN.z);
    this.envGroup.add(contactShadow);

    this.scene.add(this.envGroup);
  }

  _initCameraAndControls() {
    const width = Math.max(320, this.mount.clientWidth || 960);
    const height = Math.max(240, this.mount.clientHeight || 640);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.08, 70);
    const def = CAMERA_PRESETS.default;
    this.camera.position.set(def.pos.x, def.pos.y, def.pos.z);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(def.target.x, def.target.y, def.target.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 22.0;
    this.controls.maxPolarAngle = Math.PI * 0.495; // Keep camera above workbench surface
    this.controls.minPolarAngle = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.update();

    this.controls.addEventListener('change', () => {
      this.requestRender(120);
    });
    this.controls.addEventListener('start', () => {
      // Cancel preset flight if user manually grabs OrbitControls
      this.cameraGoalPos = null;
      this.cameraGoalTarget = null;
    });
  }

  _bindResize() {
    this._onResize = () => {
      if (this.disposed) return;
      const w = Math.max(320, this.mount.clientWidth || 960);
      const h = Math.max(240, this.mount.clientHeight || 640);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.requestRender(120);
    };
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(this._onResize);
      this._resizeObs.observe(this.mount);
    }
  }

  setOrbitEnabled(enabled) {
    this.controls.enabled = Boolean(enabled);
  }

  applyCameraPreset(presetKey) {
    const preset = CAMERA_PRESETS[presetKey] || CAMERA_PRESETS.default;
    this.cameraGoalPos = new THREE.Vector3(preset.pos.x, preset.pos.y, preset.pos.z);
    this.cameraGoalTarget = new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z);
    this.requestRender(950);
  }

  focusOnObject(object3D) {
    if (!object3D) return;
    object3D.updateMatrixWorld(true);
    this._box.setFromObject(object3D);
    if (this._box.isEmpty()) return;
    this._box.getCenter(this._center);
    this._box.getSize(this._size);
    const radius = Math.max(0.65, this._size.length() * 0.5);
    const dist = Math.min(7.5, Math.max(2.0, radius * 2.5));

    this.cameraGoalTarget = this._center.clone();
    this.cameraGoalPos = new THREE.Vector3(
      this._center.x + dist * 0.45,
      Math.max(0.65, this._center.y + dist * 0.42),
      this._center.z + dist * 0.85
    );
    this.requestRender(950);
  }

  /**
   * Coalesces render ticks; runs continuously only during active drags,
   * camera glides, or fan spin animations, sleeping to 0% CPU once settled.
   */
  requestRender(keepAliveMs = 200) {
    if (this.disposed) return;
    const targetUntil = performance.now() + keepAliveMs;
    if (targetUntil > this.needsContinuousUntil) {
      this.needsContinuousUntil = targetUntil;
    }
    if (this.renderPending) return;
    this.renderPending = true;
    this.rafId = requestAnimationFrame((now) => this._tick(now));
  }

  _tick(now) {
    this.renderPending = false;
    if (this.disposed) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTimeMs) / 1000));
    this.lastTimeMs = now;

    let moving = false;

    if (this.cameraGoalPos && this.cameraGoalTarget) {
      const k = 7.5;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.cameraGoalPos.x, k, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.cameraGoalPos.y, k, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.cameraGoalPos.z, k, dt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.cameraGoalTarget.x, k, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.cameraGoalTarget.y, k, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.cameraGoalTarget.z, k, dt);

      const remain =
        this.camera.position.distanceTo(this.cameraGoalPos) +
        this.controls.target.distanceTo(this.cameraGoalTarget);
      if (remain < 0.015) {
        this.camera.position.copy(this.cameraGoalPos);
        this.controls.target.copy(this.cameraGoalTarget);
        this.cameraGoalPos = null;
        this.cameraGoalTarget = null;
      } else {
        moving = true;
      }
    }

    if (typeof this.onBeforeRender === 'function') {
      const wantsMore = this.onBeforeRender(dt, now);
      if (wantsMore) moving = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (moving || now < this.needsContinuousUntil) {
      if (this.isSoftwareGl) {
        this.paceTimeout = setTimeout(() => this.requestRender(0), 16);
      } else {
        this.requestRender(0);
      }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.paceTimeout !== null) clearTimeout(this.paceTimeout);
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObs) this._resizeObs.disconnect();
    this.controls.dispose();
    if (this.envRenderTarget) this.envRenderTarget.dispose();
    if (this.pmrem) this.pmrem.dispose();
    this.renderer.dispose();
  }
}
