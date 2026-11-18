/**
 * ProceduralHardwareFactory.mjs
 * Builds physically proportioned (1 unit = 100mm) composite 3-12+ part THREE.Group
 * hardware models for all 10 PC component categories with realistic PBR material
 * contrast, readable silkscreen labels, and orientation landmarks.
 */

import * as THREE from 'three';
import { SIM_SCALE_MM_TO_UNITS, detectStorageKind } from './SimulationDataManager.mjs';

const S = SIM_SCALE_MM_TO_UNITS;

function makeLabelTexture(title, subtitle = '', accent = '#3ecf5e', bg = '#121a26', markerCorner = false, width = 512, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  if (markerCorner) {
    // Crisp Pin-1 orientation triangle in top-left
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(22, 22);
    ctx.lineTo(74, 22);
    ctx.lineTo(22, 74);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(title || '').slice(0, 28), width * 0.5, height * 0.46);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(String(subtitle || '').slice(0, 36), width * 0.5, height * 0.66);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMotherboardPcbTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  // Matte dark slate/charcoal PCB
  ctx.fillStyle = '#151c26';
  ctx.fillRect(0, 0, 512, 640);

  // Subtle copper traces grid
  ctx.strokeStyle = '#243245';
  ctx.lineWidth = 2;
  for (let i = 24; i < 500; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 40);
    ctx.lineTo(i, 610);
    ctx.stroke();
  }
  for (let j = 40; j < 610; j += 28) {
    ctx.beginPath();
    ctx.moveTo(24, j);
    ctx.lineTo(488, j);
    ctx.stroke();
  }

  // Board branding & silkscreen legends
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(String(comp?.brand || 'ASUS').toUpperCase(), 34, 600);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(String(comp?.model || comp?.name || 'ATX').slice(0, 24), 34, 622);

  // Header silkscreen callouts
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('CPU_PWR1', 55, 42);
  ctx.fillText('CPU_FAN1', 285, 58);
  ctx.fillText('ATX_24PIN', 415, 250);
  ctx.fillText('M2_1', 210, 355);
  ctx.fillText('PCIEX16', 180, 445);
  ctx.fillText('JFP1', 405, 598);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCpuBottomTexture(comp) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const isPga = String(comp?.socket || '').toUpperCase().includes('AM4');
  ctx.fillStyle = isPga ? '#0f5132' : '#14532d';
  ctx.fillRect(0, 0, 256, 256);

  // Gold LGA pads or AM4 pin matrix
  ctx.fillStyle = '#eab308';
  const step = isPga ? 10 : 12;
  for (let x = 22; x < 234; x += step) {
    for (let y = 22; y < 234; y += step) {
      // Leave central SMD capacitor keepout zone
      if (x > 98 && x < 158 && y > 98 && y < 158) continue;
      ctx.fillRect(x, y, isPga ? 4 : 7, isPga ? 4 : 7);
    }
  }

  // Central SMD capacitor array
  ctx.fillStyle = '#b45309';
  for (let x = 104; x < 152; x += 12) {
    for (let y = 104; y < 152; y += 10) {
      ctx.fillRect(x, y, 7, 5);
    }
  }

  // Pin-1 Gold Chamfer Corner (matches mirrored top-left -X/+Y when flipped in Z!)
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(238, 18);
  ctx.lineTo(198, 18);
  ctx.lineTo(238, 58);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCaseStandOffsAndFrame(caseGroup, dimsMm) {
  const d = (dimsMm?.d || 460) * S; // X length (rear to front)
  const h = (dimsMm?.h || 460) * S; // Y height
  const w = (dimsMm?.w || 220) * S; // Z width (tray back to glass front)

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1e2633,
    roughness: 0.48,
    metalness: 0.72,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x111722,
    roughness: 0.7,
    metalness: 0.25,
  });
  const meshFrontMat = new THREE.MeshStandardMaterial({
    color: 0x161f2c,
    roughness: 0.85,
    metalness: 0.2,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a448,
    roughness: 0.28,
    metalness: 0.88,
  });

  // 1. Rubber Feet (bottom rests at y = 0)
  const footGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.06, 16);
  for (const [fx, fz] of [
    [-d / 2 + 0.3, -w / 2 + 0.25],
    [d / 2 - 0.3, -w / 2 + 0.25],
    [-d / 2 + 0.3, w / 2 - 0.25],
    [d / 2 - 0.3, w / 2 - 0.25],
  ]) {
    const foot = new THREE.Mesh(footGeo, trimMat);
    foot.position.set(fx, 0.03, fz);
    caseGroup.add(foot);
  }

  // 2. Bottom Floor Deck
  const floor = new THREE.Mesh(new THREE.BoxGeometry(d, 0.05, w), steelMat);
  floor.position.set(0, 0.08, 0);
  floor.receiveShadow = true;
  caseGroup.add(floor);

  // 3. Top Roof Panel with top fan grille recess & front I/O bar
  const roof = new THREE.Mesh(new THREE.BoxGeometry(d, 0.06, w), steelMat);
  roof.position.set(0, h - 0.03, 0);
  roof.castShadow = true;
  caseGroup.add(roof);

  const ioBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, w * 0.72), trimMat);
  ioBar.position.set(d / 2 - 0.25, h - 0.01, 0);
  caseGroup.add(ioBar);

  // Illuminated subtle green power switch ring on top I/O
  const pwrLed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14),
    new THREE.MeshStandardMaterial({ color: 0x3ecf5e, emissive: 0x22c55e, emissiveIntensity: 0.8 })
  );
  pwrLed.position.set(d / 2 - 0.25, h + 0.02, 0.25);
  caseGroup.add(pwrLed);

  // 4. Right/Back Steel Tray Side Wall (-Z)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(d, h - 0.12, 0.06), steelMat);
  backWall.position.set(0, h / 2, -w / 2 + 0.03);
  backWall.receiveShadow = true;
  caseGroup.add(backWall);

  // Inner Motherboard Tray Plate (at z = -0.78)
  const mbTray = new THREE.Mesh(new THREE.BoxGeometry(d * 0.64, h * 0.72, 0.04), steelMat);
  mbTray.position.set(-0.68, h * 0.60, -0.76);
  mbTray.receiveShadow = true;
  caseGroup.add(mbTray);

  // 9 Brass Standoffs protruding toward +Z
  const standoffGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.12, 6);
  standoffGeo.rotateX(Math.PI / 2);
  for (const sx of [-2.05, -1.0, 0.05]) {
    for (const sy of [1.55, 2.86, 4.15]) {
      const standoff = new THREE.Mesh(standoffGeo, brassMat);
      standoff.position.set(sx, sy, -0.70);
      caseGroup.add(standoff);
    }
  }

  // 5. Rear Wall (-X) with I/O cutout frame + PCIe slots + PSU cutout
  const rearUpper = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 1.15, w), steelMat);
  rearUpper.position.set(-d / 2 + 0.03, (h + 1.15) / 2, 0);
  caseGroup.add(rearUpper);

  // Rear PSU frame bezel around lower opening
  const psuFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, w), steelMat);
  psuFrameTop.position.set(-d / 2 + 0.035, 1.05, 0);
  caseGroup.add(psuFrameTop);

  // 6. Front Intake Bezel & Mesh (+X)
  const frontBezel = new THREE.Mesh(new THREE.BoxGeometry(0.14, h - 0.10, w), trimMat);
  frontBezel.position.set(d / 2 - 0.07, h / 2, 0);
  caseGroup.add(frontBezel);

  const frontMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, h - 0.45, w - 0.22), meshFrontMat);
  frontMesh.position.set(d / 2 + 0.01, h / 2, 0);
  caseGroup.add(frontMesh);

  // 7. PSU Shroud Divider (covers PSU bay, open right side for Drive Bay)
  const shroudTop = new THREE.Mesh(new THREE.BoxGeometry(d * 0.62, 0.05, w - 0.14), steelMat);
  shroudTop.position.set(-d / 2 + (d * 0.62) / 2 + 0.06, 1.12, 0.02);
  shroudTop.receiveShadow = true;
  caseGroup.add(shroudTop);

  const shroudFront = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.04, w - 0.14), steelMat);
  shroudFront.position.set(-d / 2 + d * 0.62 + 0.06, 0.60, 0.02);
  caseGroup.add(shroudFront);

  // Drive cage shelf on right side of shroud
  const driveShelf = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.04, 1.28), steelMat);
  driveShelf.position.set(1.42, 0.36, 0.05);
  caseGroup.add(driveShelf);

  // 8. Removable Tempered Glass Side Panel (+Z face)
  const panelGroup = new THREE.Group();
  panelGroup.name = 'CaseSidePanel';

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.24,
    roughness: 0.08,
    metalness: 0.05,
    ior: 1.5,
    depthWrite: false,
  });
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(d - 0.18, h - 0.18, 0.04), glassMat);
  panelGroup.add(glassPane);

  // Painted black perimeter bezel on glass
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.5, metalness: 0.3 });
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(d - 0.16, 0.12, 0.046), frameMat);
  topBar.position.y = (h - 0.18) / 2 - 0.06;
  const botBar = topBar.clone();
  botBar.position.y = -(h - 0.18) / 2 + 0.06;
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, h - 0.18, 0.046), frameMat);
  leftBar.position.x = -(d - 0.18) / 2 + 0.06;
  const rightBar = leftBar.clone();
  rightBar.position.x = (d - 0.18) / 2 - 0.06;
  panelGroup.add(topBar, botBar, leftBar, rightBar);

  // 4 Thumbscrews
  const screwGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12);
  screwGeo.rotateX(Math.PI / 2);
  for (const [sx, sy] of [
    [-(d / 2 - 0.22), h / 2 - 0.22],
    [d / 2 - 0.22, h / 2 - 0.22],
    [-(d / 2 - 0.22), -(h / 2 - 0.22)],
    [d / 2 - 0.22, -(h / 2 - 0.22)],
  ]) {
    const screw = new THREE.Mesh(screwGeo, brassMat);
    screw.position.set(sx, sy, 0.02);
    panelGroup.add(screw);
  }

  panelGroup.position.set(0, h / 2, w / 2 - 0.03);
  caseGroup.add(panelGroup);
  caseGroup.userData.sidePanel = panelGroup;
  caseGroup.userData.closedPanelPos = panelGroup.position.clone();
}

export function createCaseModel(comp) {
  const group = new THREE.Group();
  group.name = `Hardware_case_${comp?.id || 'default'}`;
  makeCaseStandOffsAndFrame(group, comp?.dimensionsMm);
  return group;
}

export function createMotherboardModel(comp) {
  const dims = comp?.dimensionsMm || { w: 244, h: 305, d: 24 };
  const w = dims.w * S;
  const h = dims.h * S;

  const group = new THREE.Group();
  group.name = `Hardware_mb_${comp?.id || 'mb'}`;

  // 1. Multi-layer PCB with silkscreen texture
  const pcbTex = makeMotherboardPcbTexture(comp);
  const pcbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: pcbTex,
    roughness: 0.65,
    metalness: 0.12,
  });
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), pcbMat);
  pcb.castShadow = true;
  pcb.receiveShadow = true;
  group.add(pcb);

  const aluMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.34, metalness: 0.78 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.25, metalness: 0.9 });
  const slotPlastic = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.08 });

  // 2. Rear I/O Port Stack (-X left edge) + metallic shield jacks
  const ioStack = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.42, 0.28), darkMetal);
  ioStack.position.set(-w / 2 + 0.13, h * 0.14, 0.15);
  group.add(ioStack);

  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.9 });
  const usbBlue = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 });
  for (let p = 0; p < 4; p++) {
    const portBox = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.16), p % 2 === 0 ? silverMat : usbBlue);
    portBox.position.set(-w / 2 + 0.01, h * 0.30 - p * 0.24, 0.16);
    group.add(portBox);
  }

  // 3. VRM Heatsinks (top + rear-left of CPU)
  const vrmLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.24), aluMat);
  vrmLeft.position.set(-0.62, 0.56, 0.13);
  const vrmTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.22), aluMat);
  vrmTop.position.set(-0.15, 1.12, 0.12);
  group.add(vrmLeft, vrmTop);

  // 4. PCH Chipset Heatsink (bottom-right)
  const pchSink = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.10), aluMat);
  pchSink.position.set(0.55, -0.78, 0.07);
  group.add(pchSink);

  // 5. CPU Socket Assembly + Articulated ILM Retention Lever
  const socketBase = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.54, 0.045), slotPlastic);
  socketBase.position.set(-0.15, 0.56, 0.04);
  group.add(socketBase);

  const socketFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.055), darkMetal);
  socketFrame.position.set(-0.15, 0.56, 0.045);
  group.add(socketFrame);

  // Socket Pin-1 Corner Gold Triangle Indicator (top-left of socket)
  const pin1Marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.05, 3),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  pin1Marker.rotation.x = Math.PI / 2;
  pin1Marker.position.set(-0.36, 0.77, 0.075);
  group.add(pin1Marker);

  // Articulated ILM / ZIF Retention Lever Pivot (hinged at bottom-right of socket)
  const cpuLeverPivot = new THREE.Group();
  cpuLeverPivot.position.set(0.15, 0.30, 0.068);
  const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 8), silverMat);
  leverArm.position.set(0, 0.29, 0);
  const leverHook = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.03), silverMat);
  leverHook.position.set(-0.04, 0.58, 0);
  leverArm.userData.fastenerTargetSlot = 'cpu';
  leverHook.userData.fastenerTargetSlot = 'cpu';
  cpuLeverPivot.add(leverArm, leverHook);
  group.add(cpuLeverPivot);
  group.userData.cpuLeverPivot = cpuLeverPivot;

  // 6. RAM DIMM Slots (2 or 4 vertical slots right of CPU socket) + Articulated Retention Clips
  const dimmCount = Math.min(4, Math.max(2, Number(comp?.dimm_slots || 4)));
  const dimmLatches = [];
  const latchMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.3 });
  for (let i = 0; i < dimmCount; i++) {
    const dx = 0.44 + i * 0.12;
    const slotMesh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.34, 0.08), i % 2 === 1 ? aluMat : slotPlastic);
    slotMesh.position.set(dx, 0.56, 0.055);
    group.add(slotMesh);

    const topClip = new THREE.Group();
    topClip.position.set(dx, 1.24, 0.06);
    const clipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.065), latchMat);
    clipMesh.position.set(0, 0.03, 0.02);
    clipMesh.userData.fastenerTargetSlot = 'ram';
    topClip.add(clipMesh);
    group.add(topClip);
    dimmLatches.push(topClip);
  }
  group.userData.dimmLatches = dimmLatches;

  // 7. M.2 NVMe Slot (horizontal below CPU)
  const m2Socket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.26, 0.05), slotPlastic);
  m2Socket.position.set(-0.52, -0.14, 0.042);
  const m2Standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), goldMat);
  m2Standoff.rotation.x = Math.PI / 2;
  m2Standoff.position.set(0.24, -0.14, 0.042);
  group.add(m2Socket, m2Standoff);

  // 8. Steel-Reinforced PCIe x16 Slot
  const pcieSlot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.075, 0.095), aluMat);
  pcieSlot.position.set(-0.22, -0.44, 0.06);
  group.add(pcieSlot);

  // 9. Power & Data Headers (24-Pin ATX, 8-Pin EPS, JFP1, SATA)
  const atx24 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.11), slotPlastic);
  atx24.position.set(w / 2 - 0.14, 0.32, 0.07);
  const eps8 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.11), slotPlastic);
  eps8.position.set(-w / 2 + 0.36, h / 2 - 0.14, 0.07);
  const sataHdr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.09), slotPlastic);
  sataHdr.position.set(w / 2 - 0.14, -0.92, 0.06);
  group.add(atx24, eps8, sataHdr);

  // 10. Motherboard Standoff Screws (shown when secured on chassis standoffs)
  const mbScrews = [];
  const screwGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.03, 8);
  screwGeo.rotateX(Math.PI / 2);
  for (const [sx, sy] of [
    [-w / 2 + 0.14, h / 2 - 0.14],
    [w / 2 - 0.14, h / 2 - 0.14],
    [-w / 2 + 0.14, 0.0],
    [w / 2 - 0.14, 0.0],
    [-w / 2 + 0.14, -h / 2 + 0.14],
    [w / 2 - 0.14, -h / 2 + 0.14],
  ]) {
    const screw = new THREE.Mesh(screwGeo, silverMat);
    screw.position.set(sx, sy, 0.035);
    screw.visible = false;
    group.add(screw);
    mbScrews.push(screw);
  }
  group.userData.fastenerScrews = mbScrews;

  return group;
}

export function createCpuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 40, h: 42, d: 6 };
  const w = Math.max(0.38, dims.w * S);
  const h = Math.max(0.40, dims.h * S);

  const group = new THREE.Group();
  group.name = `Hardware_cpu_${comp?.id || 'cpu'}`;

  // 1. Fiberglass Substrate
  const subMat = new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 0.55, metalness: 0.15 });
  const substrate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), subMat);
  substrate.castShadow = true;
  group.add(substrate);

  // 2. Underside gold contact pad / pin array texture (visible in 3D Inspector flip view)
  const padMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.25, metalness: 0.92 });
  const bottomTex = makeCpuBottomTexture(comp);
  const bottomPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.92, h * 0.92),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: bottomTex, roughness: 0.32, metalness: 0.85 })
  );
  bottomPlate.rotation.y = Math.PI;
  bottomPlate.position.z = -0.016;
  group.add(bottomPlate);

  // 3. Nickel-plated IHS Heatspreader with Pin-1 Gold Triangle Top Texture
  const ihsTex = makeLabelTexture(
    comp?.brand || 'CPU',
    comp?.model || comp?.socket || '',
    '#facc15',
    '#94a3b8',
    true
  );
  const ihsMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ihsTex,
    roughness: 0.26,
    metalness: 0.78,
  });
  const ihs = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, h * 0.84, 0.032), ihsMat);
  ihs.position.z = 0.026;
  ihs.castShadow = true;
  group.add(ihs);

  // 4. Physical 3D gold corner indicator on top-left (-X, +Y) so edge angle shows cleanly
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.025, 3), padMat);
  tri.rotation.x = Math.PI / 2;
  tri.position.set(-w * 0.38, h * 0.38, 0.038);
  group.add(tri);

  return group;
}

export function createCoolerModel(comp) {
  const dims = comp?.dimensionsMm || { w: 124, h: 155, d: 96 };
  const isLowProfile = comp?.coolerType === 'low_profile' || dims.h < 95;
  const depthOut = Math.min(1.65, dims.h * S); // Protrudes out +Z from motherboard socket

  const group = new THREE.Group();
  group.name = `Hardware_cooler_${comp?.id || 'cooler'}`;
  const fanRotors = [];

  const copperMat = new THREE.MeshStandardMaterial({ color: 0xc86b3c, roughness: 0.28, metalness: 0.88 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.36, metalness: 0.82 });
  const shroudMat = new THREE.MeshStandardMaterial({ color: 0x161c26, roughness: 0.65, metalness: 0.2 });

  // 1. Copper cold plate & retention bracket
  const coldPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.08), copperMat);
  coldPlate.position.set(0, 0, 0.04);
  group.add(coldPlate);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.03), shroudMat);
  bracket.position.set(0, 0, 0.04);
  group.add(bracket);

  if (isLowProfile) {
    // Low-profile radial heatsink fins + top fan facing +Z
    const finBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.34, 24), finMat);
    finBlock.rotation.x = Math.PI / 2;
    finBlock.position.set(0, 0, 0.24);
    finBlock.castShadow = true;
    group.add(finBlock);

    const fanHousing = _makeFanAssembly(0.86, shroudMat, fanRotors);
    fanHousing.position.set(0, 0, 0.50);
    group.add(fanHousing);
  } else {
    // Tower heatsink with 4 curved copper heatpipes + layered aluminum fin stack + front PWM fan
    for (const py of [-0.14, -0.05, 0.05, 0.14]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.22, py, 0.06),
        new THREE.Vector3(-0.34, py, 0.55),
        new THREE.Vector3(0, py, depthOut * 0.88),
        new THREE.Vector3(0.34, py, 0.55),
        new THREE.Vector3(0.22, py, 0.06),
      ]);
      const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.025, 8, false), copperMat);
      group.add(pipe);
    }

    // Layered fin stack
    const finCount = 12;
    const finSpanZ = depthOut - 0.32;
    const finGeo = new THREE.BoxGeometry(0.84, 1.08, 0.022);
    for (let i = 0; i < finCount; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(0, 0, 0.26 + (i / (finCount - 1)) * finSpanZ);
      fin.castShadow = true;
      group.add(fin);
    }

    // Top anodized beauty cap
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.10, 0.04), shroudMat);
    topCap.position.set(0, 0, depthOut);
    group.add(topCap);

    // Side-mounted 120mm PWM Fan pushing air toward rear exhaust (-X)
    const fanAssembly = _makeFanAssembly(1.06, shroudMat, fanRotors);
    fanAssembly.rotation.y = Math.PI / 2;
    fanAssembly.position.set(0.56, 0, depthOut * 0.56);
    group.add(fanAssembly);
  }

  group.userData.fanRotors = fanRotors;
  return group;
}

export function createRamModel(comp) {
  const sticks = Math.min(2, Math.max(1, Number(comp?.sticks || 1)));
  const dims = comp?.dimensionsMm || { w: 133.3, h: 42, d: 7 };
  const length = dims.w * S; // 1.333 units along Y when slotted vertically
  const heightOut = dims.h * S; // ~0.42 units along +Z
  const isDdr5 = String(comp?.ram_type || comp?.memType || '').toUpperCase().includes('5');

  const group = new THREE.Group();
  group.name = `Hardware_ram_${comp?.id || 'ram'}`;

  const spreaderMat = new THREE.MeshStandardMaterial({
    color: isDdr5 ? 0x1e293b : 0x262626,
    roughness: 0.32,
    metalness: 0.72,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isDdr5 ? 0x38bdf8 : 0xef4444,
    roughness: 0.25,
    metalness: 0.15,
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.1 });

  for (let i = 0; i < sticks; i++) {
    const stick = new THREE.Group();
    const xOffset = sticks === 2 ? (i === 0 ? -0.14 : 0.10) : -0.02;

    // Heatspreader body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, length, heightOut * 0.85), spreaderMat);
    body.position.z = heightOut * 0.48;
    body.castShadow = true;
    stick.add(body);

    // Top accent light/trim bar
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, length * 0.96, 0.05), accentMat);
    topBar.position.z = heightOut * 0.90;
    stick.add(topBar);

    // Asymmetric gold contact edge with offset notch gap!
    const upperPins = new THREE.Mesh(new THREE.BoxGeometry(0.02, length * 0.54, 0.06), goldMat);
    upperPins.position.set(0, length * 0.21, 0.03);
    const lowerPins = new THREE.Mesh(new THREE.BoxGeometry(0.02, length * 0.36, 0.06), goldMat);
    lowerPins.position.set(0, -length * 0.30, 0.03);
    const notchGap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.06), pcbMat);
    notchGap.position.set(0, -length * 0.08, 0.03);
    stick.add(upperPins, lowerPins, notchGap);

    stick.position.x = xOffset;
    group.add(stick);
  }

  return group;
}

export function createGpuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 268, h: 118, d: 42 };
  const len = dims.w * S;     // X length (rear bracket at -X to front at +X)
  const depthZ = dims.h * S;  // Z overhang out from motherboard
  const thickY = dims.d * S;  // Y thickness (dual/triple slot)
  const fanCount = len >= 2.9 ? 3 : 2;

  const group = new THREE.Group();
  group.name = `Hardware_gpu_${comp?.id || 'gpu'}`;
  const fanRotors = [];

  const shroudMat = new THREE.MeshStandardMaterial({ color: 0x1e2532, roughness: 0.46, metalness: 0.45 });
  const backplateMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.72 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.38, metalness: 0.85 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.88 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.9 });

  const centerShiftX = (len - 2.0) * 0.5; // Keeps rear I/O aligned at -1.0 relative to MB PCIe slot!

  // 1. Aluminum Heatsink Core
  const heatsink = new THREE.Mesh(new THREE.BoxGeometry(len * 0.94, thickY * 0.78, depthZ * 0.88), finMat);
  heatsink.position.set(centerShiftX, 0, depthZ * 0.46);
  heatsink.castShadow = true;
  group.add(heatsink);

  // 2. Top Anodized Metal Backplate
  const backplate = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, depthZ), backplateMat);
  backplate.position.set(centerShiftX, thickY * 0.48, depthZ * 0.5);
  group.add(backplate);

  // 3. Molded Front Shroud Shell + Accent Strip
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(len, thickY * 0.24, depthZ), shroudMat);
  shroud.position.set(centerShiftX, -thickY * 0.38, depthZ * 0.5);
  shroud.castShadow = true;
  group.add(shroud);

  const gpuTex = makeLabelTexture(comp?.model || comp?.name || 'GeForce RTX', `${comp?.vram_gb || 8}GB · ${comp?.tdp_watts || 150}W`, '#3ecf5e', '#0f172a', false, 768, 256);
  const sideBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(1.15, len * 0.48), Math.max(0.36, thickY * 0.78)),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: gpuTex, roughness: 0.4 })
  );
  sideBadge.position.set(centerShiftX + 0.1, 0.0, depthZ + 0.008);
  group.add(sideBadge);

  // 4. Bottom Axial Cooling Fans
  const fanSize = Math.min(0.84, (len * 0.78) / fanCount);
  for (let i = 0; i < fanCount; i++) {
    const fx = centerShiftX - ((fanCount - 1) * 0.5 * (fanSize * 1.06)) + i * (fanSize * 1.06);
    const fan = _makeFanAssembly(fanSize, shroudMat, fanRotors);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(fx, -thickY * 0.49, depthZ * 0.5);
    group.add(fan);
  }

  // 5. Gold PCIe x16 Finger Connector (top-back edge contacting MB PCIe slot)
  const pcieFingers = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.04, 0.09), goldMat);
  pcieFingers.position.set(-0.08, 0.0, 0.0);
  group.add(pcieFingers);

  // 6. Stainless Rear I/O Bracket (-X edge)
  const rearBracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, thickY * 1.15, depthZ + 0.08), steelMat);
  rearBracket.position.set(centerShiftX - len / 2 - 0.01, -0.02, depthZ * 0.5);
  group.add(rearBracket);

  // 7. 8-Pin PCIe Power Header on Front Edge
  const pwrPlug = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.12), backplateMat);
  pwrPlug.position.set(centerShiftX + len * 0.36, thickY * 0.35, depthZ - 0.04);
  group.add(pwrPlug);

  // 8. Rear Expansion Bracket Fastener Thumbscrew
  const gpuScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 10), steelMat);
  gpuScrew.rotation.z = Math.PI / 2;
  gpuScrew.position.set(centerShiftX - len / 2 - 0.035, thickY * 0.2, 0.18);
  gpuScrew.visible = false;
  group.add(gpuScrew);

  group.userData.fastenerScrews = [gpuScrew];
  group.userData.fanRotors = fanRotors;
  return group;
}

export function createPsuModel(comp) {
  const dims = comp?.dimensionsMm || { w: 150, h: 86, d: 140 };
  const lenX = dims.d * S;  // 1.40 - 1.60 along X
  const hY = dims.h * S;    // 0.86 tall
  const wZ = dims.w * S;    // 1.50 wide

  const group = new THREE.Group();
  group.name = `Hardware_psu_${comp?.id || 'psu'}`;
  const fanRotors = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.55, metalness: 0.5 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.8 });

  // 1. Main Powder-Coated PSU Box
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(lenX, hY, wZ), bodyMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // 2. Spec Label Decal on +Z Visible Side Face
  const effLabel = comp?.efficiency_rating || comp?.efficiency || '80+ Bronze';
  const labelTex = makeLabelTexture(
    `${comp?.wattage || 650}W`,
    `${comp?.brand || 'Corsair'} · ${effLabel}`,
    '#f59e0b',
    '#0f172a'
  );
  const sideLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(lenX * 0.82, hY * 0.72),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.45 })
  );
  sideLabel.position.set(0, 0, wZ / 2 + 0.008);
  group.add(sideLabel);

  // 3. Recessed Intake Fan on -Y Bottom Face (clearly shows Fan Down vs Fan Up!)
  const fan = _makeFanAssembly(1.08, bodyMat, fanRotors);
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, -hY / 2 - 0.015, 0);
  group.add(fan);

  // Protective grille ring around fan
  const grilleRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 8, 28), metalMat);
  grilleRing.rotation.x = Math.PI / 2;
  grilleRing.position.set(0, -hY / 2 - 0.025, 0);
  group.add(grilleRing);

  // 4. Rear AC C14 Socket & Red Power Rocker Switch (-X exhaust side)
  const acSocket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.30), metalMat);
  acSocket.position.set(-lenX / 2 - 0.01, -0.12, -0.25);
  const rocker = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.16, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 })
  );
  rocker.position.set(-lenX / 2 - 0.01, -0.12, 0.22);
  group.add(acSocket, rocker);

  // 5. Front Modular / Harness Output Panel (+X)
  const modPanel = new THREE.Mesh(new THREE.BoxGeometry(0.05, hY * 0.75, wZ * 0.78), metalMat);
  modPanel.position.set(lenX / 2 + 0.01, 0, 0);
  group.add(modPanel);

  // 6. Rear PSU Chassis Mounting Thumbscrews
  const psuScrews = [];
  const psuScrewMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.9 });
  const psuScrewGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.045, 10);
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

export function createStorageModel(comp) {
  const kind = detectStorageKind(comp);
  const group = new THREE.Group();
  group.name = `Hardware_storage_${comp?.id || kind}`;

  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.12 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.22, metalness: 0.92 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.34, metalness: 0.78 });

  if (kind === 'm2_nvme') {
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.22, 0.025), pcbMat);
    const labelTex = makeLabelTexture(comp?.brand || 'NVMe', `${comp?.capacity_gb || 1000}GB M.2`, '#38bdf8', '#1e293b', false, 768, 256);
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: labelTex, roughness: 0.45 })
    );
    sticker.position.set(0.04, 0, 0.015);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.19, 0.026), goldMat);
    fingers.position.set(-0.39, 0, 0);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.03), metalMat);
    notch.position.set(0.39, 0, 0);
    group.add(pcb, sticker, fingers, notch);
  } else if (kind === 'sata_35') {
    // 3.5" SATA HDD
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.26, 1.47), pcbMat);
    const topLid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 1.38), metalMat);
    topLid.position.y = 0.13;
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20), metalMat);
    spindle.position.set(0, 0.145, -0.15);
    const sataPort = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.08), goldMat);
    sataPort.position.set(-0.18, -0.05, -0.74);
    group.add(housing, topLid, spindle, sataPort);
  } else {
    // 2.5" SATA SSD
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.70, 0.08, 1.00),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.6 })
    );
    const tex = makeLabelTexture(comp?.brand || 'SSD', `${comp?.capacity_gb || 500}GB SATA`, '#10b981', '#0f172a');
    const sticker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.80),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.4 })
    );
    sticker.rotation.x = -Math.PI / 2;
    sticker.position.y = 0.044;
    const sataPort = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.07), goldMat);
    sataPort.position.set(-0.12, -0.01, -0.50);
    group.add(shell, sticker, sataPort);
  }

  return group;
}

export function createCaseFanModel(comp) {
  const sz = Math.min(1.4, (comp?.dimensionsMm?.w || 120) * S);
  const group = new THREE.Group();
  group.name = `Hardware_case_fan_${comp?.id || 'fan'}`;
  const fanRotors = [];

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.62, metalness: 0.25 });
  const fan = _makeFanAssembly(sz, frameMat, fanRotors);
  group.add(fan);

  // Airflow direction arrow bar on top edge (+Z points exhaust out)
  const arrowShaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.4 })
  );
  arrowShaft.position.set(0, sz / 2 + 0.03, 0);
  const arrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.4 })
  );
  arrowHead.rotation.x = -Math.PI / 2;
  arrowHead.position.set(0, sz / 2 + 0.03, -0.11);
  group.add(arrowShaft, arrowHead);

  group.userData.fanRotors = fanRotors;
  return group;
}

function _makeFanAssembly(size, frameMat, fanRotorsList) {
  const fanGroup = new THREE.Group();

  // Outer square housing via 4 edge rails + corner anti-vibration pads
  const railThick = size * 0.10;
  const depth = 0.24;
  const top = new THREE.Mesh(new THREE.BoxGeometry(size, railThick, depth), frameMat);
  top.position.y = size / 2 - railThick / 2;
  const bot = top.clone();
  bot.position.y = -size / 2 + railThick / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(railThick, size - railThick * 2, depth), frameMat);
  left.position.x = -size / 2 + railThick / 2;
  const right = left.clone();
  right.position.x = size / 2 - railThick / 2;
  fanGroup.add(top, bot, left, right);

  // Inner circular shroud ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.43, railThick * 0.35, 8, 24),
    frameMat
  );
  fanGroup.add(ring);

  // Spinning Rotor Hub + 7 Angled Blades
  const rotor = new THREE.Group();
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.55 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.35 });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.16, size * 0.16, 0.14, 16), hubMat);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);

  const bladeLen = size * 0.27;
  const bladeGeo = new THREE.BoxGeometry(bladeLen, size * 0.09, 0.02);
  for (let b = 0; b < 7; b++) {
    const angle = (b / 7) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.rotation.z = angle;
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.x = size * 0.16 + bladeLen * 0.48;
    blade.rotation.x = 0.48; // Aerodynamic pitch
    pivot.add(blade);
    rotor.add(pivot);
  }

  fanGroup.add(rotor);
  fanRotorsList.push(rotor);
  return fanGroup;
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

export function createCableMesh(cableDef, startPt, endPt) {
  const group = new THREE.Group();
  group.name = `Cable_${cableDef.id}`;

  const s = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
  const e = new THREE.Vector3(endPt.x, endPt.y, endPt.z);

  // Route neatly behind tray/over shroud for realistic cable management arc
  const mid1 = s.clone().lerp(e, 0.32);
  mid1.z -= 0.22;
  mid1.y += 0.12;
  const mid2 = s.clone().lerp(e, 0.68);
  mid2.z += 0.18;
  mid2.y -= 0.08;

  const curve = new THREE.CatmullRomCurve3([s, mid1, mid2, e]);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cableDef.color || '#3ecf5e'),
    roughness: 0.62,
    metalness: 0.12,
  });
  const radius = cableDef.id === 'c_24pin' ? 0.042 : cableDef.id.includes('fan') ? 0.02 : 0.03;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), tubeMat);
  tube.castShadow = true;
  group.add(tube);

  // Molded connector housings at endpoints
  const plugMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.1 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), plugMat);
  p1.position.copy(s);
  const p2 = p1.clone();
  p2.position.copy(e);
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

    // Replace procedural children once external GLTF is ready
    while (targetGroup.children.length > 0) {
      targetGroup.remove(targetGroup.children[0]);
    }
    targetGroup.add(model);
    return true;
  } catch {
    return false;
  }
}
