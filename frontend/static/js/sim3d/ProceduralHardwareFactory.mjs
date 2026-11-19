/**
 * ProceduralHardwareFactory.mjs
 * Builds physically proportioned (1 unit = 100mm), anatomically detailed,
 * 100% procedural multi-part THREE.Group hardware models for all 10 PC component
 * categories—matching pc-anatomy-grade visual fidelity while preserving every
 * draggable, snappable, latchable, and inspectable contract.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIM_SCALE_MM_TO_UNITS, detectStorageKind } from './SimulationDataManager.mjs';

const S = SIM_SCALE_MM_TO_UNITS;

// ---------------------------------------------------------------------------
// Geometry & Procedural CanvasTexture Helpers
// ---------------------------------------------------------------------------

function safeMerge(geos) {
  const valid = geos.filter(Boolean);
  if (!valid.length) return new THREE.BoxGeometry(0.01, 0.01, 0.01);
  if (valid.length === 1) return valid[0];
  const prepped = valid.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(prepped, false);
  for (let i = 0; i < prepped.length; i++) {
    if (prepped[i] !== valid[i]) prepped[i].dispose();
    valid[i].dispose();
  }
  return merged || new THREE.BoxGeometry(0.01, 0.01, 0.01);
}

function makeRoundedRectShape(w, h, r = 0.02) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.45, hh * 0.45);
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return s;
}

function makeExtrudedBox(w, h, depth, radius = 0.02, bevel = 0.008) {
  const shape = makeRoundedRectShape(w, h, radius);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.center();
  return geo;
}

const _canvasCache = new Map();

function getCachedCanvas(key, w, h, drawFn) {
  let c = _canvasCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawFn(c.getContext('2d'), w, h);
    _canvasCache.set(key, c);
  }
  return c;
}

function makeBrushedMetalBumpTexture() {
  const c = getCachedCanvas('brushed_metal_256', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = 112 + Math.round(Math.sin(y * 1.7) * 18 + ((y * 37) % 24) - 12);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeHoneycombMeshTexture() {
  const c = getCachedCanvas('honeycomb_256', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#18202c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#070b11';
    const stepX = 16;
    const stepY = 14;
    for (let row = 0; row * stepY < h + stepY; row++) {
      const ox = (row % 2) * (stepX * 0.5);
      for (let col = -1; col * stepX < w + stepX; col++) {
        ctx.beginPath();
        ctx.arc(col * stepX + ox, row * stepY, 5.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 12);
  return tex;
}

function makeBraidedSleeveTexture() {
  const c = getCachedCanvas('braided_128', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b4b4b4';
    ctx.lineWidth = 4;
    for (let i = -h; i < w + h; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 2);
  return tex;
}

function makeGoldFingersTexture(pinCount = 64, notchFraction = null) {
  const key = `gold_fingers_${pinCount}_${notchFraction ?? 'none'}`;
  const c = getCachedCanvas(key, 512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#0b121e';
    ctx.fillRect(0, 0, w, h);
    const padW = (w - 20) / pinCount;
    for (let i = 0; i < pinCount; i++) {
      const frac = i / pinCount;
      if (notchFraction !== null && Math.abs(frac - notchFraction) < 0.025) continue;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(10 + i * padW, 6, Math.max(2, padW * 0.62), h - 14);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(10 + i * padW, h - 12, Math.max(2, padW * 0.62), 6);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(title, subtitle = '', accent = '#3ecf5e', bg = '#121a26', markerCorner = false, width = 512, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#090e17');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  // Subtle corner technical tick marks
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  if (markerCorner) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(22, 22);
    ctx.lineTo(80, 22);
    ctx.lineTo(22, 80);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${height >= 256 ? 34 : 26}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(title || '').slice(0, 28), width * 0.5, height * 0.45);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `bold ${height >= 256 ? 20 : 16}px monospace`;
    ctx.fillText(String(subtitle || '').slice(0, 40), width * 0.5, height * 0.66);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getMoboTheme(comp) {
  const tag = `${comp?.brand || ''} ${comp?.model || ''} ${comp?.name || ''}`.toUpperCase();
  if (tag.includes('ROG') || tag.includes('STRIX')) {
    return { accent: '#ef4444', heatsink: 0x334155, trim: 0x991b1b, label: 'ROG STRIX' };
  }
  if (tag.includes('MSI') || tag.includes('MAG') || tag.includes('TOMAHAWK')) {
    return { accent: '#eab308', heatsink: 0x3b4252, trim: 0x475569, label: 'MSI PRO/MAG' };
  }
  if (tag.includes('GIGABYTE') || tag.includes('AORUS')) {
    return { accent: '#f97316', heatsink: 0x3f4756, trim: 0xb45309, label: 'GIGABYTE' };
  }
  if (tag.includes('ASROCK')) {
    return { accent: '#38bdf8', heatsink: 0x475569, trim: 0x0284c7, label: 'ASROCK' };
  }
  return { accent: '#38bdf8', heatsink: 0x4b5563, trim: 0x1e293b, label: String(comp?.brand || 'ATX').toUpperCase() };
}

function makeMotherboardPcbTexture(comp, theme, dims = { w: 244, h: 305 }) {
  const isMicro = dims.h < 270 && dims.w >= 210;
  const isItx = dims.w < 200 || dims.h < 200;
  const W = 1536;
  const H = isItx ? 1024 : isMicro ? 1228 : 1536;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Rich matte dark solder mask (pc-anatomy obsidian/graphite laminate)
  ctx.fillStyle = '#111614';
  ctx.fillRect(0, 0, W, H);

  // Deterministic PRNG for copper pours & SMD silkscreen footprints
  let seed = 9137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Copper pour regions under solder mask
  ctx.fillStyle = '#161c19';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(rand() * W * 0.78, rand() * H * 0.78, W * (0.12 + rand() * 0.28), H * (0.1 + rand() * 0.25));
  }

  // Thermal relief cross-hatch
  ctx.strokeStyle = '#0c100e';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;
  for (let d = -H; d < W; d += 12) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Decorative 45-degree fan-out trace bundles
  for (let b = 0; b < 24; b++) {
    const lanes = 3 + Math.floor(rand() * 7);
    const fromTop = rand() > 0.5;
    const x0 = rand() * W * 0.75;
    const y0 = fromTop ? rand() * H * 0.35 : H - rand() * H * 0.35;
    const dir = fromTop ? 1 : -1;
    const run = W * (0.12 + rand() * 0.35);
    ctx.strokeStyle = rand() > 0.72 ? '#23312b' : '#1b2420';
    ctx.lineWidth = rand() > 0.82 ? 3.0 : 1.6;
    for (let l = 0; l < lanes; l++) {
      const y = y0 + dir * l * (ctx.lineWidth + 3.4);
      const bend = 40 + rand() * 55;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + bend, y);
      ctx.lineTo(x0 + bend + 44, y + dir * 44);
      ctx.lineTo(x0 + bend + 44 + run, y + dir * 44);
      ctx.stroke();
    }
  }

  // Exact mm -> canvas pixel helpers matching pc-anatomy layout (x: -122..+122, z: -152.5..bottom)
  const bottomMm = isItx ? 17.5 : isMicro ? 91.5 : 152.5;
  const leftMm = -122;
  const widthMm = isItx ? 170 : 244;
  const heightMm = 152.5 + bottomMm;
  const pxX = (mmX) => ((mmX - leftMm) / widthMm) * W;
  const pxY = (mmZ) => ((mmZ + 152.5) / heightMm) * H;

  const routeBus = (from, through, to, lanes, gap = 4.5) => {
    ctx.strokeStyle = '#25352d';
    ctx.lineWidth = 2.2;
    for (let lane = 0; lane < lanes; lane++) {
      const off = (lane - (lanes - 1) / 2) * gap;
      ctx.beginPath();
      ctx.moveTo(from[0], from[1] + off);
      ctx.lineTo(through[0], through[1] + off);
      ctx.lineTo(to[0], to[1] + off);
      ctx.stroke();
    }
  };

  if (!isItx) {
    // Length-matched CPU->DIMM, CPU->PCIe, CPU->Audio & Chipset uplink traces
    routeBus([pxX(30), pxY(-64)], [pxX(46), pxY(-64)], [pxX(62), pxY(-96)], 12, 4);
    routeBus([pxX(8), pxY(-32)], [pxX(8), pxY(2)], [pxX(-31), pxY(30)], 10, 4.5);
    routeBus([pxX(18), pxY(-30)], [pxX(42), pxY(10)], [pxX(62), pxY(62)], 8, 5);
    routeBus([pxX(-20), pxY(-40)], [pxX(-60), pxY(-10)], [pxX(-105), pxY(30)], 6, 5);
  }

  // Isolated Audio copper trace boundary (bottom-left)
  ctx.strokeStyle = '#c89e4b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pxX(-122), pxY(bottomMm - 64));
  ctx.lineTo(pxX(-94), pxY(bottomMm - 64));
  ctx.lineTo(pxX(-84), pxY(bottomMm - 50));
  ctx.lineTo(pxX(-84), H);
  ctx.stroke();

  // Via stitching along power rails
  const drawVia = (vx, vy, r) => {
    ctx.fillStyle = '#c2a661';
    ctx.beginPath();
    ctx.arc(vx, vy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0f0c';
    ctx.beginPath();
    ctx.arc(vx, vy, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < 240; i++) {
    drawVia(rand() * W, rand() * H, 2.4 + rand() * 1.4);
  }

  // Silkscreen part footprints & designators
  ctx.lineWidth = 1.6;
  const prefixes = ['R', 'C', 'U', 'L', 'Q', 'D', 'J'];
  for (let i = 0; i < 72; i++) {
    const rw = 16 + rand() * 54;
    const rh = 11 + rand() * 32;
    const rx = 24 + rand() * (W - rw - 48);
    const ry = 28 + rand() * (H - rh - 56);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#9aa39d';
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#c2a661';
    ctx.fillRect(rx - 4, ry + rh * 0.25, 5, rh * 0.5);
    ctx.fillRect(rx + rw - 1, ry + rh * 0.25, 5, rh * 0.5);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#9aa39d';
    ctx.font = '14px monospace';
    ctx.fillText(prefixes[Math.floor(rand() * prefixes.length)] + (100 + Math.floor(rand() * 799)), rx, ry - 4);
  }
  ctx.globalAlpha = 1;

  // Silkscreen labels & keepout boxes
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([14, 8]);
  ctx.strokeRect(pxX(-26), pxY(-102), pxX(42) - pxX(-26), pxY(-26) - pxY(-102));
  if (!isItx) {
    ctx.strokeRect(pxX(-84), pxY(24), pxX(22) - pxX(-84), pxY(40) - pxY(24));
  }
  ctx.setLineDash([]);

  ctx.fillStyle = '#aeb6b0';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(String(comp?.socket || 'AM5').toUpperCase(), pxX(-24), pxY(-106));
  if (!isItx) {
    ctx.fillText('DDR_A1 A2 B1 B2', pxX(58), pxY(-129));
    ctx.fillText('M2_1 PCIe 5.0', pxX(-48), pxY(-2));
    ctx.fillText('PCIEX16_1', pxX(-84), pxY(20));
  }
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 24px monospace';
  ctx.fillText(theme.label, 38, H - 56);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${String(comp?.model || comp?.name || 'ATX').slice(0, 26)} · ${comp?.socket || ''}`, 38, H - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCpuBottomTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sock = String(comp?.socket || '').toUpperCase();
  const isPga = sock.includes('AM4');
  ctx.fillStyle = isPga ? '#0e4e34' : '#0f5132';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle substrate inner trace ring
  ctx.strokeStyle = '#198754';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 464, 464);

  // Gold LGA pads or AM4 PGA pin matrix
  ctx.fillStyle = '#eab308';
  const step = isPga ? 14 : 16;
  for (let x = 40; x < 472; x += step) {
    for (let y = 40; y < 472; y += step) {
      if (x > 188 && x < 324 && y > 188 && y < 324) continue;
      if (!isPga && (x < 72 || x > 440) && (y < 72 || y > 440)) continue;
      ctx.fillRect(x, y, isPga ? 6 : 10, isPga ? 6 : 10);
    }
  }

  // Central MLCC decoupling capacitor bay
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(190, 190, 132, 132);
  for (let x = 202; x < 312; x += 18) {
    for (let y = 202; y < 312; y += 16) {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x, y, 12, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x, y, 3, 8);
      ctx.fillRect(x + 9, y, 3, 8);
    }
  }

  // Mirrored Pin-1 Gold Chamfer Corner (aligns with -X/+Y when flipped)
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(484, 28);
  ctx.lineTo(418, 28);
  ctx.lineTo(484, 94);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// High-Detail Shared Axial Fan Assembly (Merged Swept Blades + Stator Struts)
// ---------------------------------------------------------------------------

function _makeSweptRotorGeometry(size, bladeCount = 9) {
  const rInner = size * 0.165;
  const rOuter = size * 0.415;
  const bladeParts = [];

  // Swept airfoil blade polygon
  const bladeLen = rOuter - rInner;
  const chord = size * 0.11;
  const shape = new THREE.Shape();
  shape.moveTo(0, -chord * 0.42);
  shape.quadraticCurveTo(bladeLen * 0.52, -chord * 0.65, bladeLen, -chord * 0.25);
  shape.lineTo(bladeLen, chord * 0.35);
  shape.quadraticCurveTo(bladeLen * 0.48, chord * 0.12, 0, chord * 0.38);
  shape.closePath();

  const baseBlade = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: false,
    curveSegments: 3,
  });
  baseBlade.translate(0, 0, -0.007);
  baseBlade.rotateX(0.46); // Aerodynamic pitch

  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const g = baseBlade.clone();
    g.translate(rInner * 0.9, 0, 0);
    g.rotateZ(angle);
    bladeParts.push(g);
  }
  baseBlade.dispose();
  return safeMerge(bladeParts);
}

function _makeFanAssembly(size, frameMat, fanRotorsList, opts = {}) {
  const { depth = 0.24, accentColor = null, showStruts = true } = opts;
  const fanGroup = new THREE.Group();

  // 1. Octagonal/Chamfered Housing Frame with Circular Bore Hole
  const half = size * 0.5;
  const cut = size * 0.09;
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-half + cut, -half);
  frameShape.lineTo(half - cut, -half);
  frameShape.lineTo(half, -half + cut);
  frameShape.lineTo(half, half - cut);
  frameShape.lineTo(half - cut, half);
  frameShape.lineTo(-half + cut, half);
  frameShape.lineTo(-half, half - cut);
  frameShape.lineTo(-half, -half + cut);
  frameShape.closePath();

  const bore = new THREE.Path();
  bore.absarc(0, 0, size * 0.435, 0, Math.PI * 2, true);
  frameShape.holes.push(bore);

  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: Math.max(0.06, depth - 0.02),
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 14,
  });
  frameGeo.center();
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.castShadow = true;
  fanGroup.add(frameMesh);

  // 2. Corner Anti-Vibration Rubber Pads + Screw Holes
  const padMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.9, metalness: 0.05 });
  const padGeos = [];
  const off = half - cut * 0.95;
  for (const [cx, cy] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
    const p = new THREE.CylinderGeometry(size * 0.052, size * 0.052, depth + 0.008, 12);
    p.rotateX(Math.PI / 2);
    p.translate(cx, cy, 0);
    padGeos.push(p);
  }
  fanGroup.add(new THREE.Mesh(safeMerge(padGeos), padMat));

  // 3. 4 Curved Rear Stator Struts on exhaust face (-Z)
  if (showStruts) {
    const strutGeos = [];
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      const sg = new THREE.BoxGeometry(size * 0.29, size * 0.026, 0.02);
      sg.translate(size * 0.285, 0, -depth * 0.36);
      sg.rotateZ(a);
      strutGeos.push(sg);
    }
    const backDisc = new THREE.CylinderGeometry(size * 0.165, size * 0.165, 0.024, 18);
    backDisc.rotateX(Math.PI / 2);
    backDisc.translate(0, 0, -depth * 0.36);
    strutGeos.push(backDisc);
    fanGroup.add(new THREE.Mesh(safeMerge(strutGeos), frameMat));
  }

  // Optional Subtle Rim Accent Ring
  if (accentColor) {
    const ringMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.32,
      roughness: 0.35,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.435, 0.011, 8, 28), ringMat);
    ring.position.z = depth * 0.46;
    fanGroup.add(ring);
  }

  // 4. Spinning Rotor (Hub + Metallic Brushed Cap + 9 Merged Swept Blades)
  const rotor = new THREE.Group();
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x263143, roughness: 0.32, metalness: 0.65 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.38, metalness: 0.42 });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.88,
    bumpMap: makeBrushedMetalBumpTexture(),
    bumpScale: 0.004,
  });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.165, size * 0.175, depth * 0.58, 20), hubMat);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);

  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.105, size * 0.105, 0.018, 20), capMat);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.z = depth * 0.30;
  rotor.add(hubCap);

  const bladesMesh = new THREE.Mesh(_makeSweptRotorGeometry(size, 9), bladeMat);
  bladesMesh.castShadow = true;
  rotor.add(bladesMesh);

  fanGroup.add(rotor);
  fanRotorsList.push(rotor);
  return fanGroup;
}

// ---------------------------------------------------------------------------
// 1. PC Case (Anatomical Dual-Glass / Mesh / Cutout Rear / Grommets / Fans)
// ---------------------------------------------------------------------------

function makeCaseStandOffsAndFrame(caseGroup, dimsMm) {
  const d = (dimsMm?.d || 460) * S; // X length (rear to front)
  const h = (dimsMm?.h || 460) * S; // Y height
  const w = (dimsMm?.w || 220) * S; // Z width (tray back to glass front)

  const brushedBump = makeBrushedMetalBumpTexture();
  const meshTex = makeHoneycombMeshTexture();

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x202938,
    roughness: 0.44,
    metalness: 0.76,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x111824,
    roughness: 0.65,
    metalness: 0.3,
  });
  const aluCornerMat = new THREE.MeshStandardMaterial({
    color: 0x3b475a,
    roughness: 0.32,
    metalness: 0.85,
    bumpMap: brushedBump,
    bumpScale: 0.005,
  });
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: meshTex,
    roughness: 0.78,
    metalness: 0.35,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.92, metalness: 0.05 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a448, roughness: 0.25, metalness: 0.9 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.24, metalness: 0.9 });

  const caseRotors = [];

  // 1. Machined Chrome/Rubber Isolation Feet (bottom rests strictly at y = 0)
  for (const [fx, fz] of [
    [-d / 2 + 0.34, -w / 2 + 0.26],
    [d / 2 - 0.34, -w / 2 + 0.26],
    [-d / 2 + 0.34, w / 2 - 0.26],
    [d / 2 - 0.34, w / 2 - 0.26],
  ]) {
    const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 18), rubberMat);
    footPad.position.set(fx, 0.02, fz);
    const footRing = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.025, 18), aluCornerMat);
    footRing.position.set(fx, 0.05, fz);
    caseGroup.add(footPad, footRing);
  }

  // 2. Bottom Floor Deck + PSU Bottom Intake Filter Vent
  const floor = new THREE.Mesh(makeExtrudedBox(d, 0.055, w, 0.03, 0.006), steelMat);
  floor.position.set(0, 0.08, 0);
  floor.receiveShadow = true;
  caseGroup.add(floor);

  const psuFilterMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.015, 1.45), meshMat);
  psuFilterMesh.position.set(-1.48, 0.11, 0);
  caseGroup.add(psuFilterMesh);

  // 3. Top Roof Frame with Recessed Honeycomb Fan Grille & Detailed Front I/O Console
  const roofFrame = new THREE.Mesh(makeExtrudedBox(d, 0.065, w, 0.03, 0.006), steelMat);
  roofFrame.position.set(0, h - 0.032, 0);
  roofFrame.castShadow = true;
  caseGroup.add(roofFrame);

  const roofGrille = new THREE.Mesh(new THREE.BoxGeometry(d * 0.64, 0.02, w * 0.70), meshMat);
  roofGrille.position.set(-0.32, h + 0.002, -0.05);
  caseGroup.add(roofGrille);

  const ioBar = new THREE.Mesh(makeExtrudedBox(0.36, 0.035, w * 0.74, 0.02, 0.005), trimMat);
  ioBar.position.set(d / 2 - 0.26, h + 0.006, 0);
  caseGroup.add(ioBar);

  const pwrRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.044, 0.025, 18),
    new THREE.MeshStandardMaterial({ color: 0x3ecf5e, emissive: 0x22c55e, emissiveIntensity: 0.85 })
  );
  pwrRing.position.set(d / 2 - 0.26, h + 0.02, 0.36);
  const usbA1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.12), new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 }));
  usbA1.position.set(d / 2 - 0.26, h + 0.02, 0.12);
  const usbA2 = usbA1.clone();
  usbA2.position.z = -0.06;
  const usbC = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.09), silverMat);
  usbC.position.set(d / 2 - 0.26, h + 0.02, -0.24);
  const audioJack = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.026, 12), silverMat);
  audioJack.position.set(d / 2 - 0.26, h + 0.02, -0.40);
  caseGroup.add(pwrRing, usbA1, usbA2, usbC, audioJack);

  // 4. Sculpted Vertical Aluminum Corner Pillars
  const pillarGeo = makeExtrudedBox(0.09, h - 0.08, 0.09, 0.02, 0.008);
  for (const [px, pz] of [
    [-d / 2 + 0.045, -w / 2 + 0.045],
    [d / 2 - 0.045, -w / 2 + 0.045],
    [-d / 2 + 0.045, w / 2 - 0.045],
    [d / 2 - 0.045, w / 2 - 0.045],
  ]) {
    const p = new THREE.Mesh(pillarGeo, aluCornerMat);
    p.position.set(px, h / 2, pz);
    caseGroup.add(p);
  }

  // 5. Right/Back Steel Side Wall (-Z) + Inner Motherboard Tray + Cable Routing Grommets
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(d - 0.08, h - 0.12, 0.055), steelMat);
  backWall.position.set(0, h / 2, -w / 2 + 0.03);
  backWall.receiveShadow = true;
  caseGroup.add(backWall);

  const mbTray = new THREE.Mesh(new THREE.BoxGeometry(d * 0.66, h * 0.74, 0.04), steelMat);
  mbTray.position.set(-0.62, h * 0.60, -0.76);
  mbTray.receiveShadow = true;
  caseGroup.add(mbTray);

  // Slotted Rubber Cable Grommets beside MB ATX/SATA Edge
  for (const gy of [1.55, 2.38, 3.22, 3.92]) {
    const grommet = new THREE.Mesh(makeExtrudedBox(0.18, 0.34, 0.055, 0.04, 0.006), rubberMat);
    grommet.position.set(0.45, gy, -0.75);
    caseGroup.add(grommet);
  }

  // 9 Hex Brass Standoffs aligned to pc-anatomy ATX mounts (tips stop flush at -0.680 under MB back face)
  const standoffGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.064, 6);
  standoffGeo.rotateX(Math.PI / 2);
  for (const sx of [-2.13, -0.57, 0.14]) {
    for (const sy of [1.45, 2.76, 4.31]) {
      const standoff = new THREE.Mesh(standoffGeo, brassMat);
      standoff.position.set(sx, sy, -0.712);
      caseGroup.add(standoff);
    }
  }

  // 6. Sculpted Rear Wall (-X) with Real Cutouts for MB I/O, Exhaust Fan, PCIe Slots & PSU
  // Note: rotateY(Math.PI/2) maps shape (sx, sy) -> 3D (x=depth, y=sy, z=-sx), so sx = -z!
  const rearWallShape = new THREE.Shape();
  rearWallShape.moveTo(-w / 2, 0.11);
  rearWallShape.lineTo(w / 2, 0.11);
  rearWallShape.lineTo(w / 2, h - 0.06);
  rearWallShape.lineTo(-w / 2, h - 0.06);
  rearWallShape.closePath();

  // PSU bay cutout (bottom)
  const psuHole = new THREE.Path();
  psuHole.moveTo(-0.76, 0.15);
  psuHole.lineTo(0.76, 0.15);
  psuHole.lineTo(0.76, 1.00);
  psuHole.lineTo(-0.76, 1.00);
  psuHole.closePath();
  rearWallShape.holes.push(psuHole);

  // PCIe expansion cutout (mid-lower, cleared up to y=2.76 so GPU bracket never clips)
  const pcieHole = new THREE.Path();
  pcieHole.moveTo(-0.68, 1.28);
  pcieHole.lineTo(0.66, 1.28);
  pcieHole.lineTo(0.66, 2.76);
  pcieHole.lineTo(-0.68, 2.76);
  pcieHole.closePath();
  rearWallShape.holes.push(pcieHole);

  // Motherboard Rear I/O shield cutout matching pc-anatomy I/O stack (z: -0.70..-0.31, y: 2.84..4.39)
  const ioHole = new THREE.Path();
  ioHole.moveTo(0.31, 2.84);
  ioHole.lineTo(0.70, 2.84);
  ioHole.lineTo(0.70, 4.39);
  ioHole.lineTo(0.31, 4.39);
  ioHole.closePath();
  rearWallShape.holes.push(ioHole);

  // Rear 120mm exhaust fan circular mesh opening (maps to z = +0.24, y = 3.62)
  const rearFanHole = new THREE.Path();
  rearFanHole.absarc(-0.24, 3.62, 0.54, 0, Math.PI * 2, true);
  rearWallShape.holes.push(rearFanHole);

  const rearWallGeo = new THREE.ExtrudeGeometry(rearWallShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 20,
  });
  rearWallGeo.rotateY(Math.PI / 2);
  const rearWallMesh = new THREE.Mesh(rearWallGeo, steelMat);
  rearWallMesh.position.set(-d / 2, 0, 0);
  caseGroup.add(rearWallMesh);

  // Slotted PCIe Expansion Covers inside rear PCIe cutout (leave upper slots y=2.15..2.64 open for GPU)
  for (let slot = 0; slot < 5; slot++) {
    const sy = 1.37 + slot * 0.172;
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 1.28), slot >= 3 ? meshMat : trimMat);
    cover.position.set(-d / 2 + 0.03, sy, 0.01);
    caseGroup.add(cover);
  }

  // 7. Front Intake Bezel (+X) with Fine Mesh & 3x Illuminated Front Intake Fans
  const frontBezelShape = new THREE.Shape();
  frontBezelShape.moveTo(-w / 2, 0.10);
  frontBezelShape.lineTo(w / 2, 0.10);
  frontBezelShape.lineTo(w / 2, h - 0.08);
  frontBezelShape.lineTo(-w / 2, h - 0.08);
  frontBezelShape.closePath();

  const frontCutout = new THREE.Path();
  frontCutout.moveTo(-w / 2 + 0.15, 0.28);
  frontCutout.lineTo(w / 2 - 0.15, 0.28);
  frontCutout.lineTo(w / 2 - 0.15, h - 0.26);
  frontCutout.lineTo(-w / 2 + 0.15, h - 0.26);
  frontCutout.closePath();
  frontBezelShape.holes.push(frontCutout);

  const frontBezelGeo = new THREE.ExtrudeGeometry(frontBezelShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  frontBezelGeo.rotateY(Math.PI / 2);
  const frontBezel = new THREE.Mesh(frontBezelGeo, trimMat);
  frontBezel.position.set(d / 2 - 0.15, 0, 0);
  caseGroup.add(frontBezel);

  // Semi-transparent perforated front grille sheet
  const frontGrilleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: meshTex,
    roughness: 0.72,
    metalness: 0.35,
    transparent: true,
    opacity: 0.78,
  });
  const frontMesh = new THREE.Mesh(new THREE.BoxGeometry(0.025, h - 0.56, w - 0.32), frontGrilleMat);
  frontMesh.position.set(d / 2 - 0.01, h / 2, 0);
  caseGroup.add(frontMesh);

  // 3x 120mm Front Intake Fans visible behind perforated mesh
  const frontFanFrameMat = new THREE.MeshStandardMaterial({ color: 0x182230, roughness: 0.5, metalness: 0.35 });
  for (let f = 0; f < 3; f++) {
    const fy = 1.02 + f * 1.24;
    if (fy + 0.56 > h - 0.25) continue;
    const fFan = _makeFanAssembly(1.14, frontFanFrameMat, caseRotors, {
      depth: 0.18,
      accentColor: 0x38bdf8,
      showStruts: true,
    });
    fFan.rotation.y = Math.PI / 2;
    fFan.position.set(d / 2 - 0.20, fy, 0);
    caseGroup.add(fFan);
  }

  // 8. Sculpted PSU Shroud with Top Perforated Vent & Side Viewing Cutout Window
  const shroudLen = d * 0.62;
  const shroudTop = new THREE.Mesh(makeExtrudedBox(shroudLen, 0.05, w - 0.14, 0.02, 0.005), steelMat);
  shroudTop.position.set(-d / 2 + shroudLen / 2 + 0.06, 1.12, 0.02);
  shroudTop.receiveShadow = true;
  caseGroup.add(shroudTop);

  // Perforated top vent panel on PSU shroud
  const shroudVent = new THREE.Mesh(new THREE.BoxGeometry(shroudLen * 0.52, 0.015, w * 0.56), meshMat);
  shroudVent.position.set(-d / 2 + shroudLen * 0.58, 1.148, -0.04);
  caseGroup.add(shroudVent);

  // Subtle illuminated accent bar along PSU shroud outer lip (signature pc-anatomy look!)
  const shroudAccent = new THREE.Mesh(
    new THREE.BoxGeometry(shroudLen * 0.94, 0.018, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.35, roughness: 0.25 })
  );
  shroudAccent.position.set(-d / 2 + shroudLen / 2 + 0.06, 1.12, w / 2 - 0.055);
  caseGroup.add(shroudAccent);

  // Side shroud wall with open PSU badge viewing window
  const shroudSideShape = new THREE.Shape();
  shroudSideShape.moveTo(-shroudLen / 2, -0.51);
  shroudSideShape.lineTo(shroudLen / 2, -0.51);
  shroudSideShape.lineTo(shroudLen / 2, 0.51);
  shroudSideShape.lineTo(-shroudLen / 2, 0.51);
  shroudSideShape.closePath();

  const winHole = new THREE.Path();
  winHole.moveTo(-shroudLen / 2 + 0.22, -0.34);
  winHole.lineTo(-shroudLen / 2 + 1.48, -0.34);
  winHole.lineTo(-shroudLen / 2 + 1.48, 0.32);
  winHole.lineTo(-shroudLen / 2 + 0.22, 0.32);
  winHole.closePath();
  shroudSideShape.holes.push(winHole);

  const shroudSideGeo = new THREE.ExtrudeGeometry(shroudSideShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
  });
  shroudSideGeo.center();
  const shroudSide = new THREE.Mesh(shroudSideGeo, steelMat);
  shroudSide.position.set(-d / 2 + shroudLen / 2 + 0.06, 0.61, w / 2 - 0.14);
  caseGroup.add(shroudSide);

  const shroudFront = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.02, w - 0.14), steelMat);
  shroudFront.position.set(-d / 2 + shroudLen + 0.06, 0.61, 0.02);
  caseGroup.add(shroudFront);

  // Drive cage shelf on right side of shroud
  const driveShelf = new THREE.Mesh(makeExtrudedBox(1.18, 0.045, 1.28, 0.02, 0.005), steelMat);
  driveShelf.position.set(1.42, 0.36, 0.05);
  caseGroup.add(driveShelf);

  // 9. Removable Tempered Glass Side Panel (+Z face) with Dark Frit Border & Knurled Thumbscrews
  const panelGroup = new THREE.Group();
  panelGroup.name = 'CaseSidePanel';

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.22,
    roughness: 0.06,
    metalness: 0.05,
    ior: 1.52,
    depthWrite: false,
  });
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(d - 0.18, h - 0.18, 0.035), glassMat);
  panelGroup.add(glassPane);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0f17, roughness: 0.42, metalness: 0.45 });
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(d - 0.16, 0.12, 0.044), frameMat);
  topBar.position.y = (h - 0.18) / 2 - 0.06;
  const botBar = topBar.clone();
  botBar.position.y = -(h - 0.18) / 2 + 0.06;
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, h - 0.18, 0.044), frameMat);
  leftBar.position.x = -(d - 0.18) / 2 + 0.06;
  const rightBar = leftBar.clone();
  rightBar.position.x = (d - 0.18) / 2 - 0.06;
  panelGroup.add(topBar, botBar, leftBar, rightBar);

  const screwGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.085, 14);
  screwGeo.rotateX(Math.PI / 2);
  for (const [sx, sy] of [
    [-(d / 2 - 0.22), h / 2 - 0.22],
    [d / 2 - 0.22, h / 2 - 0.22],
    [-(d / 2 - 0.22), -(h / 2 - 0.22)],
    [d / 2 - 0.22, -(h / 2 - 0.22)],
  ]) {
    const screw = new THREE.Mesh(screwGeo, aluCornerMat);
    screw.position.set(sx, sy, 0.02);
    panelGroup.add(screw);
  }

  panelGroup.position.set(0, h / 2, w / 2 - 0.03);
  caseGroup.add(panelGroup);
  caseGroup.userData.sidePanel = panelGroup;
  caseGroup.userData.closedPanelPos = panelGroup.position.clone();
  caseGroup.userData.fanRotors = caseRotors;
}

export function createCaseModel(comp) {
  const group = new THREE.Group();
  group.name = `Hardware_case_${comp?.id || 'default'}`;
  makeCaseStandOffsAndFrame(group, comp?.dimensionsMm);
  return group;
}

// ---------------------------------------------------------------------------
// 2. Motherboard (Multi-Layer PCB, VRM Heatsinks + Chokes + Caps, I/O Stack,
//    CMOS Battery, M.2 Armor, Steel PCIe, Preserved ILM Lever & DIMM Latches)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. Motherboard (Direct Port of Yoosseph/pc-anatomy mainboard.ts + parts.ts
//    with Box3 Keepout Collision Guards, Brand Designs & Draggable Latches)
// ---------------------------------------------------------------------------

function _paMaterialCache(brushedBump) {
  const cache = new Map();
  return (color, metal = 0.08, rough = 0.58) => {
    const key = `${color}_${metal}_${rough}`;
    let m = cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        metalness: metal,
        roughness: rough,
        ...(metal > 0.65 ? { bumpMap: brushedBump, bumpScale: 0.003 } : {}),
      });
      cache.set(key, m);
    }
    return m;
  };
}

function _paBuildCapacitor(matFn, radius, height, color = '#1d2226') {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), matFn(color, 0.45, 0.42)));
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.96, radius * 0.96, height * 0.05, 14),
    matFn('#8a9297', 0.9, 0.3)
  );
  top.position.y = height / 2;
  g.add(top);
  const score = new THREE.BoxGeometry(radius * 1.65, height * 0.05, radius * 0.12);
  const scoreMat = matFn('#3f474c', 0.7, 0.5);
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(score, scoreMat);
    line.position.y = height / 2 + height * 0.015;
    line.rotation.y = (i / 3) * Math.PI;
    g.add(line);
  }
  return g;
}

function _paBuildChoke(matFn, size, height, color = '#26292c') {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, height, size), matFn(color, 0.26, 0.62)));
  const pad = new THREE.BoxGeometry(size * 0.26, height * 0.34, size * 1.02);
  const termMat = matFn('#a8763f', 0.92, 0.3);
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(pad, termMat);
    t.position.set(side * size * 0.37, -height * 0.33, 0);
    g.add(t);
  }
  return g;
}

function _paBuildChip(matFn, size, pins = 6, fourSides = false, color = '#17191b') {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), matFn(color, 0.1, 0.55)));
  const lead = new THREE.BoxGeometry(size[0] / pins / 2.4, size[1] * 0.22, size[2] * 0.2);
  const leadMat = matFn('#aab1b5', 0.92, 0.28);
  for (let edge = 0; edge < (fourSides ? 4 : 2); edge++) {
    for (let i = 0; i < pins; i++) {
      const pin = new THREE.Mesh(lead, leadMat);
      const along = ((i + 0.5) / pins - 0.5) * size[edge < 2 ? 0 : 2] * 0.88;
      const out = (edge % 2 ? 1 : -1) * (edge < 2 ? size[2] : size[0]) * 0.56;
      if (edge < 2) pin.position.set(along, -size[1] * 0.34, out);
      else {
        pin.rotation.y = Math.PI / 2;
        pin.position.set(out, -size[1] * 0.34, along);
      }
      g.add(pin);
    }
  }
  return g;
}

function _paBuildHeader(matFn, columns, rows, pitch = 2.54 * S, color = '#202326', height = 6 * S) {
  const g = new THREE.Group();
  const width = columns * pitch + 2.2 * S;
  const depth = rows * pitch + 2.2 * S;
  const shellMat = matFn(color, 0.05, 0.66);
  for (const [w, d, x, z] of [
    [width, 0.8 * S, 0, depth / 2],
    [width, 0.8 * S, 0, -depth / 2],
    [0.8 * S, depth, width / 2, 0],
    [0.8 * S, depth, -width / 2, 0],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), shellMat);
    wall.position.set(x, 0, z);
    g.add(wall);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.2, depth), matFn('#101214', 0.05, 0.7)));
  const pin = new THREE.BoxGeometry(pitch * 0.26, height * 0.74, pitch * 0.26);
  const pinMat = matFn('#c8a95a', 0.94, 0.22);
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const post = new THREE.Mesh(pin, pinMat);
      post.position.set((c - (columns - 1) / 2) * pitch, height * 0.18, (r - (rows - 1) / 2) * pitch);
      g.add(post);
    }
  }
  return g;
}

function _paBuildSlot(matFn, length, color, options = {}) {
  const {
    width = 6.5 * S,
    height = 6 * S,
    notch = 0.55,
    latch = false,
    armour = false,
    latchColor = '#d8dce0',
    latchEnds = 'both',
    skipRightEndClip = false,
  } = options;
  const g = new THREE.Group();
  const body = matFn(color, 0.08, 0.58);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, height, width * 0.32), body);
    rail.position.set(0, 0, (side * width) / 3);
    g.add(rail);
  }
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, height, width), body);
    end.position.set((side * (length - width * 0.5)) / 2, 0, 0);
    g.add(end);
  }
  const key = new THREE.Mesh(new THREE.BoxGeometry(width * 0.38, height * 0.82, width), body);
  key.position.set(length * (notch - 0.5), -height * 0.05, 0);
  g.add(key);
  const contact = new THREE.BoxGeometry(length * 0.94, height * 0.12, width * 0.055);
  const gold = matFn('#c2a457', 0.93, 0.26);
  for (const side of [-1, 1]) {
    const row = new THREE.Mesh(contact, gold);
    row.position.set(0, -height * 0.18, side * width * 0.11);
    g.add(row);
  }
  if (latch) {
    for (const side of latchEnds === 'right' ? [1] : [-1, 1]) {
      if (skipRightEndClip && side === -1) continue;
      const clip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.55, height * 1.35, width * 0.72),
        matFn(latchColor, 0.2, 0.5)
      );
      clip.position.set((side * (length + width * 0.5)) / 2, height * 0.32, 0);
      g.add(clip);
    }
  }
  if (armour) {
    const shell = matFn('#b6bdc2', 0.93, 0.24);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length + width * 0.9, height * 1.12, width * 0.1), shell);
      wall.position.set(0, height * 0.06, side * width * 0.62);
      g.add(wall);
    }
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.1, height * 1.12, width * 1.3), shell);
      cap.position.set((side * (length + width * 0.9)) / 2, height * 0.06, 0);
      g.add(cap);
    }
  }
  return g;
}

function _paBuildScrew(matFn, radius = 2.3 * S) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.86, radius * 0.6, 12), matFn('#9fa7ab', 0.92, 0.24)));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.25, radius * 0.14, radius * 0.26), matFn('#585f63', 0.82, 0.38));
  slot.position.y = radius * 0.3;
  g.add(slot);
  return g;
}

function _paGetBoardDesign(comp) {
  const tag = `${comp?.brand || ''} ${comp?.model || ''} ${comp?.name || ''}`.toUpperCase();
  if (tag.includes('MSI') || tag.includes('MAG') || tag.includes('TOMAHAWK') || tag.includes('B660M')) {
    return {
      armour: ['#14171c', 0.65, 0.72],
      trim: ['#c9c04a', 0.45, 0.55],
      ink: '#d4cc78',
      marks: { big: 'MAG', small: 'PRO SERIES', tag: 'MSI', io: 'MSI PRO' },
      tuf: false,
      fins: 'slats',
      chipset: 'plate',
    };
  }
  if (tag.includes('GIGABYTE') || tag.includes('AORUS') || tag.includes('B550M')) {
    return {
      armour: ['#475059', 0.88, 0.36],
      trim: ['#cdd3d9', 0.95, 0.24],
      ink: '#e6e9ec',
      marks: { big: 'AORUS', small: 'ULTRA', tag: 'GIGABYTE', io: 'GIGABYTE' },
      tuf: false,
      fins: 'slats',
      chipset: 'plate',
    };
  }
  if (tag.includes('ASROCK') || tag.includes('ITX')) {
    return {
      armour: ['#7b838b', 0.88, 0.36],
      trim: ['#1d2023', 0.4, 0.7],
      ink: '#1e2226',
      marks: { big: 'ASRock', small: 'PRO RS', tag: 'MINI-ITX', io: 'ASROCK' },
      tuf: false,
      fins: 'block',
      chipset: 'square',
    };
  }
  return {
    armour: ['#13171d', 0.62, 0.78],
    trim: ['#ef4444', 0.55, 0.55],
    ink: '#cbd5e1',
    marks: { big: 'ROG', small: 'STRIX', tag: 'REPUBLIC OF GAMERS', io: 'ROG STRIX' },
    tuf: true,
    fins: 'blades',
    chipset: 'armour',
  };
}

export function createMotherboardModel(comp) {
  const dims = comp?.dimensionsMm || { w: 244, h: 305, d: 24 };
  const isMiniItx = dims.w < 200 || dims.h < 200;
  const micro = !isMiniItx && dims.h < 270;
  const intel = String(comp?.socket || '').toUpperCase().includes('LGA');
  const dimmCount = Math.min(4, Math.max(2, Number(comp?.dimm_slots || (isMiniItx ? 2 : 4))));
  const m2Count = Number(comp?.m2_slots ?? (isMiniItx ? 1 : 2));

  const group = new THREE.Group();
  group.name = `Hardware_mb_${comp?.id || 'mb'}`;

  // All pc-anatomy coordinates live in boardRoot (XZ plane, +Y up), rotated +90° around X -> local (+X, -Z, +Y)
  const boardRoot = new THREE.Group();
  group.add(boardRoot);

  const brushedBump = makeBrushedMetalBumpTexture();
  const matFn = _paMaterialCache(brushedBump);
  const design = _paGetBoardDesign(comp);
  const theme = getMoboTheme(comp);

  const dark = matFn(design.armour[0], design.armour[1], design.armour[2]);
  const edge = matFn(design.trim[0], design.trim[1], design.trim[2]);
  const metal = matFn('#9ca4a8', 0.85, 0.34);
  const pinMat = matFn('#c8a95a', 0.92, 0.28);
  const darkMouth = matFn('#07090a', 0.1, 0.85);
  const steelShell = matFn('#8d969b', 0.88, 0.27);

  const block = (w, h, d, m = dark) => new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m);
  const put = (g, o, x = 0, y = 0, z = 0) => {
    o.position.set(x * S, y * S, z * S);
    g.add(o);
    return o;
  };
  const screw = (g, x, y, z, r = 2.3) => put(g, _paBuildScrew(matFn, r * S), x, y, z);
  const plate = (points, h, m = dark) => {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => (i ? shape.lineTo(x * S, -z * S) : shape.moveTo(x * S, -z * S)));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: h * S,
      bevelEnabled: true,
      bevelSize: 0.25 * S,
      bevelThickness: 0.2 * S,
      bevelSegments: 1,
      steps: 1,
    });
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, m);
  };
  const labelPlane = (g, text, x, y, z, wMm, color = '#939991', dMm = wMm * 0.28) => {
    const tex = makeLabelTexture(text, '', color, '#0e1115', false, 512, 144);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wMm * S, dMm * S),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    put(g, mesh, x, y, z);
  };
  const brandingPlane = (g, wMm, dMm, yMm, vertical = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const c = canvas.getContext('2d');
    const { marks, ink } = design;
    if (design.tuf) {
      c.strokeStyle = '#34393d';
      c.lineWidth = 2;
      for (let gx = 10; gx < 1004; gx += 28) {
        c.beginPath(); c.moveTo(gx, 12); c.lineTo(gx, 244); c.stroke();
      }
      for (let gz = 12; gz < 244; gz += 28) {
        c.beginPath(); c.moveTo(10, gz); c.lineTo(1004, gz); c.stroke();
      }
      c.fillStyle = '#0b0d10';
      c.fillRect(520, 12, 492, 232);
    } else {
      c.fillStyle = design.trim[0];
      c.fillRect(28, 200, 460, 8);
    }
    c.textAlign = 'left';
    if (vertical) {
      if (design.tuf) {
        c.fillStyle = '#0b0d10';
        c.fillRect(90, 72, 844, 112);
      }
      c.fillStyle = ink;
      c.font = '900 84px sans-serif';
      c.fillText(marks.io, 120, 160, 780);
    } else {
      c.fillStyle = ink;
      c.font = '900 175px sans-serif';
      c.fillText(marks.big, 540, 200, 215);
      c.font = '900 72px sans-serif';
      c.fillText(marks.small, 765, 115, 240);
      c.font = '700 24px sans-serif';
      c.fillText(marks.tag, 765, 175, 240);
    }
    c.strokeStyle = design.tuf ? '#a5a9a4' : design.trim[0];
    c.lineWidth = 4;
    c.strokeRect(10, 10, 1004, 236);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wMm * S, dMm * S),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    if (vertical) mesh.rotation.z = Math.PI / 2;
    put(g, mesh, 0, yMm, 0);
  };

  // Occupied millimeter AABB bounds for zero-collision capacitor/SMD placement
  const occupiedMm = [];
  const tmpBox = new THREE.Box3();
  const registerOccupied = (obj, padMm = 1.2) => {
    obj.updateWorldMatrix(true, true);
    tmpBox.setFromObject(obj);
    if (!tmpBox.isEmpty()) {
      occupiedMm.push({
        minX: tmpBox.min.x / S - padMm,
        maxX: tmpBox.max.x / S + padMm,
        minZ: tmpBox.min.z / S - padMm,
        maxZ: tmpBox.max.z / S + padMm,
      });
    }
  };
  const addPart = (o, x, y, z, reserve = true) => {
    put(boardRoot, o, x, y, z);
    if (reserve) registerOccupied(o, 1.2);
    return o;
  };

  // 1. PCB Laminate + Detailed Copper Trace Texture
  const bottomMm = isMiniItx ? 17.5 : micro ? 91.5 : 152.5;
  const boardW = isMiniItx ? 170 : 244;
  const boardH = 152.5 + bottomMm;
  const boardCenterX = isMiniItx ? -37 : 0; // Mini-ITX aligns top-left rear I/O (-122..+48)
  const boardCenterZ = (bottomMm - 152.5) / 2;

  const pcbGroup = new THREE.Group();
  const pcbMesh = new THREE.Mesh(
    new THREE.BoxGeometry(boardW * S, 2.2 * S, boardH * S),
    matFn('#0d1210', 0.14, 0.65)
  );
  pcbMesh.castShadow = true;
  pcbMesh.receiveShadow = true;
  pcbGroup.add(pcbMesh);

  const pcbTex = makeMotherboardPcbTexture(comp, theme, { w: boardW, h: boardH });
  const pcbFace = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW * 0.992 * S, boardH * 0.992 * S),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: pcbTex,
      roughness: 0.56,
      metalness: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  pcbFace.rotation.x = -Math.PI / 2;
  pcbFace.position.y = 1.15 * S;
  pcbFace.receiveShadow = true;
  pcbGroup.add(pcbFace);
  put(boardRoot, pcbGroup, boardCenterX, 0, boardCenterZ);

  // 2. Mounting Holes (exact pc-anatomy 3x3 registration)
  const mounts = isMiniItx
    ? [[-113, -145], [40, -145], [-113, 10], [40, 10]]
    : micro
      ? [[-113, -145], [43, -145], [114, -145], [-113, 10], [114, 10], [-113, 85], [24, 85], [114, 85]]
      : [[-113, -145], [43, -145], [114, -145], [-113, 10], [114, 10], [-113, 141], [42, 141], [114, 141]];
  for (const [mx, mz] of mounts) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5 * S, 0.75 * S, 6, 18), metal);
    ring.rotation.x = Math.PI / 2;
    put(boardRoot, ring, mx, 1.2, mz);
    put(boardRoot, new THREE.Mesh(new THREE.CylinderGeometry(2.4 * S, 2.4 * S, 0.3 * S, 14), dark), mx, 1.2, mz);
    occupiedMm.push({ minX: mx - 5.5, maxX: mx + 5.5, minZ: mz - 5.5, maxZ: mz + 5.5 });
  }

  // Hazard accent stripes on ATX TUF/ROG boards
  for (let i = 0; i < (design.tuf && !micro && !isMiniItx ? 6 : 0); i++) {
    const mark = block(1.8, 0.3, 14, matFn(i < 3 ? '#b48c28' : '#bb5423', 0.2, 0.5));
    mark.rotation.y = -0.45;
    put(boardRoot, mark, 119, 1.25, 81 + i * 4);
  }

  // 3. CPU Socket (exact pc-anatomy coordinates sx = +8, sz = -64; ITX shifts left slightly)
  const sx = isMiniItx ? -22 : 8;
  const sz = -64;
  const socket = new THREE.Group();
  put(socket, block(58, 3, 72, matFn('#25272a', 0.14, 0.6)));
  // Gold pin bed + center SMD island
  put(socket, block(40, 0.6, 40, pinMat), 0, 1.65, 0);
  put(socket, block(12, 0.8, 12, matFn('#1d2023', 0.12, 0.6)), 0, 1.75, 0);
  if (!intel) {
    for (const side of [-1, 1]) {
      put(socket, block(4, 2.4, 66, metal), side * 26, 4.1, 0);
      put(socket, block(48, 2.4, 8, metal), 0, 4.1, side * 29);
      put(socket, block(62, 5, 8), 0, 1.2, side * 45);
      for (const lx of [-24, 24]) screw(socket, lx, 5.5, side * 29, 2.6);
      for (const lx of [-27, 27]) screw(socket, lx, 4.4, side * 45, 3.2);
    }
    labelPlane(socket, 'AM5', 0, 5.5, 29, 16, '#848b8f');
  } else {
    for (const side of [-1, 1]) put(socket, block(5, 1.4, 54, metal), side * 21.5, 4.4, 0);
    put(socket, block(48, 1.4, 6, metal), 0, 4.4, -27);
    put(socket, block(30, 1.4, 6, metal), 0, 4.4, 27);
    put(socket, block(10, 1.2, 5, metal), 0, 4.4, 31.5);
    for (const hx of [-18, 18]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * S, 1.6 * S, 8 * S, 10), metal);
      hinge.rotation.z = Math.PI / 2;
      put(socket, hinge, hx, 4.6, -32);
    }
    for (const lx of [-25, 25]) for (const lz of [-31, 31]) screw(socket, lx, 3.6, lz, 2.4);
    labelPlane(socket, String(comp?.socket || 'LGA1700'), -10, 3.6, 33, 18, '#848b8f');
  }
  // Pin-1 Gold Corner Triangle indicator
  const pin1Tri = new THREE.Mesh(new THREE.ConeGeometry(2.8 * S, 1.8 * S, 3), matFn('#facc15', 0.2, 0.4));
  put(socket, pin1Tri, -22, 4.6, -24);
  addPart(socket, sx, 2.4, sz);

  // 4. DIMM Slots (exact pc-anatomy x = [63, 73, 83, 93], z = -58; 2-DIMM uses A2/B2 [73, 93])
  const dimmXs = isMiniItx ? [26, 36] : dimmCount === 2 ? [73, 93] : [63, 73, 83, 93];
  for (let i = 0; i < dimmXs.length; i++) {
    const dx = dimmXs[i];
    const slot = _paBuildSlot(matFn, 133 * S, '#1d2023', {
      width: 6.5 * S,
      height: 6 * S,
      notch: 0.46,
      latch: true,
      armour: i % 2 === 1,
      latchColor: '#34383b',
      skipRightEndClip: true, // Top clip is articulated directly via group.userData.dimmLatches
    });
    slot.rotation.y = Math.PI / 2;
    addPart(slot, dx, 4.0, -58);
  }

  // 5. VRM Phases (8 Top Chokes + MOSFETs + Caps, 10 Side Chokes + Caps)
  const vrm = new THREE.Group();
  const topVrmCount = isMiniItx ? 5 : 8;
  for (let i = 0; i < topVrmCount; i++) {
    const vx = -42 + i * 11;
    put(vrm, _paBuildChoke(matFn, 8 * S, 5 * S), vx, 3.6, -117);
    put(vrm, _paBuildChip(matFn, [6 * S, 1.8 * S, 6 * S], 4), vx, 2.0, -129);
    put(vrm, _paBuildCapacitor(matFn, 2.8 * S, 6 * S, '#202326'), vx, 4.0, -106);
  }
  const sideVrmCount = isMiniItx ? 6 : 10;
  for (let i = 0; i < sideVrmCount; i++) {
    const vz = -100 + i * 8.5;
    put(vrm, _paBuildChoke(matFn, 7 * S, 5 * S), -54, 3.6, vz);
    put(vrm, _paBuildCapacitor(matFn, 2.6 * S, 6 * S, '#202326'), -44, 4.0, vz);
  }
  put(boardRoot, vrm, 0, 0, 0);
  for (const child of vrm.children) registerOccupied(child, 1.0);

  // 6. Sculpted VRM Heatsinks (Maker Fin Style: blades / slats / block)
  const topSink = new THREE.Group();
  const sideSink = new THREE.Group();
  const topSinkW = isMiniItx ? 66 : 96;
  const sideSinkD = isMiniItx ? 74 : 113;
  if (design.fins === 'blades') {
    put(topSink, block(topSinkW, 5, 28), 0, 2.5, 0);
    const bladeCount = isMiniItx ? 3 : 5;
    for (let i = 0; i < bladeCount; i++) {
      const bx = -(bladeCount - 1) * 9.5 + i * 19;
      put(topSink, plate([[-9, -14], [9, -14], [9, 10], [6, 14], [-9, 14]], 9), bx, 5, 0);
      put(topSink, block(16, 0.7, 24, edge), bx, 14.5, 0);
    }
    put(sideSink, block(32, 5, sideSinkD), 0, 2.5, 0);
    const sCount = isMiniItx ? 3 : 5;
    for (let i = 0; i < sCount; i++) put(sideSink, block(32, 10, 20), 0, 10, -(sCount - 1) * 11 + i * 22);
  } else if (design.fins === 'slats') {
    put(topSink, block(topSinkW, 5, 28), 0, 2.5, 0);
    const slatCount = isMiniItx ? 10 : 15;
    for (let i = 0; i < slatCount; i++) put(topSink, block(2.2, 9.4, 26), -topSinkW / 2 + 4 + i * 6.3, 9.7, 0);
    put(topSink, block(topSinkW, 0.8, 3, edge), 0, 14.6, 12);
    put(sideSink, block(32, 5, sideSinkD), 0, 2.5, 0);
    const sSlatCount = isMiniItx ? 9 : 14;
    for (let i = 0; i < sSlatCount; i++) put(sideSink, block(30, 9.4, 2.2), 0, 9.7, -sideSinkD / 2 + 5 + i * 8);
    put(sideSink, block(3, 0.8, sideSinkD, edge), 14, 14.6, 0);
  } else {
    put(topSink, block(topSinkW, 14, 28), 0, 7, 0);
    for (let i = 0; i < 4; i++) put(topSink, block(topSinkW - 2, 0.5, 1.2, edge), 0, 14.1, -9 + i * 6);
    put(sideSink, block(32, 14, sideSinkD), 0, 7, 0);
    for (let i = 0; i < 4; i++) put(sideSink, block(1.2, 0.5, sideSinkD - 2, edge), -9 + i * 6, 14.1, 0);
  }
  addPart(topSink, isMiniItx ? -18 : 6, 7.8, -131);
  addPart(sideSink, -67, 7.8, isMiniItx ? -75 : -69);

  // 7. Chipset Heatsink (armour / plate / short / square) + Branding + Pan Screws
  const chipsetDefs = {
    armour: {
      outline: [[-90, -19], [91, -19], [95, -15], [95, 11], [85, 15], [-23, 15], [-34, 27], [-73, 27], [-90, 13]],
      chip: 54, marks: [171, 25], marksAt: 1, screws: [-80, 87], at: [6, 65],
    },
    plate: {
      outline: [[-90, -19], [91, -19], [95, -15], [95, 21], [-86, 21], [-90, 17]],
      chip: 54, marks: [171, 25], marksAt: 1, screws: [-80, 87], at: [6, 65],
    },
    short: {
      outline: [[-34, -19], [34, -19], [36, -17], [36, 15], [28, 19], [-26, 19], [-34, 11]],
      chip: 0, marks: [64, 22], marksAt: 0, screws: [-28, 30], at: [70, 65],
    },
    square: {
      outline: [[-22, -23], [20, -23], [22, -21], [22, 23], [-20, 23], [-22, 21]],
      chip: 0, marks: [40, 10], marksAt: 0, screws: [-16, 16], at: isMiniItx ? [20, -12] : [78, 66],
    },
  };
  const sinkKey = isMiniItx ? 'square' : design.chipset === 'square' ? 'square' : micro ? 'short' : design.chipset;
  const sink = chipsetDefs[sinkKey];
  const chipset = new THREE.Group();
  put(chipset, block(28, 2, 28, matFn('#202326', 0.12, 0.6)), sink.chip, 1, 0);
  put(chipset, plate(sink.outline, 5), 0, 4, 0);
  const csGraphic = new THREE.Group();
  brandingPlane(csGraphic, sink.marks[0], sink.marks[1], 9.35, false);
  put(chipset, csGraphic, sink.marksAt, 0, -2);
  screw(chipset, sink.screws[0], 10, -13, 2);
  screw(chipset, sink.screws[1], 10, 9, 2);
  addPart(chipset, sink.at[0], 1.2, sink.at[1]);

  // 8. Controller ICs, Audio Subsystem & CMOS Battery
  const addController = (text, cx, cz, size) => {
    const g = new THREE.Group();
    put(g, _paBuildChip(matFn, [size * S, 2 * S, size * S], 6, true));
    labelPlane(g, text, 0, 1.25, 0, size * 0.85, '#92978f');
    addPart(g, cx, 2, cz);
  };
  if (!isMiniItx) {
    addController('UEFI', 102, 28, 7);
    addController('LAN', -109, 30, 10);
    addController('IO', micro ? 86 : 92, micro ? 30 : 135, 11);
  } else {
    addController('UEFI', 22, -98, 7);
  }

  // Audio codec + gold audio caps in bottom-left
  const audio = new THREE.Group();
  const codecZ = isMiniItx || micro ? -6 : -10;
  put(audio, _paBuildChip(matFn, [12 * S, 2 * S, 12 * S], 7, true), 0, 1, codecZ);
  const audioCapRows = isMiniItx || micro ? 1 : 3;
  for (let row = 0; row < audioCapRows; row++) {
    for (const ax of [-5, 3]) {
      put(audio, _paBuildCapacitor(matFn, 2.8 * S, 7 * S, '#a78b4c'), ax, 4, (micro || isMiniItx ? 8 : 10) + row * 8);
    }
  }
  labelPlane(audio, 'AUDIO', 0, 2.35, codecZ, 10, '#939991');
  addPart(audio, -108, 1, isMiniItx ? -2 : micro ? 68 : 119);

  // CR2032 CMOS Coin Battery
  const battery = new THREE.Group();
  put(battery, new THREE.Mesh(new THREE.CylinderGeometry(11 * S, 11 * S, 3 * S, 24), dark));
  put(battery, new THREE.Mesh(new THREE.CylinderGeometry(9.8 * S, 9.8 * S, 2.8 * S, 24), metal), 0, 1, 0);
  put(battery, block(4, 0.8, 4, metal), -8.5, 2.7, 0);
  labelPlane(battery, '+ CR2032', 0, 2.6, 0, 16, '#cfd6dc');
  addPart(battery, isMiniItx ? -38 : micro ? -82 : -89, 3, isMiniItx ? -8 : micro ? 52 : 113);

  // 9. PCIe Expansion Slots (exact pc-anatomy: primary armored x16 at px=-31, pz=32)
  if (!isMiniItx) {
    const x16ZList = micro ? [32, 78] : design.tuf ? [32, 134] : [32, 93, 134];
    for (let i = 0; i < x16ZList.length; i++) {
      const pz = x16ZList[i];
      const slot = _paBuildSlot(matFn, 100 * S, '#202326', {
        width: 7.5 * S,
        height: 8 * S,
        notch: 0.14,
        latch: true,
        armour: i === 0,
        latchColor: '#3a3e42',
        latchEnds: 'right',
      });
      addPart(slot, -31, 5, pz);
    }
    const shortList = micro ? [{ z: 48, length: 20 }] : design.tuf ? [{ z: 59, length: 20 }, { z: 84, length: 20 }] : [];
    for (const { z, length } of shortList) {
      addPart(
        _paBuildSlot(matFn, length * S, '#202326', { width: 6 * S, height: 7 * S, notch: 0.2 }),
        length > 20 ? -81 + length / 2 : -108,
        4.5,
        z
      );
    }
  } else {
    addPart(
      _paBuildSlot(matFn, 92 * S, '#202326', { width: 7.5 * S, height: 8 * S, notch: 0.14, latch: true, armour: true, latchEnds: 'right' }),
      -34,
      5,
      8
    );
  }

  // 10. M.2 Slots: M2_1 OPEN at (-10, 11) for visible draggable NVMe installation; M2_2 with sculpted heatsink
  if (m2Count >= 1 && !isMiniItx) {
    const socketM2 = new THREE.Group();
    put(socketM2, block(4, 3, 22), -41, 0, 0);
    put(socketM2, block(1, 0.6, 19, pinMat), -39, 1.5, 0);
    put(socketM2, block(68, 0.5, 16, matFn('#2563eb', 0.1, 0.7)), 0, -1.2, 0); // Thermal pad strip
    screw(socketM2, 39, 2, 0, 2);
    addPart(socketM2, -10, 2.8, 11);
  }
  if (m2Count >= 2 && !isMiniItx) {
    const [z2, x2, w2, d2] = micro ? [55, -19, 100, 20] : [114, 19, 174, 22];
    const socketM2b = new THREE.Group();
    put(socketM2b, block(4, 3, 22), -41, 0, 0);
    screw(socketM2b, 39, 2, 0, 2);
    addPart(socketM2b, x2, 2.8, z2);

    const cover = new THREE.Group();
    put(
      cover,
      plate(
        [[-w2 / 2, -d2 / 2], [w2 / 2 - 4, -d2 / 2], [w2 / 2, -d2 / 2 + 4], [w2 / 2, d2 / 2], [-w2 / 2 + 4, d2 / 2], [-w2 / 2, d2 / 2 - 4]],
        4
      )
    );
    screw(cover, -w2 / 2 + 6, 4.8, 0);
    screw(cover, w2 / 2 - 6, 4.8, 0);
    if (design.tuf) {
      for (let j = 0; j < 4; j++) {
        const slash = block(6, 0.2, 1, edge);
        slash.rotation.y = -0.6;
        put(cover, slash, w2 / 2 - 18 - j * 4, 4.3, 2);
      }
    } else {
      put(cover, block(w2 - 14, 0.2, 1.4, edge), 0, 4.3, d2 / 2 - 3);
    }
    addPart(cover, x2, 5.0, z2);
  }

  // 11. Power Sockets, SATA Ports, Front Panel & Fan Headers (synced to ComponentManager._getPortWorldCoords)
  const buildPowerSocket = (columns) => {
    const g = new THREE.Group();
    const pitch = 4.2;
    put(g, block(columns * pitch + 1, 8, 9.6));
    const holeMat = matFn('#060708', 0.1, 0.8);
    for (let cx = 0; cx < columns; cx++) {
      for (const cz of [-2.1, 2.1]) {
        put(g, block(3.2, 0.2, 3.2, holeMat), (cx - (columns - 1) / 2) * pitch, 4.15, cz);
        put(g, block(0.7, 0.22, 0.7, metal), (cx - (columns - 1) / 2) * pitch, 4.27, cz);
      }
    }
    return g;
  };
  const atx24 = buildPowerSocket(12);
  atx24.rotation.y = Math.PI / 2;
  addPart(atx24, isMiniItx ? 42 : 115, 5, isMiniItx ? -42 : -45);

  for (const ex of isMiniItx ? [-64] : [-73, -52]) {
    addPart(buildPowerSocket(4), ex, 5, -145);
  }
  if (!isMiniItx) {
    for (let i = 0; i < 4; i++) {
      const sata = new THREE.Group();
      put(sata, block(13, 9, 7));
      put(sata, block(0.2, 4, 5, matFn('#080a0b', 0.1, 0.8)), 6.6, 0, 0);
      put(sata, block(0.25, 0.6, 4, pinMat), 6.75, -1.2, 0);
      addPart(sata, 114, 5.5, 43 + i * 9);
    }
    const frontList = micro ? [[-75, 5], [-33, 5], [9, 4], [47, 4]] : [[-71, 5], [-27, 5], [19, 4], [76, 4]];
    const frontZ = micro ? 87 : 147;
    for (const [fx, count] of frontList) {
      addPart(_paBuildHeader(matFn, count, 2, 2.54 * S, '#202326', 6 * S), fx, 4, frontZ);
    }
    const fanList = micro ? [[68, -141], [87, -141], [114, -90], [88, 87]] : [[68, -141], [87, -141], [114, -90], [113, 95], [-49, 147], [48, 149]];
    for (const [fx, fz] of fanList) {
      addPart(_paBuildHeader(matFn, 4, 1, 2.54 * S, '#292c2e', 6 * S), fx, 4, fz);
    }
  }

  // 12. Integrated Rear I/O Armor + Detailed Connector Stack (Wi-Fi, BIOS, HDMI/DP, USB-A/C, 2.5GbE, Audio)
  const io = new THREE.Group();
  put(io, block(1, 2, 151), -17, 1, 0);
  put(io, plate([[-17, -76], [7, -76], [15, -65], [15, 72], [-17, 72]], 3), 0, 30, 0);
  put(io, block(2, 24, 144), 14, 16.5, 0);
  const ioArt = new THREE.Group();
  brandingPlane(ioArt, 107, 26, 33.4, true);
  put(io, ioArt, -1, 0, 4);

  const FACE = -20;
  const STACK_SHIFT = 12;
  const ioConn = (cz, cy, depth, buildFn) => {
    const g = new THREE.Group();
    buildFn(g);
    put(io, g, FACE + depth / 2, cy, cz + STACK_SHIFT);
  };
  const ioJack = (cz, cy, wMm, hMm, depth, tongueColor) =>
    ioConn(cz, cy, depth, (g) => {
      put(g, new THREE.Mesh(new THREE.BoxGeometry(depth * S, hMm * S, wMm * S), steelShell));
      put(g, new THREE.Mesh(new THREE.BoxGeometry(depth * 0.4 * S, hMm * 0.72 * S, wMm * 0.84 * S), darkMouth), -depth * 0.31, 0, 0);
      put(g, new THREE.Mesh(new THREE.BoxGeometry(depth * 0.36 * S, hMm * 0.2 * S, wMm * 0.62 * S), matFn(tongueColor, 0.3, 0.6)), -depth * 0.33, -hMm * 0.1, 0);
    });
  const usbA = (cz, cy) => ioJack(cz, cy, 14.5, 7, 14, '#2a4fa0');
  const usbC = (cz, cy) => ioJack(cz, cy, 9, 3.6, 9, '#1a1d1f');

  // Wi-Fi dual threaded gold posts
  ioConn(-68, 16, 9, (g) => {
    put(g, block(4, 24, 8, matFn('#16191b', 0.1, 0.6)), 2.5, 0, 0);
    const wifiGold = matFn('#c9a456', 0.9, 0.3);
    for (const wy of [-6.0, 6.0]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(3.1 * S, 3.1 * S, 9 * S, 12), wifiGold);
      post.rotation.z = Math.PI / 2;
      put(g, post, -1.5, wy, 0);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * S, 1.1 * S, 1 * S, 8), darkMouth);
      pin.rotation.z = Math.PI / 2;
      put(g, pin, -6.1, wy, 0);
    }
  });
  // BIOS flashback + Clear CMOS buttons
  ioConn(-55, 11, 8, (g) => {
    put(g, block(8, 16, 9, matFn('#16191b', 0.1, 0.6)), 0, 0, 0);
    put(g, block(2, 4.5, 4.5, matFn('#d0d4d6', 0.1, 0.5)), -4.8, 3.5, 0);
    put(g, block(2, 4.5, 4.5, matFn('#b8342c', 0.1, 0.5)), -4.8, -3.5, 0);
  });
  // Display outputs + USB stacks + 2.5GbE LAN + Color-coded Audio Jacks
  ioJack(-41, 8, 15, 6, 12, '#101213');
  ioJack(-41, 17, 16, 6.5, 12, '#101213');
  usbA(-24, 6); usbA(-24, 15); usbC(-24, 22.5);
  usbA(-6, 6); usbA(-6, 15); usbC(-6, 22.5);
  usbA(12, 6); usbA(12, 14.5);
  ioConn(12, 24.5, 21, (g) => {
    put(g, new THREE.Mesh(new THREE.BoxGeometry(21 * S, 12 * S, 16 * S), steelShell));
    put(g, block(8, 8.5, 12, darkMouth), -7, 0, 0);
    put(g, block(0.6, 2, 3, new THREE.MeshBasicMaterial({ color: 0x3fd46a })), -10.6, 4.6, -5.5);
    put(g, block(0.6, 2, 3, new THREE.MeshBasicMaterial({ color: 0xf2a93b })), -10.6, 4.6, 5.5);
  });
  usbA(30, 6); usbA(30, 15); usbC(30, 22.5);
  ioConn(51, 14, 14, (g) => {
    put(g, block(14, 24, 13, matFn('#16191b', 0.1, 0.6)), 0, 0, 0);
    for (const [ay, col] of [[6.5, '#6cc04a'], [-2, '#e07aa6']]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * S, 3.2 * S, 1 * S, 14), matFn(col, 0.1, 0.5));
      ring.rotation.z = Math.PI / 2;
      put(g, ring, -7.2, ay, 0);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.7 * S, 1.7 * S, 1.2 * S, 10), darkMouth);
      hole.rotation.z = Math.PI / 2;
      put(g, hole, -7.4, ay, 0);
    }
    put(g, block(1, 4.5, 6.5, matFn('#2a2d30', 0.1, 0.5)), -7.2, -8.5, 0);
  });
  addPart(io, -104, 1.2, -76);

  // 13. Box3 Keepout Guard (`free`) + Batched Solid Capacitors & Dense SMD Passives (ZERO collisions!)
  const minXMm = boardCenterX - boardW / 2;
  const maxXMm = boardCenterX + boardW / 2;
  const minZMm = -152.5;
  const maxZMm = bottomMm;
  const isFreeMm = (px, pz, pad = 1.4) => {
    if (px < minXMm + 2.5 + pad || px > maxXMm - 2.5 - pad || pz < minZMm + 2.5 + pad || pz > maxZMm - 2.5 - pad) {
      return false;
    }
    for (let i = 0; i < occupiedMm.length; i++) {
      const b = occupiedMm[i];
      if (px + pad > b.minX && px - pad < b.maxX && pz + pad > b.minZ && pz - pad < b.maxZ) {
        return false;
      }
    }
    return true;
  };

  for (const [cx, cz] of [[104, -118], [104, -108], [104, -98], [69, 95], [87, 95], [105, 124]]) {
    if (!isFreeMm(cx, cz, 3.5)) continue;
    const c = _paBuildCapacitor(matFn, 2.8 * S, 6 * S, '#25272a');
    addPart(c, cx, 4.0, cz);
  }

  // Merged SMD resistor & capacitor passives (keeps draw calls fast!)
  const smdTanGeos = [];
  const smdDarkGeos = [];
  const smdEndGeos = [];
  const maxRows = Math.floor((maxZMm - minZMm) / 4);
  const maxCols = Math.floor((maxXMm - minXMm) / 4);
  for (let row = 1; row < maxRows; row++) {
    for (let col = 1; col < maxCols; col++) {
      const n = (row * 73 + col * 137) % 17;
      if (n > 9) continue;
      const px = minXMm + col * 4;
      const pz = minZMm + row * 4;
      if (!isFreeMm(px, pz, 1.8)) continue;
      const bodyGeo = new THREE.BoxGeometry(1.7 * S, 0.8 * S, 0.9 * S);
      bodyGeo.translate(px * S, 1.4 * S, pz * S);
      if (n % 3) smdTanGeos.push(bodyGeo);
      else smdDarkGeos.push(bodyGeo);
      for (const side of [-1, 1]) {
        const capGeo = new THREE.BoxGeometry(0.4 * S, 0.85 * S, 1.0 * S);
        capGeo.translate((px + side) * S, 1.4 * S, pz * S);
        smdEndGeos.push(capGeo);
      }
    }
  }
  if (smdTanGeos.length) boardRoot.add(new THREE.Mesh(safeMerge(smdTanGeos), matFn('#777368', 0.15, 0.8)));
  if (smdDarkGeos.length) boardRoot.add(new THREE.Mesh(safeMerge(smdDarkGeos), matFn('#25272a', 0.15, 0.8)));
  if (smdEndGeos.length) boardRoot.add(new THREE.Mesh(safeMerge(smdEndGeos), metal));

  // Rotate pc-anatomy XZ-plane boardRoot by +90° around X -> our vertical (+X, +Y, +Z) MB space
  boardRoot.rotation.x = Math.PI / 2;

  // 14. Articulated CPU Socket Retention Lever (MUST preserve userData.cpuLeverPivot & fastenerTargetSlot = 'cpu')
  const cpuLeverPivot = new THREE.Group();
  cpuLeverPivot.position.set(sx * S + 0.275, -sz * S - 0.30, 0.042);
  const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.60, 10), metal);
  leverArm.position.set(0, 0.30, 0);
  const leverHook = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.03), metal);
  leverHook.position.set(-0.04, 0.60, 0);
  const leverGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.09, 10), darkMouth);
  leverGrip.position.set(0, 0.56, 0);
  leverArm.userData.fastenerTargetSlot = 'cpu';
  leverHook.userData.fastenerTargetSlot = 'cpu';
  leverGrip.userData.fastenerTargetSlot = 'cpu';
  cpuLeverPivot.add(leverArm, leverHook, leverGrip);
  group.add(cpuLeverPivot);
  group.userData.cpuLeverPivot = cpuLeverPivot;

  // 15. Articulated Top DIMM Retention Latches (MUST preserve userData.dimmLatches & fastenerTargetSlot = 'ram')
  const dimmLatches = [];
  const latchMat = matFn('#cbd5e1', 0.38, 0.4);
  for (const dxMm of dimmXs) {
    const topClip = new THREE.Group();
    topClip.position.set(dxMm * S, 0.58 + 0.675, 0.045);
    const clipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.075, 0.065), latchMat);
    clipMesh.position.set(0, 0.028, 0.02);
    clipMesh.userData.fastenerTargetSlot = 'ram';
    topClip.add(clipMesh);
    group.add(topClip);
    dimmLatches.push(topClip);
  }
  group.userData.dimmLatches = dimmLatches;

  // 16. Motherboard Standoff Screws (MUST preserve userData.fastenerScrews)
  const mbScrews = [];
  const mbScrewGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10);
  mbScrewGeo.rotateX(Math.PI / 2);
  for (const [mx, mz] of mounts) {
    const sc = new THREE.Mesh(mbScrewGeo, metal);
    sc.position.set(mx * S, -mz * S, 0.028);
    sc.visible = false;
    group.add(sc);
    mbScrews.push(sc);
  }
  group.userData.fastenerScrews = mbScrews;

  return group;
}

// ---------------------------------------------------------------------------
// 3. CPU (Notched Substrate, SMD Caps, Octopus/Stepped Nickel IHS, LGA/PGA Underside)
// ---------------------------------------------------------------------------

export function createCpuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 40, h: 42, d: 6 };
  const w = Math.max(0.38, dims.w * S);
  const h = Math.max(0.40, dims.h * S);
  const isAm5 = String(comp?.socket || '').toUpperCase().includes('AM5');

  const group = new THREE.Group();
  group.name = `Hardware_cpu_${comp?.id || 'cpu'}`;

  // 1. Multi-layer Fiberglass Substrate PCB
  const subMat = new THREE.MeshStandardMaterial({ color: 0x0c4a34, roughness: 0.52, metalness: 0.18 });
  const substrate = new THREE.Mesh(makeExtrudedBox(w, h, 0.024, 0.012, 0.003), subMat);
  substrate.castShadow = true;
  group.add(substrate);

  // Perimeter SMD decoupling capacitors on substrate surface (signature AM5 detail)
  const capMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.35, metalness: 0.55 });
  const smdGeos = [];
  for (const [sx, sy] of [
    [-w * 0.36, -h * 0.20], [-w * 0.36, 0], [-w * 0.36, h * 0.20],
    [w * 0.36, -h * 0.20], [w * 0.36, 0], [w * 0.36, h * 0.20],
    [-w * 0.16, -h * 0.36], [w * 0.16, -h * 0.36],
  ]) {
    const s = new THREE.BoxGeometry(0.022, 0.014, 0.01);
    s.translate(sx, sy, 0.016);
    smdGeos.push(s);
  }
  group.add(new THREE.Mesh(safeMerge(smdGeos), capMat));

  // 2. Underside Gold Contact Pad / PGA Pin Array Texture (visible in 3D Inspector flip!)
  const padMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const bottomTex = makeCpuBottomTexture(comp);
  const bottomPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, h * 0.94),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: bottomTex, roughness: 0.28, metalness: 0.85 })
  );
  bottomPlate.rotation.y = Math.PI;
  bottomPlate.position.z = -0.014;
  group.add(bottomPlate);

  // 3. Sculpted Stepped Nickel-Plated Copper IHS (AM5 cruciform octopus OR Intel/AM4 stepped)
  const brushedBump = makeBrushedMetalBumpTexture();
  const ihsTex = makeLabelTexture(
    comp?.brand || 'CPU',
    comp?.model || comp?.socket || '',
    '#facc15',
    '#94a3b8',
    true
  );
  const ihsTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ihsTex,
    roughness: 0.24,
    metalness: 0.80,
    bumpMap: brushedBump,
    bumpScale: 0.003,
  });
  const nickelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.88,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });

  if (isAm5) {
    // Lower octagonal/cruciform base flange + upper laser-etched IHS crown
    const crossH = new THREE.BoxGeometry(w * 0.88, h * 0.32, 0.014);
    crossH.translate(0, 0, 0.018);
    const crossV = new THREE.BoxGeometry(w * 0.32, h * 0.88, 0.014);
    crossV.translate(0, 0, 0.018);
    const legs = new THREE.Mesh(safeMerge([crossH, crossV]), nickelMat);
    group.add(legs);
  } else {
    // Stepped lower IHS lip
    const lip = new THREE.Mesh(makeExtrudedBox(w * 0.90, h * 0.90, 0.014, 0.015, 0.003), nickelMat);
    lip.position.z = 0.018;
    group.add(lip);
  }

  const ihsCrown = new THREE.Mesh(makeExtrudedBox(w * 0.78, h * 0.78, 0.026, 0.018, 0.004), nickelMat);
  ihsCrown.position.z = 0.032;
  ihsCrown.castShadow = true;
  group.add(ihsCrown);

  const ihsFace = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.74, h * 0.74), ihsTopMat);
  ihsFace.position.z = 0.0475;
  group.add(ihsFace);

  // 4. Physical 3D Gold Pin-1 Corner Triangle (-X, +Y)
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.026, 3), padMat);
  tri.rotation.x = Math.PI / 2;
  tri.position.set(-w * 0.40, h * 0.40, 0.036);
  group.add(tri);

  return group;
}

// ---------------------------------------------------------------------------
// 4. CPU Cooler (Low-Profile Radial, Single Tower, & Dual-Tower Heatpipe Stacks)
// ---------------------------------------------------------------------------

export function createCoolerModel(comp) {
  const dims = comp?.dimensionsMm || { w: 124, h: 155, d: 96 };
  const isLowProfile = comp?.coolerType === 'low_profile' || dims.h < 95;
  const isDualTower = comp?.coolerType === 'dual_tower';
  const depthOut = Math.min(1.68, dims.h * S); // Protrudes along +Z from socket

  const group = new THREE.Group();
  group.name = `Hardware_cooler_${comp?.id || 'cooler'}`;
  const fanRotors = [];
  const brushedBump = makeBrushedMetalBumpTexture();

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xc86b3c,
    roughness: 0.25,
    metalness: 0.90,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.30,
    metalness: 0.85,
    bumpMap: brushedBump,
    bumpScale: 0.003,
  });
  const shroudMat = new THREE.MeshStandardMaterial({ color: 0x161d29, roughness: 0.55, metalness: 0.35 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.22, metalness: 0.9 });

  // 1. Machined Copper Coldplate + Retention Crossbar & Spring Screws
  const coldPlate = new THREE.Mesh(makeExtrudedBox(0.46, 0.46, 0.075, 0.02, 0.008), copperMat);
  coldPlate.position.set(0, 0, 0.04);
  group.add(coldPlate);

  const bracket = new THREE.Mesh(makeExtrudedBox(0.84, 0.14, 0.032, 0.01, 0.004), silverMat);
  bracket.position.set(0, 0, 0.045);
  group.add(bracket);

  for (const sx of [-0.36, 0.36]) {
    const spScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.11, 12), silverMat);
    spScrew.rotation.x = Math.PI / 2;
    spScrew.position.set(sx, 0, 0.08);
    group.add(spScrew);
  }

  if (isLowProfile) {
    // Radial Aluminum Fin Petals (28 fins merged cleanly) around copper core
    const petalGeos = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const fin = new THREE.BoxGeometry(0.28, 0.014, 0.32);
      fin.translate(0.28, 0, 0.24);
      fin.rotateZ(a);
      petalGeos.push(fin);
    }
    const radialMesh = new THREE.Mesh(safeMerge(petalGeos), finMat);
    radialMesh.castShadow = true;
    group.add(radialMesh);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 18), copperMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0, 0.24);
    group.add(core);

    const fanHousing = _makeFanAssembly(0.88, shroudMat, fanRotors, { depth: 0.20, showStruts: true });
    fanHousing.position.set(0, 0, 0.50);
    group.add(fanHousing);
  } else if (isDualTower) {
    // Dual-Tower Heatsink (Noctua NH-D15 style: 6 copper heatpipes, twin merged 20-fin stacks, top caps, dual fans)
    const dualCapGeos = [];
    for (const py of [-0.22, -0.13, -0.04, 0.04, 0.13, 0.22]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.34, py, depthOut + 0.015),
        new THREE.Vector3(-0.34, py, 0.36),
        new THREE.Vector3(-0.18, py, 0.07),
        new THREE.Vector3(0.18, py, 0.07),
        new THREE.Vector3(0.34, py, 0.36),
        new THREE.Vector3(0.34, py, depthOut + 0.015),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.022, 8, false), copperMat));

      for (const tx of [-0.34, 0.34]) {
        const cap = new THREE.CylinderGeometry(0.026, 0.026, 0.032, 10);
        cap.rotateX(Math.PI / 2);
        cap.translate(tx, py, depthOut + 0.018);
        dualCapGeos.push(cap);
      }
    }

    const finCount = 20;
    const finSpanZ = depthOut - 0.44;
    const towerGeos = [];
    for (const tx of [-0.34, 0.34]) {
      for (let i = 0; i < finCount; i++) {
        const z = 0.34 + (i / (finCount - 1)) * finSpanZ;
        const fin = new THREE.BoxGeometry(0.44, 1.14, 0.015);
        fin.translate(tx, 0, z);
        towerGeos.push(fin);
      }
      const capPlate = new THREE.Mesh(makeExtrudedBox(0.46, 1.16, 0.032, 0.018, 0.005), shroudMat);
      capPlate.position.set(tx, 0, depthOut - 0.01);
      group.add(capPlate);
    }
    const mergedFins = new THREE.Mesh(safeMerge(towerGeos), finMat);
    mergedFins.castShadow = true;
    group.add(mergedFins);
    group.add(new THREE.Mesh(safeMerge(dualCapGeos), copperMat));

    // Dual 120mm Fans (Center & Front)
    const centerFan = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0xd97706 });
    centerFan.rotation.y = Math.PI / 2;
    centerFan.position.set(0.0, 0, depthOut * 0.58);
    const frontFan = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0xd97706 });
    frontFan.rotation.y = Math.PI / 2;
    frontFan.position.set(0.70, 0, depthOut * 0.58);
    group.add(centerFan, frontFan);
  } else {
    // Single-Tower Heatsink (DeepCool AK400 style: 4 U-heatpipes + 24 merged aluminum fins + top cap + heatpipe tips)
    const capGeos = [];
    for (const py of [-0.16, -0.055, 0.055, 0.16]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.22, py, depthOut + 0.02),
        new THREE.Vector3(-0.22, py, 0.34),
        new THREE.Vector3(0, py, 0.065),
        new THREE.Vector3(0.22, py, 0.34),
        new THREE.Vector3(0.22, py, depthOut + 0.02),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.024, 8, false), copperMat));

      for (const sx of [-0.22, 0.22]) {
        const cap = new THREE.CylinderGeometry(0.028, 0.028, 0.036, 10);
        cap.rotateX(Math.PI / 2);
        cap.translate(sx, py, depthOut + 0.022);
        capGeos.push(cap);
      }
    }

    const finCount = 24;
    const finSpanZ = depthOut - 0.34;
    const finGeos = [];
    for (let i = 0; i < finCount; i++) {
      const fz = 0.28 + (i / (finCount - 1)) * finSpanZ;
      const f = new THREE.BoxGeometry(0.68, 1.08, 0.015);
      f.translate(0, 0, fz);
      finGeos.push(f);
    }
    const finStack = new THREE.Mesh(safeMerge(finGeos), finMat);
    finStack.castShadow = true;
    group.add(finStack);

    // Top anodized brushed cap plate + protruding metallic heatpipe end-caps
    const topCap = new THREE.Mesh(makeExtrudedBox(0.70, 1.10, 0.038, 0.02, 0.006), shroudMat);
    topCap.position.set(0, 0, depthOut);
    group.add(topCap);
    group.add(new THREE.Mesh(safeMerge(capGeos), copperMat));

    // Side-mounted 120mm PWM Fan pushing toward rear (-X) + stainless wire clips
    const fanAssembly = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0x06b6d4 });
    fanAssembly.rotation.y = Math.PI / 2;
    fanAssembly.position.set(0.46, 0, depthOut * 0.58);
    group.add(fanAssembly);
  }

  group.userData.fanRotors = fanRotors;
  return group;
}

// ---------------------------------------------------------------------------
// 5. RAM (Exposed DRAM ICs, Notched 288-Pin Gold Fingers, Beveled Heatspreader, RGB Spine)
// ---------------------------------------------------------------------------

export function createRamModel(comp) {
  const sticks = Math.min(2, Math.max(1, Number(comp?.sticks || 1)));
  const dims = comp?.dimensionsMm || { w: 133.3, h: 42, d: 7 };
  const length = dims.w * S;
  const heightOut = dims.h * S;
  const isDdr5 = String(comp?.ram_type || comp?.memType || '').toUpperCase().includes('5');
  const brushedBump = makeBrushedMetalBumpTexture();

  const group = new THREE.Group();
  group.name = `Hardware_ram_${comp?.id || 'ram'}`;

  const spreaderMat = new THREE.MeshStandardMaterial({
    color: isDdr5 ? 0x1e293b : 0x262626,
    roughness: 0.28,
    metalness: 0.78,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isDdr5 ? 0x38bdf8 : 0xef4444,
    emissive: isDdr5 ? 0x0284c7 : 0x991b1b,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.2,
  });
  const goldTex = makeGoldFingersTexture(72, 0.38);
  const fingersMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: goldTex,
    roughness: 0.24,
    metalness: 0.88,
  });
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.65, metalness: 0.1 });
  const icMat = new THREE.MeshStandardMaterial({ color: 0x171c26, roughness: 0.5, metalness: 0.2 });

  const badgeTex = makeLabelTexture(
    comp?.brand || (isDdr5 ? 'DDR5' : 'DDR4'),
    `${comp?.speed_mhz || (isDdr5 ? 5600 : 3200)} MHz`,
    isDdr5 ? '#38bdf8' : '#ef4444',
    '#111827',
    false,
    512,
    128
  );
  const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: badgeTex, roughness: 0.38 });

  for (let i = 0; i < sticks; i++) {
    const stick = new THREE.Group();
    // Aligned with pc-anatomy 4-slot spacing (0.63, 0.73, 0.83, 0.93) relative to anchor x = 0.78 (A2 & B2!)
    const xOffset = sticks === 2 ? (i === 0 ? -0.05 : 0.15) : -0.05;

    // 1. Internal PCB Blade + Visible Lower DRAM IC Band
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.018, length, heightOut * 0.78), pcbMat);
    pcb.position.z = heightOut * 0.42;
    stick.add(pcb);

    // 8x Exposed FBGA DRAM Chips visible above the gold edge fingers!
    const icGeos = [];
    for (let c = 0; c < 8; c++) {
      const cy = -length * 0.40 + c * (length * 0.114);
      const icL = new THREE.BoxGeometry(0.028, length * 0.075, heightOut * 0.16);
      icL.translate(0, cy, heightOut * 0.18);
      icGeos.push(icL);
    }
    stick.add(new THREE.Mesh(safeMerge(icGeos), icMat));

    // 2. Sculpted Chamfered Aluminum Heatspreader Upper Body
    const body = new THREE.Mesh(makeExtrudedBox(0.068, length, heightOut * 0.68, 0.015, 0.008), spreaderMat);
    body.position.z = heightOut * 0.56;
    body.castShadow = true;
    stick.add(body);

    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.64, heightOut * 0.34), badgeMat);
    sticker.rotation.y = Math.PI / 2;
    sticker.rotation.z = Math.PI / 2;
    sticker.position.set(0.036, 0, heightOut * 0.56);
    stick.add(sticker);

    // 3. Diffused Top RGB / Anodized Spine Bar
    const topBar = new THREE.Mesh(makeExtrudedBox(0.052, length * 0.96, 0.054, 0.01, 0.005), accentMat);
    topBar.position.z = heightOut * 0.91;
    stick.add(topBar);

    // 4. Asymmetric Keyed 288-Pin Gold Edge Connector (split around physical key notch!)
    const upperPins = new THREE.Mesh(new THREE.BoxGeometry(0.022, length * 0.53, 0.062), fingersMat);
    upperPins.position.set(0, length * 0.215, 0.03);
    const lowerPins = new THREE.Mesh(new THREE.BoxGeometry(0.022, length * 0.37, 0.062), fingersMat);
    lowerPins.position.set(0, -length * 0.295, 0.03);
    const notchGap = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.048, 0.045), pcbMat);
    notchGap.position.set(0, -length * 0.08, 0.035);
    stick.add(upperPins, lowerPins, notchGap);

    stick.position.x = xOffset;
    group.add(stick);
  }

  return group;
}

// ---------------------------------------------------------------------------
// 6. GPU (Exposed Fin Stack, Curved Heatpipes, Cutout Shroud, Swept Axial Fans,
//    Vented Backplate with Die X-Clamp, Rear Display Ports & PCIe Gold Fingers)
// ---------------------------------------------------------------------------

export function createGpuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 268, h: 118, d: 42 };
  const len = dims.w * S;
  const depthZ = dims.h * S;
  const thickY = dims.d * S;
  const fanCount = len >= 2.9 ? 3 : 2;

  const group = new THREE.Group();
  group.name = `Hardware_gpu_${comp?.id || 'gpu'}`;
  const fanRotors = [];
  const brushedBump = makeBrushedMetalBumpTexture();

  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0x1b2331,
    roughness: 0.42,
    metalness: 0.55,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const backplateMat = new THREE.MeshStandardMaterial({
    color: 0x131a26,
    roughness: 0.30,
    metalness: 0.78,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xbac4d1, roughness: 0.34, metalness: 0.86 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xc86b3c, roughness: 0.25, metalness: 0.90 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ed, roughness: 0.24, metalness: 0.90 });
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.65, metalness: 0.14 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGoldFingersTexture(84, 0.22),
    roughness: 0.22,
    metalness: 0.9,
  });

  const centerShiftX = (len - 2.0) * 0.5;

  // 1. Packed Multi-Fin Aluminum Heatsink Array (42 crisp fins merged into 1 geometry!)
  const finCount = 42;
  const finSpanX = len * 0.91;
  const finGeos = [];
  for (let i = 0; i < finCount; i++) {
    const fx = centerShiftX - finSpanX * 0.5 + (i / (finCount - 1)) * finSpanX;
    const fg = new THREE.BoxGeometry(0.016, thickY * 0.68, depthZ * 0.84);
    fg.translate(fx, -thickY * 0.04, depthZ * 0.48);
    finGeos.push(fg);
  }
  const heatsink = new THREE.Mesh(safeMerge(finGeos), finMat);
  heatsink.castShadow = true;
  group.add(heatsink);

  // 2. 4 Curved Copper/Nickel Heatpipes running lengthwise through the heatsink stack
  for (const [hz, hy] of [
    [depthZ * 0.22, 0.02],
    [depthZ * 0.42, -0.02],
    [depthZ * 0.65, -0.02],
    [depthZ * 0.84, 0.02],
  ]) {
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(centerShiftX - len * 0.44, hy, hz),
      new THREE.Vector3(centerShiftX - len * 0.12, 0.04, depthZ * 0.48),
      new THREE.Vector3(centerShiftX + len * 0.14, 0.04, depthZ * 0.48),
      new THREE.Vector3(centerShiftX + len * 0.44, hy, hz),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 16, 0.022, 8, false), copperMat));
  }

  // 3. Internal Matte PCB Layer + Visible VRAM Chips + Gold PCIe x16 Edge Fingers
  const gpuPcb = new THREE.Mesh(new THREE.BoxGeometry(len * 0.72, 0.024, depthZ * 0.90), pcbMat);
  gpuPcb.position.set(centerShiftX - len * 0.11, thickY * 0.34, depthZ * 0.46);
  group.add(gpuPcb);

  const pcieFingers = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.032, 0.095), goldMat);
  pcieFingers.position.set(0.0, 0.0, 0.0);
  group.add(pcieFingers);

  // 4. Vented Metal Backplate + Exposed Die Cutout & Silver X-Clamp Spring Bracket
  const bpShape = makeRoundedRectShape(len, depthZ, 0.03);
  // Flow-through cooling vent on right +X tail
  const ventCut = new THREE.Path();
  ventCut.moveTo(len * 0.18, -depthZ * 0.32);
  ventCut.lineTo(len * 0.44, -depthZ * 0.32);
  ventCut.lineTo(len * 0.44, depthZ * 0.32);
  ventCut.lineTo(len * 0.18, depthZ * 0.32);
  ventCut.closePath();
  bpShape.holes.push(ventCut);

  // GPU core rear X-clamp inspection window
  const coreCut = new THREE.Path();
  coreCut.moveTo(-len * 0.24, -0.14);
  coreCut.lineTo(-len * 0.04, -0.14);
  coreCut.lineTo(-len * 0.04, 0.14);
  coreCut.lineTo(-len * 0.24, 0.14);
  coreCut.closePath();
  bpShape.holes.push(coreCut);

  const bpGeo = new THREE.ExtrudeGeometry(bpShape, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
  bpGeo.center();
  bpGeo.rotateX(Math.PI / 2);
  const backplate = new THREE.Mesh(bpGeo, backplateMat);
  backplate.position.set(centerShiftX, thickY * 0.48, depthZ * 0.5);
  group.add(backplate);

  // Silver X-Clamp bracket visible inside core backplate cutout
  const xBar1 = new THREE.BoxGeometry(0.24, 0.015, 0.035);
  xBar1.rotateY(Math.PI / 4);
  const xBar2 = new THREE.BoxGeometry(0.24, 0.015, 0.035);
  xBar2.rotateY(-Math.PI / 4);
  const xClamp = new THREE.Mesh(safeMerge([xBar1, xBar2]), steelMat);
  xClamp.position.set(centerShiftX - len * 0.14, thickY * 0.46, depthZ * 0.5);
  group.add(xClamp);

  // 5. Sculpted Bottom Shroud Plate with Circular Fan Cutouts + Swept Axial Fans
  const fanSize = Math.min(0.84, (len * 0.78) / fanCount);
  const shroudShape = makeRoundedRectShape(len, depthZ, 0.04);
  const fanXCoords = [];
  for (let i = 0; i < fanCount; i++) {
    const localFx = -((fanCount - 1) * 0.5 * (fanSize * 1.06)) + i * (fanSize * 1.06);
    fanXCoords.push(localFx);
    const hole = new THREE.Path();
    hole.absarc(localFx, 0, fanSize * 0.445, 0, Math.PI * 2, true);
    shroudShape.holes.push(hole);
  }
  const shroudGeo = new THREE.ExtrudeGeometry(shroudShape, {
    depth: thickY * 0.24,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 14,
  });
  shroudGeo.center();
  shroudGeo.rotateX(Math.PI / 2);
  const shroud = new THREE.Mesh(shroudGeo, shroudMat);
  shroud.position.set(centerShiftX, -thickY * 0.36, depthZ * 0.5);
  shroud.castShadow = true;
  group.add(shroud);

  // Sleek side shroud bezel framing the exposed aluminum heatsink fins on +Z edge
  const endCapL = new THREE.Mesh(new THREE.BoxGeometry(0.14, thickY * 0.86, 0.08), shroudMat);
  endCapL.position.set(centerShiftX - len * 0.45, 0.02, depthZ - 0.03);
  const endCapR = new THREE.Mesh(new THREE.BoxGeometry(0.18, thickY * 0.86, depthZ * 0.94), shroudMat);
  endCapR.position.set(centerShiftX + len * 0.46, 0.02, depthZ * 0.50);
  const sideTopRail = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.055, 0.075), shroudMat);
  sideTopRail.position.set(centerShiftX, thickY * 0.43, depthZ - 0.025);
  const sideLedBar = new THREE.Mesh(
    new THREE.BoxGeometry(len * 0.52, 0.018, 0.014),
    new THREE.MeshStandardMaterial({ color: 0x3ecf5e, emissive: 0x22c55e, emissiveIntensity: 0.42 })
  );
  sideLedBar.position.set(centerShiftX + 0.06, thickY * 0.43, depthZ + 0.016);
  group.add(endCapL, endCapR, sideTopRail, sideLedBar);

  // Side illuminated brand nameplate (+Z visible face facing viewer, crisp 5:1 canvas aspect)
  const gpuTex = makeLabelTexture(
    comp?.model || comp?.name || 'GeForce RTX',
    `${comp?.vram_gb || 8}GB VRAM · ${comp?.tdp_watts || 150}W`,
    '#3ecf5e',
    '#0b1322',
    false,
    1024,
    200
  );
  const badgeW = Math.min(1.28, len * 0.52);
  const badgeH = Math.max(0.24, thickY * 0.48);
  const sideBadgeBack = new THREE.Mesh(new THREE.BoxGeometry(badgeW + 0.04, badgeH + 0.03, 0.045), backplateMat);
  sideBadgeBack.position.set(centerShiftX + 0.06, thickY * 0.08, depthZ - 0.01);
  const sideBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(badgeW, badgeH),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: gpuTex, roughness: 0.35 })
  );
  sideBadge.position.set(centerShiftX + 0.06, thickY * 0.08, depthZ + 0.016);
  group.add(sideBadgeBack, sideBadge);

  // Axial Fans seated neatly inside the circular shroud bores!
  for (const localFx of fanXCoords) {
    const fan = _makeFanAssembly(fanSize, shroudMat, fanRotors, { depth: 0.14, showStruts: false });
    fan.rotation.x = Math.PI / 2;
    fan.position.set(centerShiftX + localFx, -thickY * 0.38, depthZ * 0.5);
    group.add(fan);
  }

  // 6. Stainless Rear Dual-Slot I/O Bracket (-X) flush against case rear PCIe bay
  const rearBracket = new THREE.Mesh(makeExtrudedBox(0.036, thickY * 1.18, depthZ + 0.08, 0.01, 0.004), steelMat);
  rearBracket.position.set(centerShiftX - len / 2 + 0.01, -0.02, depthZ * 0.5);
  group.add(rearBracket);

  const dpGeos = [];
  for (let p = 0; p < 4; p++) {
    const dp = new THREE.BoxGeometry(0.048, 0.045, 0.12);
    dp.translate(centerShiftX - len / 2 - 0.065, 0.06, depthZ * 0.24 + p * 0.19);
    dpGeos.push(dp);
  }
  group.add(new THREE.Mesh(safeMerge(dpGeos), pcbMat));

  // 7. Recessed 8-Pin / 12VHPWR Power Header on +Z Edge
  const pwrPlug = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.12), pcbMat);
  pwrPlug.position.set(centerShiftX + len * 0.36, thickY * 0.36, depthZ - 0.04);
  group.add(pwrPlug);

  // 8. Rear Expansion Bracket Fastener Thumbscrew (MUST preserve userData.fastenerScrews)
  const gpuScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.055, 12), steelMat);
  gpuScrew.rotation.z = Math.PI / 2;
  gpuScrew.position.set(centerShiftX - len / 2 - 0.074, 0.17, 0.04);
  gpuScrew.visible = false;
  group.add(gpuScrew);

  group.userData.fastenerScrews = [gpuScrew];
  group.userData.fanRotors = fanRotors;
  return group;
}

// ---------------------------------------------------------------------------
// 7. PSU (Chamfered Body, Recessed Fan & Toroid Coils, Wire Grille, AC Inlet & Rocker,
//    Modular Output Socket Bank, Fastener Screws)
// ---------------------------------------------------------------------------

export function createPsuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 150, h: 86, d: 140 };
  const lenX = dims.d * S;
  const hY = dims.h * S;
  const wZ = dims.w * S;
  const brushedBump = makeBrushedMetalBumpTexture();

  const group = new THREE.Group();
  group.name = `Hardware_psu_${comp?.id || 'psu'}`;
  const fanRotors = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x161c26,
    roughness: 0.50,
    metalness: 0.56,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.84 });
  const meshMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeHoneycombMeshTexture(), roughness: 0.7, metalness: 0.3 });
  const plugMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.72, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.24, metalness: 0.9 });

  // 1. Chamfered Powder-Coated Chassis
  const chassis = new THREE.Mesh(makeExtrudedBox(lenX, hY, wZ, 0.03, 0.01), bodyMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // 2. Spec Nameplate Decal on +Z Visible Side Face
  const effLabel = comp?.efficiency_rating || comp?.efficiency || '80+ Bronze';
  const labelTex = makeLabelTexture(
    `${comp?.wattage || 650}W`,
    `${comp?.brand || 'Corsair'} · ${effLabel}`,
    '#f59e0b',
    '#0f172a'
  );
  const sideLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(lenX * 0.84, hY * 0.74),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.40 })
  );
  sideLabel.position.set(0, 0, wZ / 2 + 0.006);
  group.add(sideLabel);

  // 3. Recessed 120mm Intake Fan on -Y Bottom Face + Concentric Wire Grille
  const fan = _makeFanAssembly(1.08, bodyMat, fanRotors, { depth: 0.14, showStruts: false });
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, -hY / 2 - 0.012, 0);
  group.add(fan);

  const grilleGeos = [];
  for (const r of [0.18, 0.32, 0.45, 0.56]) {
    const t = new THREE.TorusGeometry(r, 0.012, 8, 28);
    t.rotateX(Math.PI / 2);
    t.translate(0, -hY / 2 - 0.024, 0);
    grilleGeos.push(t);
  }
  const crossA = new THREE.BoxGeometry(1.14, 0.016, 0.02);
  crossA.translate(0, -hY / 2 - 0.024, 0);
  const crossB = new THREE.BoxGeometry(0.02, 0.016, 1.14);
  crossB.translate(0, -hY / 2 - 0.024, 0);
  grilleGeos.push(crossA, crossB);
  group.add(new THREE.Mesh(safeMerge(grilleGeos), metalMat));

  // 4. Rear Exhaust (-X): Honeycomb Exhaust Vent + IEC C14 AC Inlet (3 brass prongs) + Rocker Switch
  const rearMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, hY * 0.78, wZ * 0.42), meshMat);
  rearMesh.position.set(-lenX / 2 - 0.006, 0.04, 0.30);
  group.add(rearMesh);

  const acSocket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.30), plugMat);
  acSocket.position.set(-lenX / 2 - 0.012, -0.14, -0.28);
  group.add(acSocket);
  const prongGeos = [];
  for (const [py, pz] of [[-0.08, -0.28], [-0.18, -0.35], [-0.18, -0.21]]) {
    const pr = new THREE.BoxGeometry(0.05, 0.032, 0.016);
    pr.translate(-lenX / 2 - 0.022, py, pz);
    prongGeos.push(pr);
  }
  group.add(new THREE.Mesh(safeMerge(prongGeos), brassMat));

  const rocker = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.16, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.3, roughness: 0.42 })
  );
  rocker.position.set(-lenX / 2 - 0.014, -0.14, -0.02);
  group.add(rocker);

  // 5. Front Modular Connector Output Bank (+X)
  const modPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, hY * 0.78, wZ * 0.82), metalMat);
  modPanel.position.set(lenX / 2 + 0.008, 0, 0);
  group.add(modPanel);

  const modSocketGeos = [];
  for (const [my, mz, mh, mw] of [
    [0.16, -0.34, 0.16, 0.36],
    [-0.14, -0.36, 0.14, 0.26],
    [0.16, 0.16, 0.14, 0.22],
    [0.16, 0.42, 0.14, 0.22],
    [-0.14, 0.08, 0.12, 0.18],
    [-0.14, 0.34, 0.12, 0.18],
  ]) {
    const ms = new THREE.BoxGeometry(0.045, mh, mw);
    ms.translate(lenX / 2 + 0.028, my, mz);
    modSocketGeos.push(ms);
  }
  group.add(new THREE.Mesh(safeMerge(modSocketGeos), plugMat));

  // 6. Rear PSU Mounting Screws (MUST preserve userData.fastenerScrews)
  const psuScrews = [];
  const psuScrewMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.24, metalness: 0.9 });
  const psuScrewGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.048, 12);
  psuScrewGeo.rotateZ(Math.PI / 2);
  for (const [sy, sz] of [
    [hY * 0.36, wZ * 0.38],
    [hY * 0.36, -wZ * 0.38],
    [-hY * 0.36, wZ * 0.38],
    [-hY * 0.36, -wZ * 0.38],
  ]) {
    const sMesh = new THREE.Mesh(psuScrewGeo, psuScrewMat);
    sMesh.position.set(-lenX / 2 - 0.02, sy, sz);
    sMesh.visible = false;
    group.add(sMesh);
    psuScrews.push(sMesh);
  }

  group.userData.fastenerScrews = psuScrews;
  group.userData.fanRotors = fanRotors;
  return group;
}

// ---------------------------------------------------------------------------
// 8. Storage (M.2 Controller/DRAM/NAND/M-Key, 2.5" Chamfered SSD, 3.5" Cast HDD)
// ---------------------------------------------------------------------------

export function createStorageModel(comp) {
  const kind = detectStorageKind(comp);
  const group = new THREE.Group();
  group.name = `Hardware_storage_${comp?.id || kind}`;
  const brushedBump = makeBrushedMetalBumpTexture();

  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.65, metalness: 0.12 });
  const greenPcbMat = new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 0.58, metalness: 0.14 });
  const icMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGoldFingersTexture(28, 0.22),
    roughness: 0.22,
    metalness: 0.9,
  });
  const plainGold = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xb0bac9,
    roughness: 0.30,
    metalness: 0.84,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });

  if (kind === 'm2_nvme') {
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.22, 0.022), pcbMat);
    group.add(pcb);

    // M-key notched gold edge fingers (-X)
    const fingersTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.025), goldMat);
    fingersTop.position.set(-0.39, 0.04, 0);
    const fingersBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.025), plainGold);
    fingersBot.position.set(-0.39, -0.075, 0);
    group.add(fingersTop, fingersBot);

    // Exposed Controller IC (metallic shield), DRAM cache & 2x 3D NAND packages
    const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.018), metalMat);
    ctrl.position.set(-0.24, 0, 0.018);
    const dram = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.016), icMat);
    dram.position.set(-0.12, 0, 0.016);
    const nand1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.016), icMat);
    nand1.position.set(0.04, 0, 0.016);
    const nand2 = nand1.clone();
    nand2.position.set(0.24, 0, 0.016);
    group.add(ctrl, dram, nand1, nand2);

    // Sleek thermal copper/brand label overlay over NAND
    const labelTex = makeLabelTexture(comp?.brand || 'NVMe', `${comp?.capacity_gb || 1000}GB M.2`, '#38bdf8', '#141e2e', false, 768, 256);
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.175),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.4 })
    );
    sticker.position.set(0.14, 0, 0.027);
    group.add(sticker);

    // Half-moon standoff mounting notch (+X)
    const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.028, 12), metalMat);
    notch.rotation.x = Math.PI / 2;
    notch.position.set(0.39, 0, 0);
    group.add(notch);
  } else if (kind === 'sata_35') {
    // 3.5" SATA HDD: Cast aluminum base + brushed stainless stamped lid + spindle + logic PCB + L-SATA
    const housing = new THREE.Mesh(makeExtrudedBox(1.02, 0.24, 1.46, 0.04, 0.01), pcbMat);
    const topLid = new THREE.Mesh(makeExtrudedBox(0.95, 0.036, 1.38, 0.03, 0.006), metalMat);
    topLid.position.y = 0.12;
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.045, 24), metalMat);
    spindle.position.set(0, 0.145, -0.14);
    const spindleHub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.052, 18), icMat);
    spindleHub.position.set(0, 0.15, -0.14);

    // Underside green logic board + controller chip
    const logicPcb = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.018, 0.68), greenPcbMat);
    logicPcb.position.set(0, -0.125, -0.32);

    // L-keyed SATA Power + Data connector blades (-Z rear)
    const sataPwr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.08), plainGold);
    sataPwr.position.set(-0.22, -0.05, -0.74);
    const sataData = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.08), plainGold);
    sataData.position.set(0.04, -0.05, -0.74);

    // 6 perimeter Torx lid screws
    const torxGeos = [];
    for (const [sx, sz] of [[-0.41, -0.58], [0.41, -0.58], [-0.41, 0], [0.41, 0], [-0.41, 0.58], [0.41, 0.58]]) {
      const ts = new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8);
      ts.translate(sx, 0.14, sz);
      torxGeos.push(ts);
    }
    group.add(housing, topLid, spindle, spindleHub, logicPcb, sataPwr, sataData, new THREE.Mesh(safeMerge(torxGeos), icMat));
  } else {
    // 2.5" SATA SSD: Chamfered anodized shell + nameplate + L-keyed SATA blades
    const shell = new THREE.Mesh(
      makeExtrudedBox(0.70, 0.08, 1.00, 0.03, 0.008),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.36,
        metalness: 0.68,
        bumpMap: brushedBump,
        bumpScale: 0.004,
      })
    );
    const tex = makeLabelTexture(comp?.brand || 'SSD', `${comp?.capacity_gb || 500}GB SATA`, '#10b981', '#0f172a');
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.80),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.38 })
    );
    sticker.rotation.x = -Math.PI / 2;
    sticker.position.y = 0.050;
    const sataPwr = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.07), plainGold);
    sataPwr.position.set(-0.18, -0.01, -0.50);
    const sataData = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.07), plainGold);
    sataData.position.set(0.04, -0.01, -0.50);
    group.add(shell, sticker, sataPwr, sataData);
  }

  return group;
}

// ---------------------------------------------------------------------------
// 9. Case Fan (Octagonal Frame, Stator Struts, Swept Blades, Airflow Guide)
// ---------------------------------------------------------------------------

export function createCaseFanModel(comp) {
  const sz = Math.min(1.4, (comp?.dimensionsMm?.w || 120) * S);
  const group = new THREE.Group();
  group.name = `Hardware_case_fan_${comp?.id || 'fan'}`;
  const fanRotors = [];

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.55, metalness: 0.32 });
  const fan = _makeFanAssembly(sz, frameMat, fanRotors, {
    depth: 0.25,
    accentColor: 0x38bdf8,
    showStruts: true,
  });
  group.add(fan);

  // Airflow direction indicator arrow bar on top edge (local -Z exhaust direction)
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.45,
  });
  const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.18), arrowMat);
  arrowShaft.position.set(0, sz / 2 + 0.03, 0);
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 8), arrowMat);
  arrowHead.rotation.x = -Math.PI / 2;
  arrowHead.position.set(0, sz / 2 + 0.03, -0.11);
  group.add(arrowShaft, arrowHead);

  group.userData.fanRotors = fanRotors;
  return group;
}

export function createComponentMesh(slotKey, comp) {
  switch (slotKey) {
    case 'case':
      return createCaseModel(comp);
    case 'mb':
      return createMotherboardModel(comp);
    case 'cpu':
      return createCpuModel(comp);
    case 'cooler':
      return createCoolerModel(comp);
    case 'ram':
      return createRamModel(comp);
    case 'gpu':
      return createGpuModel(comp);
    case 'psu':
      return createPsuModel(comp);
    case 'storage':
      return createStorageModel(comp);
    case 'case_fan':
      return createCaseFanModel(comp);
    default:
      return new THREE.Group();
  }
}

// ---------------------------------------------------------------------------
// 10. Braided Cables with Cable Combs & Oriented Multi-Pin Plugs
// ---------------------------------------------------------------------------

export function createCableMesh(cableDef, startPt, endPt) {
  const group = new THREE.Group();
  group.name = `Cable_${cableDef.id}`;

  const s = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
  const e = new THREE.Vector3(endPt.x, endPt.y, endPt.z);

  const mid1 = s.clone().lerp(e, 0.30);
  mid1.z -= 0.20;
  mid1.y += 0.14;
  const mid2 = s.clone().lerp(e, 0.70);
  mid2.z += 0.20;
  mid2.y -= 0.06;

  const curve = new THREE.CatmullRomCurve3([s, mid1, mid2, e]);
  const braidTex = makeBraidedSleeveTexture();
  const tubeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cableDef.color || '#3ecf5e'),
    roughness: 0.65,
    metalness: 0.12,
    bumpMap: braidTex,
    bumpScale: 0.008,
  });

  const is24Pin = cableDef.id === 'c_24pin';
  const isPowerHeavy = is24Pin || cableDef.id === 'c_8pin_cpu' || cableDef.id === 'c_pcie_8';
  const radius = is24Pin ? 0.044 : cableDef.id.includes('fan') ? 0.022 : 0.032;

  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, radius, 10, false), tubeMat);
  tube.castShadow = true;
  group.add(tube);

  // Sleek Cable Combs along main power harnesses
  const plugMat = new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.65, metalness: 0.15 });
  if (isPowerHeavy) {
    for (const t of [0.35, 0.65]) {
      const pt = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const comb = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 2.8, radius * 2.8, 0.045),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.4 })
      );
      comb.position.copy(pt);
      comb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      group.add(comb);
    }
  }

  // Oriented molded multi-pin connector plugs at endpoints
  const plugSize = is24Pin ? [0.11, 0.18, 0.12] : isPowerHeavy ? [0.11, 0.12, 0.11] : [0.08, 0.08, 0.09];
  const plugGeo = new THREE.BoxGeometry(...plugSize);

  const p1 = new THREE.Mesh(plugGeo, plugMat);
  p1.position.copy(s);
  p1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(0.02));

  const p2 = new THREE.Mesh(plugGeo, plugMat);
  p2.position.copy(e);
  p2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(0.98));

  group.add(p1, p2);
  return group;
}

/**
 * Optional external GLTF/GLB hardware model loader with automatic bounding-box
 * millimeter scaling and graceful fallback to procedural Three.js geometry.
 */
export async function tryAttachExternalGltf(targetGroup, gltfUrl, targetDimsMm) {
  if (!gltfUrl || !targetGroup) return false;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    if (!gltf?.scene) return false;

    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.length() > 0 && targetDimsMm) {
      const targetMax = Math.max(targetDimsMm.w || 100, targetDimsMm.h || 100, targetDimsMm.d || 50) * S;
      const curMax = Math.max(size.x, size.y, size.z);
      const ratio = targetMax / Math.max(0.001, curMax);
      model.scale.setScalar(ratio);
    }
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(model).getCenter(center);
    model.position.sub(center);

    while (targetGroup.children.length > 0) {
      targetGroup.remove(targetGroup.children[0]);
    }
    targetGroup.add(model);
    return true;
  } catch {
    return false;
  }
}
