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
  grad.addColorStop(1, '#0a0f18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle brushed surface lines
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  // Clean left accent bar instead of cartoon full border
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, Math.max(8, Math.round(width * 0.018)), height);

  if (markerCorner) {
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(66, 16);
    ctx.lineTo(16, 66);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.font = `700 ${height >= 256 ? 36 : 28}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(title || '').slice(0, 28), width * 0.5, height * 0.48);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${height >= 256 ? 20 : 16}px monospace`;
    ctx.fillText(String(subtitle || '').slice(0, 42), width * 0.5, height * 0.70);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeCpuIhsTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Authentic brushed nickel-plated copper IHS surface
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#dae1ea');
  grad.addColorStop(0.5, '#c6cfd9');
  grad.addColorStop(1, '#b6c0ce');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine horizontal CNC micro-brushing
  for (let y = 0; y < 512; y += 2) {
    const alpha = 0.028 + ((y * 19) % 11) * 0.0035;
    ctx.fillStyle = y % 4 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(15,23,42,${alpha})`;
    ctx.fillRect(0, y, 512, 1);
  }

  // Subtle chamfer highlight inset
  ctx.strokeStyle = 'rgba(255,255,255,0.36)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 492);
  ctx.strokeStyle = 'rgba(15,23,42,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, 480, 480);

  const rawBrand = String(comp?.brand || '').toUpperCase();
  const rawModel = String(comp?.model || comp?.name || 'PROCESSOR').toUpperCase();
  const isAmd = rawBrand.includes('AMD') || rawModel.includes('RYZEN');
  const isIntel = rawBrand.includes('INTEL') || rawModel.includes('CORE') || rawModel.includes('I5') || rawModel.includes('I7') || rawModel.includes('I9');

  // High-contrast laser-etched dark charcoal typography
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = '800 40px sans-serif';
  ctx.fillText(isAmd ? 'AMD RYZEN' : isIntel ? 'INTEL CORE' : (rawBrand || 'PROCESSOR'), 256, 146);

  // Crisp etched divider hairline
  ctx.fillStyle = 'rgba(15,23,42,0.62)';
  ctx.fillRect(96, 168, 320, 3);

  // Model SKU
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 34px monospace';
  const cleanModel = rawModel.replace(/^AMD\s+RYZEN\s*/i, '').replace(/^INTEL\s+CORE\s*/i, '').slice(0, 18);
  ctx.fillText(cleanModel || String(comp?.socket || 'CPU'), 256, 224);

  // Authentic fab / batch laser-etch strings
  ctx.fillStyle = '#1e293b';
  ctx.font = '700 20px monospace';
  ctx.fillText(`${String(comp?.socket || 'LGA').toUpperCase()} · ${comp?.cores || 8}C/${(comp?.cores || 8) * 2}T`, 256, 276);
  ctx.fillStyle = '#334155';
  ctx.font = '600 15px monospace';
  ctx.fillText(isAmd ? 'DIFFUSED IN TAIWAN · MADE IN MALAYSIA' : 'SRM88 · 3.40GHZ · V418B920', 256, 326);
  ctx.fillText(isAmd ? '© 2024 AMD · 100-000000593' : '© INTEL CORP · MALAY', 256, 352);

  // Micro 2D DataMatrix etched code (bottom-right)
  ctx.fillStyle = '#0f172a';
  const dmX = 374;
  const dmY = 382;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r === 8 || c === 0 || ((r * 7 + c * 13) % 3 === 0)) {
        ctx.fillRect(dmX + c * 8, dmY + r * 8, 7, 7);
      }
    }
  }

  // Subtle laser-etched Pin-1 corner arrow (top-left matches -X/+Y)
  ctx.fillStyle = '#ca8a04';
  ctx.beginPath();
  ctx.moveTo(28, 28);
  ctx.lineTo(74, 28);
  ctx.lineTo(28, 74);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGpuNameplateTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');

  const tag = `${comp?.brand || ''} ${comp?.model || ''} ${comp?.name || ''}`.toUpperCase();
  const isAmd = tag.includes('RADEON') || tag.includes('RX ') || tag.includes('AMD');
  const isIntel = tag.includes('ARC') || tag.includes('INTEL');
  const accent = isAmd ? '#ef4444' : isIntel ? '#38bdf8' : '#76b900';
  const family = isAmd ? 'RADEON RX' : isIntel ? 'INTEL ARC' : 'GEFORCE RTX';

  // Brushed obsidian titanium plate
  const grad = ctx.createLinearGradient(0, 0, 1024, 200);
  grad.addColorStop(0, '#181f2a');
  grad.addColorStop(0.5, '#11161f');
  grad.addColorStop(1, '#0c1017');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 200);

  // Fine machined horizontal lines
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < 200; y += 4) ctx.fillRect(0, y, 1024, 1);

  // Angled racing accent slash on left
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(44, 0);
  ctx.lineTo(22, 200);
  ctx.lineTo(0, 200);
  ctx.closePath();
  ctx.fill();

  // Subtle recessed metallic edge bevel
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 1016, 192);

  // Bold wide-tracked silkscreen family title
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '800 58px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(family, 76, 104);

  // Model & VRAM right-aligned technical tag
  const shortModel = String(comp?.model || comp?.name || '')
    .replace(/nvidia|geforce|amd|radeon/gi, '')
    .trim()
    .slice(0, 20)
    .toUpperCase();
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 30px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(shortModel || `${comp?.vram_gb || 8}GB`, 978, 92);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px monospace';
  ctx.fillText(`${comp?.vram_gb || 8}GB GDDR6 · ${comp?.tdp_watts || 170}W TDP`, 978, 148);

  // Sleek thin bottom brand accent rule
  ctx.fillStyle = accent;
  ctx.fillRect(76, 134, 280, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGpuBackplateDecalTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 1024, 384);

  const tag = `${comp?.brand || ''} ${comp?.model || ''} ${comp?.name || ''}`.toUpperCase();
  const isAmd = tag.includes('RADEON') || tag.includes('RX ') || tag.includes('AMD');
  const family = isAmd ? 'RADEON RX' : 'GEFORCE RTX';

  // Subtle geometric anodized CNC diagonal accents (low contrast, authentic hardware look)
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(48, 320);
  ctx.lineTo(240, 320);
  ctx.lineTo(310, 250);
  ctx.lineTo(540, 250);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 64);
  ctx.lineTo(420, 64);
  ctx.lineTo(468, 112);
  ctx.stroke();

  // Matte silver laser-etched branding along upper-left strip
  ctx.fillStyle = 'rgba(226,232,240,0.68)';
  ctx.font = '700 40px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(family, 58, 122);

  ctx.fillStyle = 'rgba(148,163,184,0.52)';
  ctx.font = '600 22px monospace';
  ctx.fillText(String(comp?.model || comp?.name || 'GRAPHICS').toUpperCase().slice(0, 26), 58, 162);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makePsuLabelTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  // Matte industrial black label
  ctx.fillStyle = '#11161f';
  ctx.fillRect(0, 0, 768, 384);

  // Subtle dark diagonal band
  ctx.fillStyle = '#192130';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(420, 0);
  ctx.lineTo(340, 384);
  ctx.lineTo(0, 384);
  ctx.closePath();
  ctx.fill();

  const eff = String(comp?.efficiency_rating || comp?.efficiency || '80+ Bronze').toUpperCase();
  const isGold = eff.includes('GOLD') || eff.includes('PLATINUM') || eff.includes('TITANIUM');
  const badgeColor = eff.includes('PLATINUM') ? '#cbd5e1' : isGold ? '#eab308' : '#d97706';

  // Left sleek amber/gold accent bar
  ctx.fillStyle = badgeColor;
  ctx.fillRect(0, 0, 14, 384);

  // Brand & Series
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(comp?.brand || 'CORSAIR').toUpperCase(), 40, 62);

  // Hero Wattage Callout
  const watts = comp?.wattage || 650;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 94px sans-serif';
  ctx.fillText(`${watts}W`, 36, 168);

  // Sub-model & Modular Spec
  ctx.fillStyle = badgeColor;
  ctx.font = '700 20px monospace';
  ctx.fillText(`${String(comp?.model || 'SERIES').toUpperCase().slice(0, 18)} · FULLY MODULAR`, 40, 212);

  // 80 PLUS Metallic Medallion on right
  ctx.fillStyle = '#0b0f16';
  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 4;
  ctx.fillRect(592, 34, 134, 152);
  ctx.strokeRect(592, 34, 134, 152);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 50px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('80', 659, 98);
  ctx.fillStyle = badgeColor;
  ctx.font = '700 20px sans-serif';
  ctx.fillText('PLUS', 659, 128);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 18px monospace';
  ctx.fillText(isGold ? (eff.includes('PLATINUM') ? 'PLATINUM' : 'GOLD') : 'BRONZE', 659, 166);

  // Authentic DC Output Rail Specification Table (bottom)
  const tx = 40;
  const ty = 248;
  const tw = 688;
  const th = 104;
  ctx.strokeStyle = 'rgba(148,163,184,0.34)';
  ctx.lineWidth = 2;
  ctx.strokeRect(tx, ty, tw, th);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(tx, ty, tw, 32);

  const cols = ['DC OUTPUT', '+3.3V', '+5V', '+12V', '-12V', '+5VSB'];
  const amps12 = Math.round((watts * 0.96) / 12);
  const vals = ['MAX LOAD', '20A', '20A', `${amps12}A`, '0.3A', '3.0A'];
  const colW = tw / cols.length;
  ctx.textAlign = 'center';
  for (let i = 0; i < cols.length; i++) {
    const cx = tx + i * colW + colW * 0.5;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(tx + i * colW, ty);
      ctx.lineTo(tx + i * colW, ty + th);
      ctx.stroke();
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 15px monospace';
    ctx.fillText(cols[i], cx, ty + 22);
    ctx.fillStyle = i === 3 ? badgeColor : '#94a3b8';
    ctx.font = '700 17px monospace';
    ctx.fillText(vals[i], cx, ty + 68);
  }
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`AC INPUT: 100-240V ~ 50/60Hz · ACTIVE PFC · TOTAL POWER ${watts}W`, tx + 10, ty + 96);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeSsdLabelTexture(comp, kind) {
  const isNvme = kind === 'm2_nvme';
  const isHdd = kind === 'sata_35';
  const W = isNvme ? 768 : 512;
  const H = isNvme ? 256 : 704;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const brand = String(comp?.brand || 'SSD').toUpperCase();
  const cap = `${comp?.capacity_gb || (isHdd ? 2000 : 1000)}GB`;

  if (isNvme) {
    // Copper-graphene sleek thermal film label
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#121720');
    g.addColorStop(0.75, '#192130');
    g.addColorStop(1, '#261e18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, 0, W, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(28, 36, 10, 184);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 54px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(brand.slice(0, 14), 58, 104);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 32px monospace';
    ctx.fillText(`${String(comp?.model || 'NVMe M.2').slice(0, 18).toUpperCase()}`, 58, 158);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px monospace';
    ctx.fillText(`PCIe Gen4 x4 · ${cap} · 3D V-NAND`, 58, 206);

    // Mini barcode on right
    ctx.fillStyle = '#cbd5e1';
    for (let x = 590; x < 732; x += 6) {
      if ((x * 7) % 11 > 3) ctx.fillRect(x, 168, (x % 4 === 0 ? 4 : 2), 54);
    }
  } else if (isHdd) {
    // Classic industrial silver/white HDD specification sticker
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 128);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 128, W, 14);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 44px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(brand.slice(0, 14), 32, 68);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 24px monospace';
    ctx.fillText('3.5" INTERNAL HARD DRIVE', 32, 106);

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 96px sans-serif';
    ctx.fillText(cap, 32, 260);
    ctx.fillStyle = '#334155';
    ctx.font = '700 26px monospace';
    ctx.fillText('7200 RPM · SATA 6Gb/s · 256MB CACHE', 32, 316);
    ctx.fillText(`MDL: ${String(comp?.model || 'ST2000DM008').toUpperCase().slice(0, 18)}`, 32, 366);
    ctx.fillText('S/N: ZFL49K2P · FW: 0001', 32, 404);

    // Barcode block
    ctx.fillStyle = '#0f172a';
    for (let x = 36; x < 468; x += 7) {
      if ((x * 13) % 17 > 4) ctx.fillRect(x, 466, (x % 3 === 0 ? 4 : 2), 94);
    }
    ctx.fillStyle = '#475569';
    ctx.font = '600 18px monospace';
    ctx.fillText('DO NOT COVER BREATHER HOLE · CE · FC · RoHS', 32, 636);
  } else {
    // 2.5" SATA SSD: Sleek anodized charcoal graphic (Samsung EVO / Crucial industrial aesthetic)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#18202c');
    g.addColorStop(1, '#0e131b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Subtle brushed grain
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

    const accent = brand.includes('SAMSUNG') ? '#ea580c' : brand.includes('CRUCIAL') ? '#2563eb' : '#10b981';

    // Iconic clean geometric emblem (bottom-center square accent)
    ctx.fillStyle = accent;
    ctx.fillRect(54, 48, 84, 14);
    ctx.fillRect(216, 468, 80, 80);

    // Brand & Model
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(brand.slice(0, 14), W * 0.5, 198);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 32px monospace';
    ctx.fillText('SOLID STATE DRIVE', W * 0.5, 252);

    ctx.fillStyle = accent;
    ctx.font = '800 68px sans-serif';
    ctx.fillText(cap, W * 0.5, 358);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px monospace';
    ctx.fillText(`${String(comp?.model || 'EVO SATA').toUpperCase().slice(0, 20)}`, W * 0.5, 412);

    // Technical footer
    ctx.fillStyle = '#64748b';
    ctx.font = '600 18px monospace';
    ctx.fillText('2.5" SATA 6Gb/s · 3D V-NAND · CE FC', W * 0.5, 642);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeRamSpreaderTexture(comp, isDdr5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isDdr5 ? '#1a2232' : '#1f232a';
  ctx.fillRect(0, 0, 512, 128);

  // Machined subtle chevron grooves
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 3;
  for (let x = 20; x < 492; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x + 18, 116);
    ctx.stroke();
  }

  const accent = isDdr5 ? '#38bdf8' : '#dc2626';
  ctx.fillStyle = accent;
  ctx.fillRect(26, 28, 8, 72);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '800 34px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(comp?.brand || (isDdr5 ? 'VENGEANCE' : 'RIPJAWS')).toUpperCase().slice(0, 14), 52, 66);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 21px monospace';
  const mhz = comp?.speed_mhz || (isDdr5 ? 5600 : 3200);
  ctx.fillText(`${isDdr5 ? 'DDR5' : 'DDR4'}-${mhz} · HIGH-PERFORMANCE`, 52, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeFanHubTexture() {
  const c = getCachedCanvas('fan_hub_256', 256, 256, (ctx, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rad = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.5);
    rad.addColorStop(0, '#475569');
    rad.addColorStop(0.45, '#1e293b');
    rad.addColorStop(0.85, '#334155');
    rad.addColorStop(1, '#0f172a');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);

    // Concentric spun-metal lathe rings
    for (let r = 14; r < w * 0.48; r += 6) {
      ctx.strokeStyle = r % 12 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Minimalist machined turbine ring mark
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFanAirflowLabelTexture() {
  const c = getCachedCanvas('fan_airflow_256', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#141b26';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AIRFLOW', 20, 40);

    // Crisp directional arrow pointing right (mapped to -Z exhaust)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(136, 27, 64, 10);
    ctx.beginPath();
    ctx.moveTo(200, 14);
    ctx.lineTo(234, 32);
    ctx.lineTo(200, 50);
    ctx.closePath();
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
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
  const rInner = size * 0.155;
  const rOuter = size * 0.422;
  const bladeParts = [];

  // Smoothly tapered scimitar-swept static-pressure airfoil blade
  const bladeLen = rOuter - rInner;
  const chord = size * 0.135;
  const shape = new THREE.Shape();
  shape.moveTo(0, -chord * 0.36);
  shape.bezierCurveTo(
    bladeLen * 0.35, -chord * 0.68,
    bladeLen * 0.78, -chord * 0.58,
    bladeLen, -chord * 0.12
  );
  shape.quadraticCurveTo(bladeLen * 1.02, chord * 0.16, bladeLen * 0.94, chord * 0.34);
  shape.bezierCurveTo(
    bladeLen * 0.66, chord * 0.22,
    bladeLen * 0.32, chord * 0.08,
    0, chord * 0.34
  );
  shape.closePath();

  const baseBlade = new THREE.ExtrudeGeometry(shape, {
    depth: 0.011,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 1,
    curveSegments: 5,
  });
  baseBlade.translate(0, 0, -0.0055);
  baseBlade.rotateX(0.42); // Aerodynamic blade pitch

  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const g = baseBlade.clone();
    g.translate(rInner * 0.88, 0, 0);
    g.rotateZ(angle);
    bladeParts.push(g);
  }
  baseBlade.dispose();
  return safeMerge(bladeParts);
}

function _makeFanAssembly(size, frameMat, fanRotorsList, opts = {}) {
  const { depth = 0.24, accentColor = null, showStruts = true, bladeCount = 9 } = opts;
  const fanGroup = new THREE.Group();

  // 1. Chamfered Octagonal Housing Frame with Smooth Circular Bore
  const half = size * 0.5;
  const cut = size * 0.095;
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
  bore.absarc(0, 0, size * 0.438, 0, Math.PI * 2, true);
  frameShape.holes.push(bore);

  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: Math.max(0.055, depth - 0.018),
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 18,
  });
  frameGeo.center();
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.castShadow = true;
  fanGroup.add(frameMesh);

  // 2. Corner Anti-Vibration Rubber Pads + Recessed Metallic Screw Bushings
  const padMat = new THREE.MeshStandardMaterial({ color: 0x0b0f17, roughness: 0.92, metalness: 0.04 });
  const bushingMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.32, metalness: 0.82 });
  const padGeos = [];
  const holeGeos = [];
  const off = half - cut * 0.95;
  for (const [cx, cy] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
    const p = new THREE.CylinderGeometry(size * 0.056, size * 0.056, depth + 0.006, 12);
    p.rotateX(Math.PI / 2);
    p.translate(cx, cy, 0);
    padGeos.push(p);

    const b = new THREE.CylinderGeometry(size * 0.028, size * 0.028, depth + 0.012, 10);
    b.rotateX(Math.PI / 2);
    b.translate(cx, cy, 0);
    holeGeos.push(b);
  }
  fanGroup.add(new THREE.Mesh(safeMerge(padGeos), padMat));
  fanGroup.add(new THREE.Mesh(safeMerge(holeGeos), bushingMat));

  // 3. 4 Swept Rear Stator Struts on Exhaust Face (-Z)
  if (showStruts) {
    const strutGeos = [];
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      const sg = new THREE.BoxGeometry(size * 0.285, size * 0.024, 0.018);
      sg.rotateZ(0.16);
      sg.translate(size * 0.285, 0, -depth * 0.38);
      sg.rotateZ(a);
      strutGeos.push(sg);
    }
    const backDisc = new THREE.CylinderGeometry(size * 0.162, size * 0.162, 0.024, 20);
    backDisc.rotateX(Math.PI / 2);
    backDisc.translate(0, 0, -depth * 0.38);
    strutGeos.push(backDisc);
    fanGroup.add(new THREE.Mesh(safeMerge(strutGeos), frameMat));
  }

  // Optional Subtle Recessed Rim Accent Ring
  if (accentColor) {
    const ringMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.22,
      roughness: 0.35,
      metalness: 0.3,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.436, 0.0085, 8, 32), ringMat);
    ring.position.z = depth * 0.45;
    fanGroup.add(ring);
  }

  // 4. Spinning Rotor (Hub + Spun-Metal Concentric Hub Cap + 9 Merged Scimitar Blades)
  const rotor = new THREE.Group();
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x1e2633, roughness: 0.36, metalness: 0.55 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x364152, roughness: 0.36, metalness: 0.38 });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeFanHubTexture(),
    roughness: 0.22,
    metalness: 0.88,
  });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.162, size * 0.172, depth * 0.56, 22), hubMat);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);

  const hubCap = new THREE.Mesh(new THREE.CircleGeometry(size * 0.125, 22), capMat);
  hubCap.position.z = depth * 0.286;
  rotor.add(hubCap);

  const bladesMesh = new THREE.Mesh(_makeSweptRotorGeometry(size, bladeCount), bladeMat);
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

  // Slotted Rubber Cable Grommets beside MB ATX/SATA Edge + Top-Left EPS Cutout
  for (const gy of [1.55, 2.38, 3.22, 3.92]) {
    if (gy > h - 0.45) continue;
    const grommet = new THREE.Mesh(makeExtrudedBox(0.18, 0.34, 0.055, 0.04, 0.006), rubberMat);
    grommet.position.set(0.45, gy, -0.75);
    caseGroup.add(grommet);
  }
  const epsGrommet = new THREE.Mesh(makeExtrudedBox(0.32, 0.14, 0.055, 0.03, 0.005), rubberMat);
  epsGrommet.position.set(-1.62, Math.min(4.44, h - 0.16), -0.75);
  caseGroup.add(epsGrommet);

  // 9 Hex Brass Standoffs aligned to pc-anatomy ATX mounts (tips stop flush at -0.680 under MB back face)
  const standoffGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.064, 6);
  standoffGeo.rotateX(Math.PI / 2);
  for (const sx of [-2.13, -0.57, 0.14]) {
    if (sx < -d / 2 + 0.12) continue;
    for (const sy of [1.45, 2.76, 4.31]) {
      if (sy > h - 0.18) continue;
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

  // PCIe expansion cutout (mid-lower, aligned to GPU downward-hanging slots y=1.28..2.68)
  const pcieHole = new THREE.Path();
  pcieHole.moveTo(-0.68, 1.28);
  pcieHole.lineTo(0.66, 1.28);
  pcieHole.lineTo(0.66, Math.min(2.74, h - 1.35));
  pcieHole.lineTo(-0.68, Math.min(2.74, h - 1.35));
  pcieHole.closePath();
  rearWallShape.holes.push(pcieHole);

  // Motherboard Rear I/O shield cutout matching pc-anatomy I/O stack (z: -0.70..-0.31, y: 2.84..4.39)
  const ioTopY = Math.min(4.39, h - 0.16);
  const ioBotY = Math.min(2.84, ioTopY - 1.25);
  const ioHole = new THREE.Path();
  ioHole.moveTo(0.31, ioBotY);
  ioHole.lineTo(0.70, ioBotY);
  ioHole.lineTo(0.70, ioTopY);
  ioHole.lineTo(0.31, ioTopY);
  ioHole.closePath();
  rearWallShape.holes.push(ioHole);

  // Rear 120mm exhaust fan circular mesh opening (maps to z = +0.30, y = 3.62)
  const fanCenterY = Math.min(3.62, h - 0.68);
  const rearFanHole = new THREE.Path();
  rearFanHole.absarc(-0.30, fanCenterY, 0.54, 0, Math.PI * 2, true);
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

  // 8. Sculpted PSU Shroud with Top Perforated Vent, PCIe Cable Grommet Slot & Side Viewing Window
  const shroudLen = d * 0.62;
  const shroudCenterX = -d / 2 + shroudLen / 2 + 0.06;
  const shroudTopShape = makeRoundedRectShape(shroudLen, w - 0.14, 0.02);
  // Real GPU PCIe power pass-through slot cutout along +Z front half of shroud deck
  const pcieSlotCut = new THREE.Path();
  pcieSlotCut.moveTo(-0.18, 0.44);
  pcieSlotCut.lineTo(shroudLen * 0.42, 0.44);
  pcieSlotCut.lineTo(shroudLen * 0.42, 0.68);
  pcieSlotCut.lineTo(-0.18, 0.68);
  pcieSlotCut.closePath();
  shroudTopShape.holes.push(pcieSlotCut);

  const shroudTopGeo = new THREE.ExtrudeGeometry(shroudTopShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
  });
  shroudTopGeo.center();
  shroudTopGeo.rotateX(Math.PI / 2);
  const shroudTop = new THREE.Mesh(shroudTopGeo, steelMat);
  shroudTop.position.set(shroudCenterX, 1.12, 0.02);
  shroudTop.receiveShadow = true;
  caseGroup.add(shroudTop);

  // Rubber bezel rim around the PSU shroud PCIe cable pass-through slot
  const pcieGrommetRim = new THREE.Mesh(
    new THREE.BoxGeometry(shroudLen * 0.42 + 0.24, 0.022, 0.03),
    rubberMat
  );
  pcieGrommetRim.position.set(shroudCenterX + shroudLen * 0.21 - 0.09, 1.135, 0.45);
  const pcieGrommetRimF = pcieGrommetRim.clone();
  pcieGrommetRimF.position.z = 0.71;
  caseGroup.add(pcieGrommetRim, pcieGrommetRimF);

  // Perforated top vent panel on PSU shroud (kept strictly behind PCIe slot cutout)
  const shroudVent = new THREE.Mesh(new THREE.BoxGeometry(shroudLen * 0.52, 0.015, w * 0.42), meshMat);
  shroudVent.position.set(-d / 2 + shroudLen * 0.54, 1.146, -0.18);
  caseGroup.add(shroudVent);

  // Subtle illuminated accent bar along PSU shroud outer lip (signature pc-anatomy look!)
  const shroudAccent = new THREE.Mesh(
    new THREE.BoxGeometry(shroudLen * 0.94, 0.018, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.35, roughness: 0.25 })
  );
  shroudAccent.position.set(shroudCenterX, 1.12, w / 2 - 0.055);
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
  shroudSide.position.set(shroudCenterX, 0.61, w / 2 - 0.14);
  caseGroup.add(shroudSide);

  // Shroud front bulkhead with real lower tunnel pass-through cutout for SATA power cables
  const shroudFrontShape = new THREE.Shape();
  const sfW = w - 0.14;
  shroudFrontShape.moveTo(-sfW / 2, -0.51);
  shroudFrontShape.lineTo(sfW / 2, -0.51);
  shroudFrontShape.lineTo(sfW / 2, 0.51);
  shroudFrontShape.lineTo(-sfW / 2, 0.51);
  shroudFrontShape.closePath();
  const tunnelCut = new THREE.Path();
  // rotateY(PI/2) maps shape X -> -Z, so X in [0.16..0.82] cuts Z in [-0.82..-0.16]
  tunnelCut.moveTo(0.16, -0.49);
  tunnelCut.lineTo(0.84, -0.49);
  tunnelCut.lineTo(0.84, -0.04);
  tunnelCut.lineTo(0.16, -0.04);
  tunnelCut.closePath();
  shroudFrontShape.holes.push(tunnelCut);
  const shroudFrontGeo = new THREE.ExtrudeGeometry(shroudFrontShape, {
    depth: 0.04,
    bevelEnabled: false,
  });
  shroudFrontGeo.center();
  shroudFrontGeo.rotateY(Math.PI / 2);
  const shroudFront = new THREE.Mesh(shroudFrontGeo, steelMat);
  shroudFront.position.set(-d / 2 + shroudLen + 0.06, 0.61, 0.02);
  caseGroup.add(shroudFront);

  // Drive cage shelf on right side of shroud (adapts cleanly to compact/full cases)
  const driveShelf = new THREE.Mesh(makeExtrudedBox(1.18, 0.045, 1.28, 0.02, 0.005), steelMat);
  driveShelf.position.set(Math.min(1.42, d / 2 - 0.88), 0.36, 0.05);
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
  const sock = String(comp?.socket || '').toUpperCase();
  const isAm5 = sock.includes('AM5');
  const isLga1700 = sock.includes('1700') || sock.includes('1851');

  const group = new THREE.Group();
  group.name = `Hardware_cpu_${comp?.id || 'cpu'}`;

  // 1. Multi-layer Emerald/Teal Fiberglass Substrate PCB with Carved Recessed Side Keying Notches
  const subMat = new THREE.MeshStandardMaterial({ color: 0x0b4f36, roughness: 0.48, metalness: 0.18 });
  const hw = w / 2;
  const hh = h / 2;
  const cr = 0.012;
  const notchY = h * 0.20;
  const nr = 0.014;
  const subShape = new THREE.Shape();
  subShape.moveTo(-hw + cr, -hh);
  subShape.lineTo(hw - cr, -hh);
  subShape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  subShape.lineTo(hw, notchY - nr);
  subShape.absarc(hw, notchY, nr, -Math.PI / 2, Math.PI / 2, true);
  subShape.lineTo(hw, hh - cr);
  subShape.quadraticCurveTo(hw, hh, hw - cr, hh);
  subShape.lineTo(-hw + cr, hh);
  subShape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  subShape.lineTo(-hw, notchY + nr);
  subShape.absarc(-hw, notchY, nr, Math.PI / 2, -Math.PI / 2, true);
  subShape.lineTo(-hw, -hh + cr);
  subShape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);

  const substrateGeo = new THREE.ExtrudeGeometry(subShape, {
    depth: 0.020,
    bevelEnabled: true,
    bevelThickness: 0.0022,
    bevelSize: 0.0022,
    bevelSegments: 1,
    curveSegments: 6,
  });
  substrateGeo.center();
  const substrate = new THREE.Mesh(substrateGeo, subMat);
  substrate.castShadow = true;
  group.add(substrate);

  // Perimeter ceramic SMD decoupling capacitor clusters (signature AM5 cutout detail & LGA array)
  const capBodyMat = new THREE.MeshStandardMaterial({ color: 0x9a5b13, roughness: 0.36, metalness: 0.45 });
  const capEndMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.24, metalness: 0.90 });
  const smdBodies = [];
  const smdEnds = [];
  const smdCoords = isAm5
    ? [
        [-w * 0.37, -h * 0.21], [-w * 0.37, 0], [-w * 0.37, h * 0.21],
        [w * 0.37, -h * 0.21], [w * 0.37, 0], [w * 0.37, h * 0.21],
        [-w * 0.18, -h * 0.37], [0, -h * 0.37], [w * 0.18, -h * 0.37],
        [-w * 0.18, h * 0.37], [0, h * 0.37], [w * 0.18, h * 0.37],
      ]
    : [
        [-w * 0.39, -h * 0.24], [-w * 0.39, h * 0.12],
        [w * 0.39, -h * 0.24], [w * 0.39, h * 0.12],
      ];
  for (const [sx, sy] of smdCoords) {
    const b = new THREE.BoxGeometry(0.020, 0.012, 0.008);
    b.translate(sx, sy, 0.0155);
    smdBodies.push(b);
    for (const ex of [-0.008, 0.008]) {
      const e = new THREE.BoxGeometry(0.005, 0.0125, 0.0086);
      e.translate(sx + ex, sy, 0.0155);
      smdEnds.push(e);
    }
  }
  group.add(new THREE.Mesh(safeMerge(smdBodies), capBodyMat));
  group.add(new THREE.Mesh(safeMerge(smdEnds), capEndMat));

  // 2. Underside Gold Contact Pad / PGA Pin Array Texture (visible in 3D Inspector flip!)
  const bottomTex = makeCpuBottomTexture(comp);
  const bottomPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, h * 0.94),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: bottomTex, roughness: 0.26, metalness: 0.86 })
  );
  bottomPlate.rotation.y = Math.PI;
  bottomPlate.position.z = -0.0132;
  group.add(bottomPlate);

  // 3. Sculpted Stepped Nickel-Plated Copper IHS (AM5 cruciform octopus OR Intel LGA1700 / AM4 stepped)
  const brushedBump = makeBrushedMetalBumpTexture();
  const ihsTex = makeCpuIhsTexture(comp);
  const ihsTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ihsTex,
    roughness: 0.24,
    metalness: 0.84,
    bumpMap: brushedBump,
    bumpScale: 0.0025,
  });
  const nickelMat = new THREE.MeshStandardMaterial({
    color: 0xc2cbd6,
    roughness: 0.22,
    metalness: 0.90,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });

  if (isAm5) {
    // Signature AM5 8-legged thick cruciform octopus IHS with exposed perimeter cap cutouts
    const legGeos = [];
    const crossH = makeExtrudedBox(w * 0.90, h * 0.28, 0.022, 0.01, 0.003);
    crossH.translate(0, 0, 0.022);
    legGeos.push(crossH);
    const crossV = makeExtrudedBox(w * 0.28, h * 0.90, 0.022, 0.01, 0.003);
    crossV.translate(0, 0, 0.022);
    legGeos.push(crossV);
    const diag1 = makeExtrudedBox(w * 0.72, h * 0.72, 0.020, 0.016, 0.003);
    diag1.translate(0, 0, 0.022);
    legGeos.push(diag1);
    group.add(new THREE.Mesh(safeMerge(legGeos), nickelMat));
  } else if (isLga1700) {
    // Intel LGA1700 stepped flange with side retention wings
    const lip = new THREE.Mesh(makeExtrudedBox(w * 0.92, h * 0.90, 0.012, 0.014, 0.003), nickelMat);
    lip.position.z = 0.018;
    const wings = new THREE.Mesh(makeExtrudedBox(w * 0.96, h * 0.26, 0.011, 0.008, 0.002), nickelMat);
    wings.position.z = 0.0175;
    group.add(lip, wings);
  } else {
    // Square stepped lower IHS lip (AM4 / standard)
    const lip = new THREE.Mesh(makeExtrudedBox(w * 0.90, h * 0.90, 0.014, 0.014, 0.003), nickelMat);
    lip.position.z = 0.018;
    group.add(lip);
  }

  // Upper beveled IHS crown + crisp laser-etched face
  const crownW = isAm5 ? w * 0.74 : w * 0.78;
  const crownH = isAm5 ? h * 0.74 : h * 0.80;
  const ihsCrown = new THREE.Mesh(makeExtrudedBox(crownW, crownH, 0.024, 0.016, 0.004), nickelMat);
  ihsCrown.position.z = 0.032;
  ihsCrown.castShadow = true;
  group.add(ihsCrown);

  const ihsFace = new THREE.Mesh(new THREE.PlaneGeometry(crownW * 0.93, crownH * 0.93), ihsTopMat);
  ihsFace.position.z = 0.0448;
  group.add(ihsFace);

  // 4. Flush Printed Gold Pin-1 Corner Triangle on Substrate (-X, +Y) — authentic, zero floating cone
  const triShape = new THREE.Shape();
  triShape.moveTo(0, 0);
  triShape.lineTo(0.056, 0);
  triShape.lineTo(0, -0.056);
  triShape.closePath();
  const pin1Mat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.22, metalness: 0.92 });
  const pin1Tri = new THREE.Mesh(new THREE.ShapeGeometry(triShape), pin1Mat);
  pin1Tri.position.set(-w * 0.45, h * 0.45, 0.0135);
  group.add(pin1Tri);

  return group;
}

// ---------------------------------------------------------------------------
// 4. CPU Cooler (Low-Profile Radial, Single Tower, & Dual-Tower Heatpipe Stacks)
// ---------------------------------------------------------------------------

export function createCoolerModel(comp) {
  const dims = comp?.dimensionsMm || { w: 124, h: 155, d: 96 };
  const isLowProfile = comp?.coolerType === 'low_profile' || dims.h < 95;
  const isDualTower = comp?.coolerType === 'dual_tower';
  // True total height from CPU IHS to heatpipe dome tips (strictly clears tempered glass at +1.052)
  const depthOut = Math.min(1.56, dims.h * S - 0.04);

  const group = new THREE.Group();
  group.name = `Hardware_cooler_${comp?.id || 'cooler'}`;
  const fanRotors = [];
  const brushedBump = makeBrushedMetalBumpTexture();

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xc86b3c,
    roughness: 0.24,
    metalness: 0.92,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xc5ced9,
    roughness: 0.30,
    metalness: 0.86,
    bumpMap: brushedBump,
    bumpScale: 0.0025,
  });
  const topCapMat = new THREE.MeshStandardMaterial({
    color: 0x151b26,
    roughness: 0.34,
    metalness: 0.72,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const shroudMat = new THREE.MeshStandardMaterial({ color: 0x161d29, roughness: 0.56, metalness: 0.30 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.20, metalness: 0.92 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ed, roughness: 0.22, metalness: 0.94 });

  // 1. Machined Copper Coldplate + Aluminum Block + Retention Crossbar & Knurled Spring Thumbscrews
  const coldPlate = new THREE.Mesh(makeExtrudedBox(0.46, 0.46, 0.055, 0.02, 0.006), copperMat);
  coldPlate.position.set(0, 0, 0.032);
  group.add(coldPlate);

  const clampBlock = new THREE.Mesh(makeExtrudedBox(0.42, 0.42, 0.05, 0.016, 0.005), finMat);
  clampBlock.position.set(0, 0, 0.082);
  group.add(clampBlock);

  const bracket = new THREE.Mesh(makeExtrudedBox(0.86, 0.13, 0.026, 0.01, 0.004), silverMat);
  bracket.position.set(0, 0, 0.048);
  group.add(bracket);

  const screwGeos = [];
  for (const sx of [-0.37, 0.37]) {
    const shaft = new THREE.CylinderGeometry(0.024, 0.024, 0.11, 12);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(sx, 0, 0.085);
    const head = new THREE.CylinderGeometry(0.038, 0.038, 0.026, 14);
    head.rotateX(Math.PI / 2);
    head.translate(sx, 0, 0.14);
    screwGeos.push(shaft, head);
  }
  group.add(new THREE.Mesh(safeMerge(screwGeos), silverMat));

  // Helper for stainless steel fan retention wire clips wrapping from fan corners to heatsink tower grooves
  const addWireClips = (fanX, towerHalfX, fanHalfY, zCenter, spanZ) => {
    const wireGeos = [];
    for (const sy of [-1, 1]) {
      const yPos = sy * (fanHalfY * 0.88);
      const pts = [
        new THREE.Vector3(fanX + (fanX >= 0 ? 0.105 : -0.105), yPos, zCenter - spanZ * 0.38),
        new THREE.Vector3(fanX + (fanX >= 0 ? 0.105 : -0.105), yPos, zCenter + spanZ * 0.38),
        new THREE.Vector3(towerHalfX, yPos * 1.03, zCenter + spanZ * 0.34),
        new THREE.Vector3(towerHalfX, yPos * 1.03, zCenter - spanZ * 0.34),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false);
      wireGeos.push(new THREE.TubeGeometry(curve, 14, 0.0075, 6, false));
    }
    group.add(new THREE.Mesh(safeMerge(wireGeos), wireMat));
  };

  if (isLowProfile) {
    // High-density 44-fin tapered radial aluminum heatsink around a solid copper vapor core
    const petalGeos = [];
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const fin = new THREE.BoxGeometry(0.28, 0.0085, 0.27);
      fin.translate(0.27, 0, 0.215);
      fin.rotateZ(a);
      petalGeos.push(fin);
    }
    const radialMesh = new THREE.Mesh(safeMerge(petalGeos), finMat);
    radialMesh.castShadow = true;
    group.add(radialMesh);

    // Brushed outer aluminum retention ring cradling radial fin tips
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.415, 0.016, 10, 36), shroudMat);
    outerRing.position.set(0, 0, 0.34);
    group.add(outerRing);

    // Copper thermal core slug
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.30, 22), copperMat);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0, 0.21);
    group.add(core);

    // 4 Corner spring push-pin mounting legs tucked cleanly under the outer radial fin ring
    const legGeos = [];
    for (const [lx, ly] of [[-0.275, -0.275], [0.275, -0.275], [-0.275, 0.275], [0.275, 0.275]]) {
      const leg = new THREE.CylinderGeometry(0.020, 0.020, 0.14, 10);
      leg.rotateX(Math.PI / 2);
      leg.translate(lx, ly, 0.10);
      legGeos.push(leg);
    }
    group.add(new THREE.Mesh(safeMerge(legGeos), shroudMat));

    // Flush slim 92mm low-profile axial fan
    const fanHousing = _makeFanAssembly(0.86, shroudMat, fanRotors, { depth: 0.17, showStruts: true, bladeCount: 11 });
    fanHousing.position.set(0, 0, 0.44);
    group.add(fanHousing);
  } else if (isDualTower) {
    // Dual-Tower Heatsink (Noctua NH-D15 / Assassin style: 6 copper U-pipes, twin 26-fin stacks, top shrouds, dual fans + wire clips)
    const pipeGeos = [];
    const dualCapGeos = [];
    for (const py of [-0.24, -0.145, -0.048, 0.048, 0.145, 0.24]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.34, py, depthOut + 0.015),
        new THREE.Vector3(-0.34, py, 0.36),
        new THREE.Vector3(-0.18, py, 0.07),
        new THREE.Vector3(0.18, py, 0.07),
        new THREE.Vector3(0.34, py, 0.36),
        new THREE.Vector3(0.34, py, depthOut + 0.015),
      ]);
      pipeGeos.push(new THREE.TubeGeometry(curve, 18, 0.021, 8, false));

      for (const tx of [-0.34, 0.34]) {
        const cap = new THREE.CylinderGeometry(0.025, 0.025, 0.032, 10);
        cap.rotateX(Math.PI / 2);
        cap.translate(tx, py, depthOut + 0.020);
        const dome = new THREE.SphereGeometry(0.025, 10, 6);
        dome.translate(tx, py, depthOut + 0.035);
        dualCapGeos.push(cap, dome);
      }
    }
    group.add(new THREE.Mesh(safeMerge(pipeGeos), copperMat));

    const finCount = 26;
    const finSpanZ = depthOut - 0.44;
    const towerGeos = [];
    for (const tx of [-0.34, 0.34]) {
      for (let i = 0; i < finCount; i++) {
        const z = 0.34 + (i / (finCount - 1)) * finSpanZ;
        const fin = new THREE.BoxGeometry(0.43, 1.14, 0.011);
        fin.translate(tx, 0, z);
        towerGeos.push(fin);
      }
      const capPlate = new THREE.Mesh(makeExtrudedBox(0.45, 1.16, 0.034, 0.02, 0.006), topCapMat);
      capPlate.position.set(tx, 0, depthOut - 0.005);
      group.add(capPlate);

      // Subtle machined decorative accent stripe on each tower cap
      const accentBar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.88, 0.008), silverMat);
      accentBar.position.set(tx + (tx < 0 ? -0.14 : 0.14), 0, depthOut + 0.015);
      group.add(accentBar);
    }
    const mergedFins = new THREE.Mesh(safeMerge(towerGeos), finMat);
    mergedFins.castShadow = true;
    group.add(mergedFins);
    group.add(new THREE.Mesh(safeMerge(dualCapGeos), copperMat));

    // Dual 120mm Fans (Center & Front raised slightly along +Z to clear tall DDR5 RAM modules cleanly!)
    const centerFan = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0xd97706 });
    centerFan.rotation.y = Math.PI / 2;
    centerFan.position.set(0.0, 0, depthOut * 0.58);
    const frontFanZ = Math.min(depthOut - 0.52, depthOut * 0.65);
    const frontFan = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0xd97706 });
    frontFan.rotation.y = Math.PI / 2;
    frontFan.position.set(0.68, 0, frontFanZ);
    group.add(centerFan, frontFan);
    addWireClips(0.68, 0.42, 0.52, frontFanZ, 0.90);
  } else {
    // Single-Tower Heatsink (AK400 / NH-U12S style: 4 U-heatpipes, 32 merged crisp aluminum fins, top shroud, wire clips)
    const pipeGeos = [];
    const capGeos = [];
    for (const py of [-0.18, -0.06, 0.06, 0.18]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.21, py, depthOut + 0.016),
        new THREE.Vector3(-0.21, py, 0.34),
        new THREE.Vector3(0, py, 0.062),
        new THREE.Vector3(0.21, py, 0.34),
        new THREE.Vector3(0.21, py, depthOut + 0.016),
      ]);
      pipeGeos.push(new THREE.TubeGeometry(curve, 16, 0.022, 8, false));

      for (const sx of [-0.21, 0.21]) {
        const cap = new THREE.CylinderGeometry(0.026, 0.026, 0.032, 10);
        cap.rotateX(Math.PI / 2);
        cap.translate(sx, py, depthOut + 0.022);
        const dome = new THREE.SphereGeometry(0.026, 10, 6);
        dome.translate(sx, py, depthOut + 0.038);
        capGeos.push(cap, dome);
      }
    }
    group.add(new THREE.Mesh(safeMerge(pipeGeos), copperMat));

    const finCount = 32;
    const finSpanZ = depthOut - 0.34;
    const finGeos = [];
    for (let i = 0; i < finCount; i++) {
      const fz = 0.28 + (i / (finCount - 1)) * finSpanZ;
      const f = new THREE.BoxGeometry(0.66, 1.08, 0.010);
      f.translate(0, 0, fz);
      finGeos.push(f);
    }
    const finStack = new THREE.Mesh(safeMerge(finGeos), finMat);
    finStack.castShadow = true;
    group.add(finStack);

    // Anodized brushed top shroud plate + matrix grooves + protruding domed heatpipe end-caps
    const topCap = new THREE.Mesh(makeExtrudedBox(0.69, 1.11, 0.038, 0.022, 0.006), topCapMat);
    topCap.position.set(0, 0, depthOut);
    group.add(topCap);

    const grooveGeos = [];
    for (const gy of [-0.40, -0.32, 0.32, 0.40]) {
      const gr = new THREE.BoxGeometry(0.52, 0.022, 0.008);
      gr.translate(0, gy, depthOut + 0.020);
      grooveGeos.push(gr);
    }
    group.add(new THREE.Mesh(safeMerge(grooveGeos), silverMat));
    group.add(new THREE.Mesh(safeMerge(capGeos), copperMat));

    // Side-mounted 120mm PWM Fan pushing toward rear (-X) + stainless steel wire clips
    const fanAssembly = _makeFanAssembly(1.06, shroudMat, fanRotors, { depth: 0.22, accentColor: 0x06b6d4 });
    fanAssembly.rotation.y = Math.PI / 2;
    fanAssembly.position.set(0.45, 0, depthOut * 0.58);
    group.add(fanAssembly);
    addWireClips(0.45, 0.16, 0.52, depthOut * 0.58, 0.92);
  }

  group.userData.fanRotors = fanRotors;
  return group;
}

// ---------------------------------------------------------------------------
// 5. RAM (Sculpted Stepped Aluminum Heatspreader, Exposed DRAM ICs + SMD Caps,
//    Notched 288-Pin Gold Fingers, DDR5 Diffuser Light-Bar / DDR4 Fin Comb)
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
    color: isDdr5 ? 0x1b2434 : 0x222730,
    roughness: 0.28,
    metalness: 0.80,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });
  const trimMetalMat = new THREE.MeshStandardMaterial({
    color: isDdr5 ? 0x64748b : 0x991b1b,
    roughness: 0.26,
    metalness: 0.86,
  });
  const rgbDiffuserMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x0284c7,
    emissiveIntensity: 0.28,
    roughness: 0.24,
    metalness: 0.08,
  });
  const goldTex = makeGoldFingersTexture(72, 0.38);
  const fingersMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: goldTex,
    roughness: 0.22,
    metalness: 0.90,
  });
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.62, metalness: 0.12 });
  const icMat = new THREE.MeshStandardMaterial({ color: 0x161c26, roughness: 0.48, metalness: 0.22 });
  const smdGoldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.32, metalness: 0.72 });

  const badgeTex = makeRamSpreaderTexture(comp, isDdr5);
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: badgeTex,
    roughness: 0.34,
    metalness: 0.45,
  });

  for (let i = 0; i < sticks; i++) {
    const stick = new THREE.Group();
    // Aligned with pc-anatomy 4-slot spacing (0.63, 0.73, 0.83, 0.93) relative to anchor x = 0.78 (A2 & B2!)
    const xOffset = sticks === 2 ? (i === 0 ? -0.05 : 0.15) : -0.05;

    // 1. Multi-layer Internal PCB Blade + Side Latch Cutouts
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.016, length, heightOut * 0.78), pcbMat);
    pcb.position.z = heightOut * 0.42;
    stick.add(pcb);

    // 8x Exposed FBGA DRAM ICs + Tiny SMD Decoupling Capacitors above Gold Fingers
    const icGeos = [];
    const smdGeos = [];
    for (let c = 0; c < 8; c++) {
      const cy = -length * 0.40 + c * (length * 0.114);
      const icL = new THREE.BoxGeometry(0.028, length * 0.072, heightOut * 0.14);
      icL.translate(0, cy, heightOut * 0.19);
      icGeos.push(icL);

      const cap = new THREE.BoxGeometry(0.022, 0.016, 0.012);
      cap.translate(0, cy, heightOut * 0.105);
      smdGeos.push(cap);
    }
    stick.add(new THREE.Mesh(safeMerge(icGeos), icMat));
    stick.add(new THREE.Mesh(safeMerge(smdGeos), smdGoldMat));

    // 2. Sculpted Multi-Tier Faceted Aluminum Heatspreader
    const mainBody = new THREE.Mesh(makeExtrudedBox(0.062, length * 0.99, heightOut * 0.62, 0.012, 0.006), spreaderMat);
    mainBody.position.z = heightOut * 0.56;
    mainBody.castShadow = true;
    stick.add(mainBody);

    // Raised stepped angular center shoulder + horizontal CNC ribs on both faces
    const shoulderGeos = [];
    const midPlate = makeExtrudedBox(0.072, length * 0.76, heightOut * 0.36, 0.01, 0.004);
    midPlate.translate(0, 0, heightOut * 0.58);
    shoulderGeos.push(midPlate);
    for (const ry of [-length * 0.43, length * 0.43]) {
      const wing = makeExtrudedBox(0.068, length * 0.10, heightOut * 0.50, 0.008, 0.003);
      wing.translate(0, ry, heightOut * 0.60);
      shoulderGeos.push(wing);
    }
    stick.add(new THREE.Mesh(safeMerge(shoulderGeos), spreaderMat));

    // Recessed flush silkscreened brand plate on BOTH +X and -X flanks
    const stickerR = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.66, heightOut * 0.28), badgeMat);
    stickerR.rotation.y = Math.PI / 2;
    stickerR.rotation.z = Math.PI / 2;
    stickerR.position.set(0.0372, 0, heightOut * 0.58);

    const stickerL = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.66, heightOut * 0.28), badgeMat);
    stickerL.rotation.y = -Math.PI / 2;
    stickerL.rotation.z = -Math.PI / 2;
    stickerL.position.set(-0.0372, 0, heightOut * 0.58);
    stick.add(stickerR, stickerL);

    // 3. Top Crest: DDR5 Frosted RGB Diffuser + Anodized Clasps OR DDR4 Serrated Cooling Fin Comb
    if (isDdr5) {
      const lightBar = new THREE.Mesh(makeExtrudedBox(0.044, length * 0.94, 0.056, 0.008, 0.004), rgbDiffuserMat);
      lightBar.position.z = heightOut * 0.90;
      stick.add(lightBar);

      // 2 Machined metallic bridge clasps wrapping across the light-pipe
      const claspGeos = [];
      for (const cy of [-length * 0.24, length * 0.24]) {
        const cl = new THREE.BoxGeometry(0.052, 0.055, 0.064);
        cl.translate(0, cy, heightOut * 0.90);
        claspGeos.push(cl);
      }
      stick.add(new THREE.Mesh(safeMerge(claspGeos), spreaderMat));
    } else {
      // Precision anodized aluminum serrated top cooling comb + thin metallic accent trim
      const combGeos = [];
      for (let t = 0; t < 12; t++) {
        const ty = -length * 0.44 + (t / 11) * (length * 0.88);
        const tooth = new THREE.BoxGeometry(0.052, 0.068, 0.052);
        tooth.translate(0, ty, heightOut * 0.90);
        combGeos.push(tooth);
      }
      stick.add(new THREE.Mesh(safeMerge(combGeos), spreaderMat));

      const trimLine = new THREE.Mesh(new THREE.BoxGeometry(0.068, length * 0.86, 0.014), trimMetalMat);
      trimLine.position.z = heightOut * 0.855;
      stick.add(trimLine);
    }

    // 4. Asymmetric Keyed 288-Pin Gold Edge Connector (split around physical key notch!)
    const upperPins = new THREE.Mesh(new THREE.BoxGeometry(0.020, length * 0.53, 0.062), fingersMat);
    upperPins.position.set(0, length * 0.215, 0.031);
    const lowerPins = new THREE.Mesh(new THREE.BoxGeometry(0.020, length * 0.37, 0.062), fingersMat);
    lowerPins.position.set(0, -length * 0.295, 0.031);
    const notchGap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.048, 0.045), pcbMat);
    notchGap.position.set(0, -length * 0.08, 0.035);
    stick.add(upperPins, lowerPins, notchGap);

    stick.position.x = xOffset;
    group.add(stick);
  }

  return group;
}

// ---------------------------------------------------------------------------
// 6. GPU (Z-Fight-Free Heatsink Stack, Curved Heatpipes, Sculpted Shroud,
//    Swept Axial Fans, Louvered Vented Backplate with Die SMD Array & X-Clamp,
//    Dual-Slot Shielded HDMI/DP Bracket, 12VHPWR/8-Pin Header & PCIe Gold Fingers)
// ---------------------------------------------------------------------------

export function createGpuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 268, h: 118, d: 42 };
  const len = dims.w * S;
  const depthZ = dims.h * S;
  const thickY = dims.d * S;
  const fanCount = len >= 2.9 ? 3 : 2;

  const tag = `${comp?.brand || ''} ${comp?.model || ''} ${comp?.name || ''}`.toUpperCase();
  const isAmd = tag.includes('RADEON') || tag.includes('RX ') || tag.includes('AMD');
  const isIntel = tag.includes('ARC') || tag.includes('INTEL');
  const brandAccentHex = isAmd ? 0xef4444 : isIntel ? 0x38bdf8 : 0x76b900;

  const group = new THREE.Group();
  group.name = `Hardware_gpu_${comp?.id || 'gpu'}`;
  const fanRotors = [];
  const brushedBump = makeBrushedMetalBumpTexture();

  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0x1b222e,
    roughness: 0.44,
    metalness: 0.48,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });
  const shroudAccentMat = new THREE.MeshStandardMaterial({
    color: 0x3a4659,
    roughness: 0.28,
    metalness: 0.84,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });
  const backplateMat = new THREE.MeshStandardMaterial({
    color: 0x151c27,
    roughness: 0.30,
    metalness: 0.78,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xbac4d1, roughness: 0.32, metalness: 0.88 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xc86b3c, roughness: 0.24, metalness: 0.92 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ed, roughness: 0.22, metalness: 0.92 });
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.64, metalness: 0.14 });
  const portDarkMat = new THREE.MeshStandardMaterial({ color: 0x070a10, roughness: 0.82, metalness: 0.1 });
  const smdMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.32, metalness: 0.75 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGoldFingersTexture(84, 0.22),
    roughness: 0.22,
    metalness: 0.90,
  });

  const centerShiftX = (len - 2.0) * 0.5;
  // Real ATX PCIe vertical anatomy:
  // - PCIe edge fingers & GPU PCB sit flush at y = 0.0 (directly in the motherboard PCIe x16 slot!)
  // - Vented backplate sits directly above PCB at y = +0.032 (clears M.2 & CPU cooler cleanly!)
  // - Heatsink, heatpipes, shroud & axial fans hang DOWNWARD (-Y) across 2–3 expansion slots!
  const dropY = Math.max(0.32, thickY - 0.035);
  const bodyCenterY = -dropY * 0.48;

  // 1. Packed Multi-Fin Aluminum Heatsink Array (strictly bounded below PCB & backplate — ZERO Z-fighting!)
  const finCount = 46;
  const finSpanX = len * 0.88;
  const finH = dropY * 0.58; // Spans y = -(dropY*0.16) down to -(dropY*0.74), strictly under PCB (0.0)
  const finCenterY = -dropY * 0.44;
  const finGeos = [];
  for (let i = 0; i < finCount; i++) {
    const fx = centerShiftX - finSpanX * 0.5 + (i / (finCount - 1)) * finSpanX;
    const fg = new THREE.BoxGeometry(0.014, finH, depthZ * 0.78);
    fg.translate(fx, finCenterY, depthZ * 0.49);
    finGeos.push(fg);
  }
  const heatsink = new THREE.Mesh(safeMerge(finGeos), finMat);
  heatsink.castShadow = true;
  group.add(heatsink);

  // 2. 4 Curved Copper Heatpipes running through fin stack beneath PCB
  const pipeGeos = [];
  for (const [hz, hy] of [
    [depthZ * 0.22, -dropY * 0.34],
    [depthZ * 0.44, -dropY * 0.48],
    [depthZ * 0.66, -dropY * 0.48],
    [depthZ * 0.88, -dropY * 0.34],
  ]) {
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(centerShiftX - len * 0.43, hy, hz),
      new THREE.Vector3(centerShiftX - len * 0.14, -dropY * 0.28, depthZ * 0.49),
      new THREE.Vector3(centerShiftX + len * 0.14, -dropY * 0.28, depthZ * 0.49),
      new THREE.Vector3(centerShiftX + len * 0.43, hy, hz),
    ]);
    pipeGeos.push(new THREE.TubeGeometry(pipeCurve, 16, 0.021, 8, false));
  }
  group.add(new THREE.Mesh(safeMerge(pipeGeos), copperMat));

  // 3. Internal Multi-Layer PCB flush at y = 0.0 directly joining Gold PCIe x16 Edge Fingers & Retention Hook
  const gpuPcb = new THREE.Mesh(new THREE.BoxGeometry(len * 0.72, 0.022, depthZ * 0.88), pcbMat);
  gpuPcb.position.set(centerShiftX - len * 0.11, 0.004, depthZ * 0.46);
  group.add(gpuPcb);

  const pcieFingers = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.026, 0.092), goldMat);
  pcieFingers.position.set(0.0, 0.0, 0.0);
  const pcieHook = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.075), pcbMat);
  pcieHook.position.set(0.51, 0.0, 0.018);
  group.add(pcieFingers, pcieHook);

  // 4. Brushed Anodized Vented Backplate (+Y directly above PCB) with Flow-Through Louvers, Core SMD Bay & X-Clamp
  const bpY = 0.032;
  const bpShape = makeRoundedRectShape(len, depthZ, 0.035);
  const ventCut = new THREE.Path();
  ventCut.moveTo(len * 0.18, -depthZ * 0.31);
  ventCut.lineTo(len * 0.43, -depthZ * 0.31);
  ventCut.lineTo(len * 0.43, depthZ * 0.31);
  ventCut.lineTo(len * 0.18, depthZ * 0.31);
  ventCut.closePath();
  bpShape.holes.push(ventCut);

  const coreCut = new THREE.Path();
  coreCut.moveTo(-len * 0.23, -0.14);
  coreCut.lineTo(-len * 0.05, -0.14);
  coreCut.lineTo(-len * 0.05, 0.14);
  coreCut.lineTo(-len * 0.23, 0.14);
  coreCut.closePath();
  bpShape.holes.push(coreCut);

  const bpGeo = new THREE.ExtrudeGeometry(bpShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 1,
  });
  bpGeo.center();
  bpGeo.rotateX(Math.PI / 2);
  const backplate = new THREE.Mesh(bpGeo, backplateMat);
  backplate.position.set(centerShiftX, bpY, depthZ * 0.50);
  group.add(backplate);

  // Laser-etched subtle backplate geometric graphics overlay
  const bpDecalTex = makeGpuBackplateDecalTexture(comp);
  const bpDecal = new THREE.Mesh(
    new THREE.PlaneGeometry(len * 0.62, depthZ * 0.78),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bpDecalTex,
      transparent: true,
      roughness: 0.35,
      metalness: 0.4,
      depthWrite: false,
    })
  );
  bpDecal.rotation.x = -Math.PI / 2;
  bpDecal.position.set(centerShiftX - len * 0.16, bpY + 0.016, depthZ * 0.50);
  group.add(bpDecal);

  // Diagonal aluminum louver slats across flow-through vent window
  const louverGeos = [];
  for (let l = 0; l < 5; l++) {
    const lx = centerShiftX + len * (0.21 + l * 0.048);
    const bar = new THREE.BoxGeometry(0.022, 0.016, depthZ * 0.60);
    bar.rotateY(0.18);
    bar.translate(lx, bpY, depthZ * 0.50);
    louverGeos.push(bar);
  }
  group.add(new THREE.Mesh(safeMerge(louverGeos), shroudAccentMat));

  // Exposed rear GPU die MLCC capacitor cluster + Brushed Steel X-Clamp with 4 corner screws
  const dieCapGeos = [];
  const coreX = centerShiftX - len * 0.14;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      if (Math.abs(r) <= 0.5 && Math.abs(c) <= 0.5) continue;
      const cg = new THREE.BoxGeometry(0.018, 0.010, 0.012);
      cg.translate(coreX + c * 0.032, 0.018, depthZ * 0.50 + r * 0.032);
      dieCapGeos.push(cg);
    }
  }
  group.add(new THREE.Mesh(safeMerge(dieCapGeos), smdMat));

  const xBar1 = new THREE.BoxGeometry(0.24, 0.012, 0.030);
  xBar1.rotateY(Math.PI / 4);
  const xBar2 = new THREE.BoxGeometry(0.24, 0.012, 0.030);
  xBar2.rotateY(-Math.PI / 4);
  const clampScrews = [xBar1, xBar2];
  for (const [sx, sz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
    const cs = new THREE.CylinderGeometry(0.018, 0.018, 0.022, 10);
    cs.translate(sx, 0.007, sz);
    clampScrews.push(cs);
  }
  const xClamp = new THREE.Mesh(safeMerge(clampScrews), steelMat);
  xClamp.position.set(coreX, bpY - 0.002, depthZ * 0.50);
  group.add(xClamp);

  // 6 tiny perimeter backplate hex screws
  const bpScrewGeos = [];
  for (const [bx, bz] of [
    [-len * 0.45, -depthZ * 0.40], [0, -depthZ * 0.40], [len * 0.45, -depthZ * 0.40],
    [-len * 0.45, depthZ * 0.40], [0, depthZ * 0.40], [len * 0.45, depthZ * 0.40],
  ]) {
    const bs = new THREE.CylinderGeometry(0.016, 0.016, 0.014, 6);
    bs.translate(centerShiftX + bx, bpY + 0.014, depthZ * 0.50 + bz);
    bpScrewGeos.push(bs);
  }
  group.add(new THREE.Mesh(safeMerge(bpScrewGeos), steelMat));

  // 5. Sculpted Multi-Plane Bottom Fan Shroud (-Y) with Chamfered Fan Bores & Metallic Trim Accents
  const fanSize = Math.min(0.84, (len * 0.78) / fanCount);
  const shroudShape = makeRoundedRectShape(len, depthZ, 0.045);
  const fanXCoords = [];
  for (let i = 0; i < fanCount; i++) {
    const localFx = -((fanCount - 1) * 0.5 * (fanSize * 1.06)) + i * (fanSize * 1.06);
    fanXCoords.push(localFx);
    const hole = new THREE.Path();
    hole.absarc(localFx, 0, fanSize * 0.445, 0, Math.PI * 2, true);
    shroudShape.holes.push(hole);
  }
  const shroudDepth = dropY * 0.28;
  const shroudGeo = new THREE.ExtrudeGeometry(shroudShape, {
    depth: shroudDepth,
    bevelEnabled: true,
    bevelThickness: 0.010,
    bevelSize: 0.010,
    bevelSegments: 2,
    curveSegments: 18,
  });
  shroudGeo.center();
  shroudGeo.rotateX(Math.PI / 2);
  const shroudY = -dropY + shroudDepth * 0.5 + 0.012;
  const shroud = new THREE.Mesh(shroudGeo, shroudMat);
  shroud.position.set(centerShiftX, shroudY, depthZ * 0.50);
  shroud.castShadow = true;
  group.add(shroud);

  // Machined brushed-gunmetal fan-bore trim rings on bottom shroud face
  const trimRingGeos = [];
  for (const localFx of fanXCoords) {
    const tr = new THREE.TorusGeometry(fanSize * 0.455, 0.013, 8, 28);
    tr.rotateX(Math.PI / 2);
    tr.translate(centerShiftX + localFx, -dropY + 0.004, depthZ * 0.50);
    trimRingGeos.push(tr);
  }
  group.add(new THREE.Mesh(safeMerge(trimRingGeos), shroudAccentMat));

  // Sculpted Side Shroud Frame (+Z) revealing aluminum fins + sleek satin nameplate + thin accent LED
  const endCapL = new THREE.Mesh(makeExtrudedBox(0.14, dropY * 0.90, 0.08, 0.015, 0.005), shroudMat);
  endCapL.position.set(centerShiftX - len * 0.46, bodyCenterY, depthZ - 0.035);
  const endCapR = new THREE.Mesh(makeExtrudedBox(0.16, dropY * 0.90, depthZ * 0.94, 0.02, 0.006), shroudMat);
  endCapR.position.set(centerShiftX + len * 0.46, bodyCenterY, depthZ * 0.50);
  const sideTopRail = new THREE.Mesh(makeExtrudedBox(len * 0.96, 0.048, 0.08, 0.01, 0.004), shroudAccentMat);
  sideTopRail.position.set(centerShiftX, -0.012, depthZ - 0.03);
  const sideLedBar = new THREE.Mesh(
    new THREE.BoxGeometry(len * 0.48, 0.012, 0.014),
    new THREE.MeshStandardMaterial({
      color: brandAccentHex,
      emissive: brandAccentHex,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    })
  );
  sideLedBar.position.set(centerShiftX - 0.04, -0.012, depthZ + 0.012);
  group.add(endCapL, endCapR, sideTopRail, sideLedBar);

  // Satin brushed side brand nameplate (+Z visible face)
  const gpuTex = makeGpuNameplateTexture(comp);
  const badgeW = Math.min(1.26, len * 0.50);
  const badgeH = Math.max(0.20, dropY * 0.48);
  const sideBadgeBack = new THREE.Mesh(makeExtrudedBox(badgeW + 0.035, badgeH + 0.022, 0.042, 0.01, 0.004), backplateMat);
  sideBadgeBack.position.set(centerShiftX - 0.04, -dropY * 0.40, depthZ - 0.01);
  const sideBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(badgeW, badgeH),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: gpuTex, roughness: 0.34, metalness: 0.38 })
  );
  sideBadge.position.set(centerShiftX - 0.04, -dropY * 0.40, depthZ + 0.014);
  group.add(sideBadgeBack, sideBadge);

  // Axial Fans seated neatly inside the circular shroud bores
  for (const localFx of fanXCoords) {
    const fan = _makeFanAssembly(fanSize, shroudMat, fanRotors, { depth: 0.14, showStruts: false, bladeCount: 9 });
    fan.rotation.x = Math.PI / 2;
    fan.position.set(centerShiftX + localFx, shroudY - 0.01, depthZ * 0.50);
    group.add(fan);
  }

  // 6. Dual/Triple-Slot Brushed Stainless Rear I/O Bracket (-X) aligned to downward GPU slots
  const rearBracket = new THREE.Mesh(makeExtrudedBox(0.034, dropY + 0.12, depthZ + 0.08, 0.01, 0.004), steelMat);
  rearBracket.position.set(centerShiftX - len / 2 + 0.01, -dropY * 0.46, depthZ * 0.50);
  group.add(rearBracket);

  const portShieldGeos = [];
  const portCavityGeos = [];
  for (let p = 0; p < 4; p++) {
    const pz = depthZ * 0.24 + p * 0.19;
    const shield = new THREE.BoxGeometry(0.052, 0.056, 0.135);
    shield.translate(centerShiftX - len / 2 - 0.018, -0.075, pz);
    portShieldGeos.push(shield);

    const cavity = new THREE.BoxGeometry(0.024, 0.034, 0.108);
    cavity.translate(centerShiftX - len / 2 - 0.038, -0.075, pz);
    portCavityGeos.push(cavity);
  }
  // Exhaust slots below ports on dual/triple-slot bracket
  for (let s = 0; s < 5; s++) {
    const slot = new THREE.BoxGeometry(0.042, 0.055, 0.09);
    slot.translate(centerShiftX - len / 2 + 0.01, -dropY * 0.66, depthZ * 0.22 + s * 0.14);
    portCavityGeos.push(slot);
  }
  group.add(new THREE.Mesh(safeMerge(portShieldGeos), steelMat));
  group.add(new THREE.Mesh(safeMerge(portCavityGeos), portDarkMat));

  // 7. Recessed 8-Pin / 12VHPWR Power Header flush on +Z GPU PCB Edge (synced to CableRoutingSystem)
  const pwrX = centerShiftX + len * 0.32;
  const pwrPlug = new THREE.Mesh(makeExtrudedBox(0.23, 0.098, 0.115, 0.01, 0.004), portDarkMat);
  pwrPlug.position.set(pwrX, 0.004, depthZ - 0.04);
  const pwrLatch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), shroudAccentMat);
  pwrLatch.position.set(pwrX, 0.058, depthZ - 0.01);
  const pinHoleGeos = [];
  for (let c = -1.5; c <= 1.5; c += 1) {
    for (const r of [-0.018, 0.018]) {
      const pin = new THREE.BoxGeometry(0.024, 0.020, 0.012);
      pin.translate(pwrX + c * 0.042, 0.004 + r, depthZ + 0.018);
      pinHoleGeos.push(pin);
    }
  }
  group.add(pwrPlug, pwrLatch, new THREE.Mesh(safeMerge(pinHoleGeos), steelMat));

  // 8. Rear Expansion Bracket Fastener Thumbscrew (MUST preserve userData.fastenerScrews)
  const gpuScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.055, 12), steelMat);
  gpuScrew.rotation.z = Math.PI / 2;
  gpuScrew.position.set(centerShiftX - len / 2 - 0.074, 0.06, 0.04);
  gpuScrew.visible = false;
  group.add(gpuScrew);

  group.userData.fastenerScrews = [gpuScrew];
  group.userData.fanRotors = fanRotors;
  return group;
}

// ---------------------------------------------------------------------------
// 7. PSU (Chamfered Powder-Coated Body, Authentic Wattage & DC Rail Nameplate,
//    Recessed Fan with Internal Copper Coils, Wire Grille, C14 AC Inlet & Rocker,
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
    roughness: 0.48,
    metalness: 0.56,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a3444, roughness: 0.32, metalness: 0.82 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.28, metalness: 0.88 });
  const meshMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeHoneycombMeshTexture(), roughness: 0.72, metalness: 0.30 });
  const plugMat = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.74, metalness: 0.10 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xb85d2e, roughness: 0.28, metalness: 0.88 });

  // 1. Chamfered Powder-Coated Chassis + Corner Stamped Trim Strips
  const chassis = new THREE.Mesh(makeExtrudedBox(lenX, hY, wZ, 0.03, 0.01), bodyMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // Subtle machined perimeter seam lines & chassis screws on top/side edges
  const seamScrewGeos = [];
  for (const [sx, sz] of [
    [-lenX * 0.44, -wZ * 0.44], [lenX * 0.44, -wZ * 0.44],
    [-lenX * 0.44, wZ * 0.44], [lenX * 0.44, wZ * 0.44],
  ]) {
    const sc = new THREE.CylinderGeometry(0.018, 0.018, 0.014, 8);
    sc.translate(sx, hY / 2 + 0.004, sz);
    seamScrewGeos.push(sc);
  }
  group.add(new THREE.Mesh(safeMerge(seamScrewGeos), metalMat));

  // 2. Authentic Industrial Wattage & DC Rail Nameplate Decal on +Z Visible Side Face
  const labelTex = makePsuLabelTexture(comp);
  const sideLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(lenX * 0.86, hY * 0.78),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.42, metalness: 0.12 })
  );
  sideLabel.position.set(0, 0, wZ / 2 + 0.005);
  group.add(sideLabel);

  // 3. Recessed 120mm Intake Fan on -Y Bottom Face + Subtle Internal Toroid Coils + Wire Grille
  const fan = _makeFanAssembly(1.08, bodyMat, fanRotors, { depth: 0.14, showStruts: false, bladeCount: 9 });
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, -hY / 2 - 0.006, 0);
  group.add(fan);

  // Internal copper PFC toroid & bulk capacitor silhouette visible subtly inside bore
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 16), copperMat);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(0.24, -hY / 2 + 0.06, -0.18);
  group.add(coil);

  const grilleGeos = [];
  for (const r of [0.18, 0.31, 0.44, 0.56]) {
    const t = new THREE.TorusGeometry(r, 0.010, 8, 30);
    t.rotateX(Math.PI / 2);
    t.translate(0, -hY / 2 - 0.022, 0);
    grilleGeos.push(t);
  }
  const crossA = new THREE.BoxGeometry(1.14, 0.014, 0.018);
  crossA.translate(0, -hY / 2 - 0.022, 0);
  const crossB = new THREE.BoxGeometry(0.018, 0.014, 1.14);
  crossB.translate(0, -hY / 2 - 0.022, 0);
  grilleGeos.push(crossA, crossB);
  for (const [gx, gz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) {
    const gs = new THREE.CylinderGeometry(0.022, 0.022, 0.016, 8);
    gs.translate(gx, -hY / 2 - 0.020, gz);
    grilleGeos.push(gs);
  }
  group.add(new THREE.Mesh(safeMerge(grilleGeos), metalMat));

  // 4. Rear Exhaust (-X): Recessed Honeycomb Vent + Chamfered IEC C14 AC Inlet (3 brass prongs) + I/O Rocker
  const rearMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, hY * 0.78, wZ * 0.44), meshMat);
  rearMesh.position.set(-lenX / 2 - 0.005, 0.04, 0.28);
  group.add(rearMesh);

  const acBezel = new THREE.Mesh(makeExtrudedBox(0.042, 0.25, 0.32, 0.012, 0.004), trimMat);
  acBezel.position.set(-lenX / 2 - 0.008, -0.14, -0.28);
  const acCavity = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.19, 0.25), plugMat);
  acCavity.position.set(-lenX / 2 - 0.016, -0.14, -0.28);
  group.add(acBezel, acCavity);

  const prongGeos = [];
  for (const [py, pz] of [[-0.08, -0.28], [-0.18, -0.35], [-0.18, -0.21]]) {
    const pr = new THREE.BoxGeometry(0.05, 0.030, 0.015);
    pr.translate(-lenX / 2 - 0.022, py, pz);
    prongGeos.push(pr);
  }
  group.add(new THREE.Mesh(safeMerge(prongGeos), brassMat));

  const rockerBezel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.18, 0.13), plugMat);
  rockerBezel.position.set(-lenX / 2 - 0.008, -0.14, -0.02);
  const rocker = new THREE.Mesh(
    new THREE.BoxGeometry(0.052, 0.14, 0.095),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.12 })
  );
  rocker.rotation.z = 0.14;
  rocker.position.set(-lenX / 2 - 0.018, -0.14, -0.02);
  group.add(rockerBezel, rocker);

  // 5. Front Modular Connector Output Bank (+X) with Molded Socket Housings & Pin Cavities
  const modPanel = new THREE.Mesh(makeExtrudedBox(0.032, hY * 0.80, wZ * 0.84, 0.015, 0.004), trimMat);
  modPanel.position.set(lenX / 2 + 0.006, 0, 0);
  group.add(modPanel);

  const modSocketGeos = [];
  const modTrimGeos = [];
  for (const [my, mz, mh, mw] of [
    [0.16, -0.34, 0.16, 0.36],
    [-0.14, -0.36, 0.14, 0.26],
    [0.16, 0.15, 0.14, 0.22],
    [0.16, 0.42, 0.14, 0.22],
    [-0.14, 0.08, 0.12, 0.18],
    [-0.14, 0.34, 0.12, 0.18],
  ]) {
    const ms = new THREE.BoxGeometry(0.044, mh, mw);
    ms.translate(lenX / 2 + 0.024, my, mz);
    modSocketGeos.push(ms);
    const frame = new THREE.BoxGeometry(0.016, mh + 0.022, mw + 0.022);
    frame.translate(lenX / 2 + 0.020, my, mz);
    modTrimGeos.push(frame);
  }
  group.add(new THREE.Mesh(safeMerge(modTrimGeos), metalMat));
  group.add(new THREE.Mesh(safeMerge(modSocketGeos), plugMat));

  // 6. Rear PSU Mounting Screws (MUST preserve userData.fastenerScrews)
  const psuScrews = [];
  const psuScrewMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.22, metalness: 0.92 });
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

  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b121e, roughness: 0.62, metalness: 0.14 });
  const greenPcbMat = new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 0.54, metalness: 0.14 });
  const icMat = new THREE.MeshStandardMaterial({ color: 0x1b222e, roughness: 0.44, metalness: 0.28 });
  const plugBlackMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.72, metalness: 0.10 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGoldFingersTexture(28, 0.22),
    roughness: 0.22,
    metalness: 0.90,
  });
  const plainGold = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xb8c2d0,
    roughness: 0.28,
    metalness: 0.86,
    bumpMap: brushedBump,
    bumpScale: 0.0035,
  });

  if (kind === 'm2_nvme') {
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.22, 0.020), pcbMat);
    group.add(pcb);

    // M-key notched gold edge fingers (-X)
    const fingersTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.125, 0.023), goldMat);
    fingersTop.position.set(-0.39, 0.038, 0);
    const fingersBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.042, 0.023), plainGold);
    fingersBot.position.set(-0.39, -0.074, 0);
    group.add(fingersTop, fingersBot);

    // Exposed Nickel-Shielded Controller IC, DRAM cache, 2x 3D NAND packages & Perimeter Micro SMD Caps
    const ctrl = new THREE.Mesh(makeExtrudedBox(0.115, 0.125, 0.018, 0.008, 0.002), metalMat);
    ctrl.position.set(-0.24, 0, 0.017);
    const dram = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.10, 0.016), icMat);
    dram.position.set(-0.12, 0, 0.016);
    const nand1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.155, 0.016), icMat);
    nand1.position.set(0.04, 0, 0.016);
    const nand2 = nand1.clone();
    nand2.position.set(0.24, 0, 0.016);
    group.add(ctrl, dram, nand1, nand2);

    const smdGeos = [];
    for (let s = 0; s < 8; s++) {
      const sx = -0.32 + s * 0.088;
      const c1 = new THREE.BoxGeometry(0.016, 0.010, 0.008);
      c1.translate(sx, 0.092, 0.013);
      const c2 = new THREE.BoxGeometry(0.016, 0.010, 0.008);
      c2.translate(sx, -0.092, 0.013);
      smdGeos.push(c1, c2);
    }
    group.add(new THREE.Mesh(safeMerge(smdGeos), plainGold));

    // Authentic Copper-Graphene Thermal Film Sticker over NAND
    const labelTex = makeSsdLabelTexture(comp, 'm2_nvme');
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.185),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.36, metalness: 0.25 })
    );
    sticker.position.set(0.14, 0, 0.0255);
    group.add(sticker);

    // Copper-plated half-moon standoff mounting ring (+X)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 16, Math.PI), plainGold);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(0.395, 0, 0.010);
    group.add(ring);
  } else if (kind === 'sata_35') {
    // 3.5" SATA HDD: Ribbed cast aluminum chassis + brushed stamped stainless lid + spindle hub + spec sticker + underside PCB + molded L-SATA
    const housing = new THREE.Mesh(makeExtrudedBox(1.02, 0.23, 1.46, 0.035, 0.01), icMat);
    housing.castShadow = true;
    const topLid = new THREE.Mesh(makeExtrudedBox(0.94, 0.034, 1.38, 0.028, 0.006), metalMat);
    topLid.position.y = 0.118;

    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.215, 0.042, 26), metalMat);
    spindle.position.set(0, 0.140, -0.22);
    const spindleHub = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.048, 20), icMat);
    spindleHub.position.set(0, 0.146, -0.22);

    // Industrial HDD spec decal on front half of lid
    const hddTex = makeSsdLabelTexture(comp, 'sata_35');
    const hddLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.86),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: hddTex, roughness: 0.42 })
    );
    hddLabel.rotation.x = -Math.PI / 2;
    hddLabel.position.set(0, 0.138, 0.20);

    // Underside green logic PCB + BGA controller IC
    const logicPcb = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.018, 0.68), greenPcbMat);
    logicPcb.position.set(0, -0.122, -0.32);
    const logicIc = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.016, 0.22), plugBlackMat);
    logicIc.position.set(-0.10, -0.135, -0.28);

    // Molded Black L-Keyed SATA 15-Pin Power + 7-Pin Data Housings with Gold Pins (-Z rear)
    const sataHousing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.056, 0.085), plugBlackMat);
    sataHousing.position.set(-0.08, -0.055, -0.735);
    const sataPwr = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.018, 0.075), plainGold);
    sataPwr.position.set(-0.21, -0.052, -0.745);
    const sataData = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.075), plainGold);
    sataData.position.set(0.04, -0.052, -0.745);

    // 6 perimeter Torx lid screws + 6 spindle hub screws
    const torxGeos = [];
    for (const [sx, sz] of [[-0.41, -0.58], [0.41, -0.58], [-0.41, 0], [0.41, 0], [-0.41, 0.58], [0.41, 0.58]]) {
      const ts = new THREE.CylinderGeometry(0.021, 0.021, 0.018, 6);
      ts.translate(sx, 0.138, sz);
      torxGeos.push(ts);
    }
    for (let h = 0; h < 6; h++) {
      const a = (h / 6) * Math.PI * 2;
      const hs = new THREE.CylinderGeometry(0.014, 0.014, 0.016, 6);
      hs.translate(Math.cos(a) * 0.135, 0.162, -0.22 + Math.sin(a) * 0.135);
      torxGeos.push(hs);
    }
    group.add(
      housing, topLid, spindle, spindleHub, hddLabel,
      logicPcb, logicIc, sataHousing, sataPwr, sataData,
      new THREE.Mesh(safeMerge(torxGeos), metalMat)
    );
  } else {
    // 2.5" SATA SSD: Chamfered brushed anodized clamshell + industrial graphic + molded L-SATA ports + side mounting holes
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x1b2330,
      roughness: 0.34,
      metalness: 0.74,
      bumpMap: brushedBump,
      bumpScale: 0.0035,
    });
    const shell = new THREE.Mesh(makeExtrudedBox(0.70, 0.076, 1.00, 0.032, 0.008), shellMat);
    shell.castShadow = true;

    // Subtle anodized seam chamfer ring around perimeter (extruded shell outer X = ±0.358, Y = ±0.046)
    const seamLine = new THREE.Mesh(new THREE.BoxGeometry(0.720, 0.008, 1.004), metalMat);
    seamLine.position.y = -0.004;

    // Clean industrial SSD graphic decal sitting crisply above beveled shell top (y = 0.046)
    const tex = makeSsdLabelTexture(comp, 'sata_25');
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.88),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.36, metalness: 0.16 })
    );
    sticker.rotation.x = -Math.PI / 2;
    sticker.position.y = 0.0475;

    // 4 subtle recessed M3 mounting holes flush on left & right shell sides
    const mountGeos = [];
    for (const mx of [-0.360, 0.360]) {
      for (const mz of [-0.32, 0.32]) {
        const mh = new THREE.CylinderGeometry(0.016, 0.016, 0.010, 10);
        mh.rotateZ(Math.PI / 2);
        mh.translate(mx, 0, mz);
        mountGeos.push(mh);
      }
    }

    // Molded Black L-Keyed SATA 15-Pin Power + 7-Pin Data Housings with Gold Pins (-Z rear)
    const sataHousing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.048, 0.072), plugBlackMat);
    sataHousing.position.set(-0.07, -0.012, -0.495);
    const sataPwr = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.015, 0.068), plainGold);
    sataPwr.position.set(-0.17, -0.010, -0.504);
    const sataData = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.015, 0.068), plainGold);
    sataData.position.set(0.045, -0.010, -0.504);

    group.add(shell, seamLine, sticker, new THREE.Mesh(safeMerge(mountGeos), plugBlackMat), sataHousing, sataPwr, sataData);
  }

  return group;
}

// ---------------------------------------------------------------------------
// 9. Case Fan (Octagonal Frame, Swept Scimitar Blades, Embossed Rim Airflow Badge)
// ---------------------------------------------------------------------------

export function createCaseFanModel(comp) {
  const sz = Math.min(1.4, (comp?.dimensionsMm?.w || 120) * S);
  const group = new THREE.Group();
  group.name = `Hardware_case_fan_${comp?.id || 'fan'}`;
  const fanRotors = [];

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.52, metalness: 0.34 });
  const fan = _makeFanAssembly(sz, frameMat, fanRotors, {
    depth: 0.25,
    accentColor: 0x38bdf8,
    showStruts: true,
    bladeCount: 9,
  });
  group.add(fan);

  // Flush industrial airflow direction plate molded onto top rim (arrow points toward local -Z exhaust)
  const airflowPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.21, 0.056),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeFanAirflowLabelTexture(),
      roughness: 0.40,
      metalness: 0.20,
    })
  );
  airflowPlate.rotation.x = -Math.PI / 2;
  airflowPlate.rotation.z = Math.PI / 2; // Canvas +X arrow aligns with local -Z exhaust!
  airflowPlate.position.set(0, sz * 0.5 + 0.0085, 0);
  group.add(airflowPlate);

  // Subtle 4-pin PWM black braided pigtail stub exiting lower-right corner
  const wireCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(sz * 0.42, -sz * 0.42, -0.06),
    new THREE.Vector3(sz * 0.50, -sz * 0.46, -0.10),
    new THREE.Vector3(sz * 0.54, -sz * 0.34, -0.12),
  ]);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x0d121a, roughness: 0.78, metalness: 0.08 });
  const pigtail = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 8, 0.014, 6, false), wireMat);
  const pwmPlug = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.036, 0.068), wireMat);
  pwmPlug.position.set(sz * 0.54, -sz * 0.31, -0.12);
  group.add(pigtail, pwmPlug);

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
// 10. Multi-Strand Sleeved Braided Cables with Machined Combs & Latched Plugs
// ---------------------------------------------------------------------------

export function createCableMesh(cableDef, startPt, endPt, waypoints = null) {
  const group = new THREE.Group();
  group.name = `Cable_${cableDef.id}`;

  const s = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
  const e = new THREE.Vector3(endPt.x, endPt.y, endPt.z);

  let controlPts;
  if (Array.isArray(waypoints) && waypoints.length >= 2) {
    controlPts = waypoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  } else {
    const mid1 = s.clone().lerp(e, 0.28);
    mid1.z -= 0.16;
    mid1.y += 0.12;
    const mid2 = s.clone().lerp(e, 0.72);
    mid2.z += 0.16;
    mid2.y -= 0.05;
    controlPts = [s, mid1, mid2, e];
  }

  // Centripetal spline prevents overshoot/bulging around crisp 90° cable-management bends
  const baseCurve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal', 0.35);
  const braidTex = makeBraidedSleeveTexture();

  const is24Pin = cableDef.id === 'c_24pin';
  const isPowerHeavy = is24Pin || cableDef.id === 'c_8pin_cpu' || cableDef.id === 'c_pcie_8';
  const isFan = cableDef.id.includes('fan');
  const isSataData = cableDef.id === 'c_sata_data';

  // Authentic dark carbon-braided sleeving
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: isSataData ? 0x162231 : 0x1a202c,
    roughness: 0.72,
    metalness: 0.14,
    bumpMap: braidTex,
    bumpScale: 0.010,
  });
  // Color-coded anodized heatshrink collars so each rail stays identifiable at connector ends
  const accentColor = new THREE.Color(cableDef.color || '#3ecf5e');
  const collarMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.42,
    metalness: 0.25,
  });
  const combMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.34,
    metalness: 0.68,
  });
  const plugMat = new THREE.MeshStandardMaterial({
    color: 0x0b1018,
    roughness: 0.62,
    metalness: 0.16,
  });

  // Build parallel multi-strand braided harness with stable ribbon spread (zero pinch/twist)
  const strandCount = is24Pin ? 6 : isPowerHeavy ? 3 : isFan ? 1 : 2;
  const strandRadius = is24Pin ? 0.0135 : isPowerHeavy ? 0.0135 : isFan ? 0.0115 : 0.0135;
  const strandSpacing = is24Pin ? strandRadius * 2.55 : strandRadius * 2.10;
  const tubularSegs = Math.min(72, Math.max(28, controlPts.length * 9));

  const strandGeos = [];
  const sampleCount = Math.max(20, controlPts.length * 4);
  const prevSide = is24Pin ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);

  // Precompute smooth parallel-transport-like side frame along curve so multi-strand ribbons stay flat
  const framePts = [];
  const frameSides = [];
  for (let k = 0; k <= sampleCount; k++) {
    const t = k / sampleCount;
    const pt = baseCurve.getPointAt(t);
    const tan = baseCurve.getTangentAt(t).normalize();
    let side;
    if (is24Pin && t > 0.52) {
      // Spread 24-pin ribbon vertically along Y as it emerges through the grommet into the vertical ATX header
      side = new THREE.Vector3(0, 1, 0).addScaledVector(tan, -tan.y);
      if (side.lengthSq() < 0.04) side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 0, 1));
    } else {
      side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 0.04) {
        side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 0, 1));
      }
    }
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    if (k > 0 && side.dot(prevSide) < 0) side.negate();
    prevSide.copy(side);
    framePts.push(pt);
    frameSides.push(side);
  }

  for (let i = 0; i < strandCount; i++) {
    const offsetAmt = (i - (strandCount - 1) * 0.5) * strandSpacing;
    if (Math.abs(offsetAmt) < 0.001) {
      strandGeos.push(new THREE.TubeGeometry(baseCurve, tubularSegs, strandRadius, 7, false));
    } else {
      const pts = [];
      for (let k = 0; k <= sampleCount; k++) {
        const t = k / sampleCount;
        // Keep 24-pin flat across the tall header; gather smaller harnesses subtly into plugs
        const taper = is24Pin && t > 0.7 ? 0.92 : Math.min(1, Math.sin(t * Math.PI) * 2.4);
        pts.push(framePts[k].clone().addScaledVector(frameSides[k], offsetAmt * (0.46 + 0.54 * taper)));
      }
      const strandCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.35);
      strandGeos.push(new THREE.TubeGeometry(strandCurve, tubularSegs, strandRadius, 7, false));
    }
  }
  const harnessMesh = new THREE.Mesh(safeMerge(strandGeos), sleeveMat);
  harnessMesh.castShadow = true;
  group.add(harnessMesh);

  // Machined Cable Combs placed cleanly on visible front-chamber segments (never clipping behind tray!)
  if (isPowerHeavy) {
    const combW = strandCount * strandSpacing + 0.022;
    const combH = strandRadius * 2.5 + 0.012;
    const combGeo = makeExtrudedBox(combW, combH, 0.032, 0.005, 0.0025);
    const combSamples = cableDef.id === 'c_pcie_8' ? [0.62, 0.78, 0.90] : is24Pin ? [0.80, 0.91] : [0.82, 0.91];
    for (const t of combSamples) {
      const pt = baseCurve.getPointAt(t);
      if (pt.z < -0.72) continue; // Keep combs out of rear tray & grommets
      const tan = baseCurve.getTangentAt(t).normalize();
      const idx = Math.min(sampleCount, Math.round(t * sampleCount));
      const xAxis = frameSides[idx].clone().normalize();
      const yAxis = new THREE.Vector3().crossVectors(tan, xAxis).normalize();
      const orthoX = new THREE.Vector3().crossVectors(yAxis, tan).normalize();
      const basis = new THREE.Matrix4().makeBasis(orthoX, yAxis, tan);
      const comb = new THREE.Mesh(combGeo, combMat);
      comb.position.copy(pt);
      comb.quaternion.setFromRotationMatrix(basis);
      group.add(comb);
    }
  }

  // Oriented Molded Multi-Pin Connector Plugs + Retention Latch + Color-Coded Heatshrink Collar at Endpoints
  const buildPlug = (pos, tangent, sideHint, w, h, l, collarOffsetSign) => {
    const plugGrp = new THREE.Group();
    const housing = new THREE.Mesh(makeExtrudedBox(w, h, l, 0.007, 0.0025), plugMat);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.015, l * 0.70), combMat);
    latch.position.set(0, h * 0.52, 0);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.74, 0.024), collarMat);
    collar.position.set(0, 0, collarOffsetSign * (l * 0.56));
    plugGrp.add(housing, latch, collar);
    plugGrp.position.copy(pos);
    const zAxis = tangent.clone().normalize();
    const xAxis = sideHint.clone().addScaledVector(zAxis, -sideHint.dot(zAxis));
    if (xAxis.lengthSq() < 0.01) {
      plugGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), zAxis);
    } else {
      xAxis.normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      plugGrp.quaternion.setFromRotationMatrix(basis);
    }
    return plugGrp;
  };

  const startW = is24Pin ? 0.24 : isPowerHeavy ? 0.12 : 0.072;
  const startH = is24Pin ? 0.095 : isPowerHeavy ? 0.075 : 0.048;
  const startL = is24Pin ? 0.10 : isPowerHeavy ? 0.095 : 0.076;

  const endW = is24Pin ? 0.40 : isPowerHeavy ? 0.12 : 0.072;
  const endH = is24Pin ? 0.088 : isPowerHeavy ? 0.075 : 0.048;
  const endL = is24Pin ? 0.105 : isPowerHeavy ? 0.095 : 0.076;

  group.add(buildPlug(controlPts[0], baseCurve.getTangentAt(0.015), frameSides[0], startW, startH, startL, 1));
  group.add(
    buildPlug(
      controlPts[controlPts.length - 1],
      baseCurve.getTangentAt(0.985),
      is24Pin ? new THREE.Vector3(0, 1, 0) : frameSides[sampleCount],
      endW,
      endH,
      endL,
      -1
    )
  );

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
