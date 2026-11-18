/**
 * ValidationEngine.mjs
 * Modular POST-ASSEMBLY evaluation engine.
 * Evaluates a completed (or submitted) PC assembly without interrupting the student
 * mid-build. Checks:
 *   A. Installation correctness (installed?, location, orientation, latching/screws, paste)
 *   B. Component compatibility (socket, DDR, capacity/DIMMs/speed/form-factor, PCIe, PSU, case clearance, cooler TDP)
 *   C. Connection correctness (24-pin ATX, 8-pin EPS, CPU_FAN, GPU PCIe power, SATA power/data, front panel, case fan)
 *   D. Final Assessment Report
 */

import {
  SLOT_DISPLAY_NAMES,
  CABLE_DEFINITIONS,
  detectStorageKind,
  firstNum,
  normalizeFormFactorToken,
} from './SimulationDataManager.mjs';
import { COMPONENT_STATE } from './AssemblyManager.mjs';

function memoryTypesFrom(...values) {
  const types = new Set();
  const fallback = new Set();
  for (const val of values) {
    const text = String(val || '').toUpperCase();
    for (const m of text.matchAll(/\bDDR\s*([2-6])\w*/g)) {
      types.add(`DDR${m[1]}`);
    }
    const cleaned = text.replace(/[^A-Z0-9]+/g, '');
    if (cleaned) fallback.add(cleaned);
  }
  return types.size ? types : fallback;
}

function setsOverlap(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function pcieWattsFromString(val) {
  const txt = String(val || '').toLowerCase();
  if (!txt || txt.includes('none')) return 0;
  let total = 0;
  for (const m of txt.matchAll(/(\d+)\s*x?\s*([0-9+]+)\s*-?\s*pin/g)) {
    const cnt = parseInt(m[1], 10);
    const pins = m[2].replace(/\+/g, '');
    if (pins.includes('62') || pins.includes('8')) total += cnt * 150;
    else if (pins.includes('6')) total += cnt * 75;
  }
  if (total) return total;
  if (txt.includes('6+2') || txt.includes('8-pin') || txt.includes('8 pin')) return 150;
  if (txt.includes('6-pin') || txt.includes('6 pin')) return 75;
  return 0;
}

export class ValidationEngine {
  constructor() {
    this.customCompatibilityRules = [];
  }

  registerCompatibilityRule(ruleFn) {
    if (typeof ruleFn === 'function') {
      this.customCompatibilityRules.push(ruleFn);
    }
  }

  evaluateAssembly(assemblyState, activityConfig = null) {
    const slots = assemblyState?.slots || {};
    const cables = assemblyState?.cables || {};
    const requiredSlots = activityConfig?.requiredSlots || [
      'case',
      'mb',
      'cpu',
      'cooler',
      'ram',
      'gpu',
      'psu',
      'storage',
    ];

    const correctlyInstalled = [];
    const incorrectlyInstalled = [];
    const missingComponents = [];
    const connectionIssues = [];
    const compatibilityIssues = [];

    // ========================================================
    // A. INSTALLATION CORRECTNESS
    // ========================================================
    for (const slotKey of ['case', 'mb', 'cpu', 'cooler', 'ram', 'gpu', 'psu', 'storage', 'case_fan']) {
      const entry = slots[slotKey];
      const label = SLOT_DISPLAY_NAMES[slotKey] || slotKey;
      const isRequired = requiredSlots.includes(slotKey);

      if (!entry || entry.status === COMPONENT_STATE.STAGED || entry.status === COMPONENT_STATE.UNINSTALLED) {
        if (isRequired) {
          missingComponents.push({
            slot: slotKey,
            label,
            required: true,
            reason: entry?.status === COMPONENT_STATE.STAGED
              ? `${label} was left on the workbench staging mat and not installed.`
              : `${label} was not installed.`,
          });
        }
        continue;
      }

      const issuesForPart = [];

      // Check motherboard final mount location (bench vs inside case)
      if (slotKey === 'mb' && assemblyState.mbMountLocation !== 'case') {
        issuesForPart.push('Motherboard is still sitting on the ESD bench prep pad instead of mounted on case standoffs.');
      }

      // Check motherboard child parts left unmounted inside case because MB is still on bench
      if (['cpu', 'cooler', 'ram'].includes(slotKey) && assemblyState.mbMountLocation === 'bench') {
        issuesForPart.push(`${label} is installed on the motherboard, but the motherboard has not been mounted inside the PC case yet.`);
      }

      // Orientation alignment
      if (!entry.aligned || entry.status === COMPONENT_STATE.INSTALLED_INCORRECT) {
        issuesForPart.push(entry.misalignedReason || `${label} is installed in an incorrect orientation.`);
      }

      // Fasteners / latches secured
      if (!entry.secured) {
        issuesForPart.push(`${label} is placed in position, but retention latch or mounting screws were not secured.`);
      }

      // Thermal paste check before CPU cooler
      if (slotKey === 'cooler' && !assemblyState.thermalPasteApplied) {
        issuesForPart.push('Thermal paste was not applied to the CPU heatspreader before mounting the cooler.');
      }

      if (issuesForPart.length > 0) {
        incorrectlyInstalled.push({
          slot: slotKey,
          label,
          name: entry.component?.name || label,
          issues: issuesForPart,
          severity: 'error',
        });
      } else {
        correctlyInstalled.push({
          slot: slotKey,
          label,
          name: entry.component?.name || label,
          notes: 'Aligned, mounted, and secured properly.',
        });
      }
    }

    // Side panel closure check (advisory/finalization check)
    if (assemblyState.sidePanelOpen) {
      incorrectlyInstalled.push({
        slot: 'case_panel',
        label: 'Case Side Panel',
        name: 'Tempered Glass Side Panel',
        issues: ['Side panel is still open — close/reinstall the panel after completing internal cabling for proper airflow.'],
        severity: 'warning',
      });
    }

    // ========================================================
    // B. COMPONENT COMPATIBILITY
    // ========================================================
    const getPlacedComp = (slotKey) => {
      const e = slots[slotKey];
      return e && e.status !== COMPONENT_STATE.STAGED ? e.component : null;
    };

    const pcCase = getPlacedComp('case');
    const mb = getPlacedComp('mb');
    const cpu = getPlacedComp('cpu');
    const cooler = getPlacedComp('cooler');
    const ram = getPlacedComp('ram');
    const gpu = getPlacedComp('gpu');
    const psu = getPlacedComp('psu');
    const storage = getPlacedComp('storage');

    // 1. CPU <-> Motherboard socket
    if (cpu && mb) {
      const cpuSock = String(cpu.socket || '').trim();
      const mbSock = String(mb.socket || '').trim();
      if (cpuSock && mbSock && cpuSock.toLowerCase() !== mbSock.toLowerCase()) {
        compatibilityIssues.push({
          pair: 'CPU + Motherboard',
          issue: `CPU socket (${cpuSock}) does not match motherboard socket (${mbSock}).`,
          severity: 'critical',
        });
      }
    }

    // 2. CPU <-> RAM memory generation
    if (cpu && ram) {
      const cpuMem = memoryTypesFrom(cpu.memSupport, cpu.memorySupport);
      const ramMem = memoryTypesFrom(ram.ram_type, ram.memType);
      if (cpuMem.size && ramMem.size && !setsOverlap(cpuMem, ramMem)) {
        compatibilityIssues.push({
          pair: 'CPU + RAM',
          issue: `RAM (${ram.ram_type || ram.memType}) is not supported by CPU memory controller (${cpu.memSupport}).`,
          severity: 'critical',
        });
      }
    }

    // 3. RAM <-> Motherboard (DDR type, capacity, DIMM slot count, speed, DIMM vs SO-DIMM)
    if (mb && ram) {
      const mbMem = memoryTypesFrom(mb.ram_type, mb.memType);
      const ramMem = memoryTypesFrom(ram.ram_type, ram.memType);
      if (mbMem.size && ramMem.size && !setsOverlap(mbMem, ramMem)) {
        compatibilityIssues.push({
          pair: 'Motherboard + RAM',
          issue: `RAM generation (${ram.ram_type || ram.memType}) is physically incompatible with motherboard (${mb.ram_type || mb.memType}).`,
          severity: 'critical',
        });
      }

      const ramCap = Number(ram.capacity_gb || 0);
      const mbMaxCap = Number(mb.max_ram_gb || 0);
      if (ramCap && mbMaxCap && ramCap > mbMaxCap) {
        compatibilityIssues.push({
          pair: 'Motherboard + RAM',
          issue: `RAM kit capacity (${ramCap}GB) exceeds motherboard maximum (${mbMaxCap}GB).`,
          severity: 'warning',
        });
      }

      const sticks = Number(ram.sticks || 1);
      const dimms = Number(mb.dimm_slots || 0);
      if (sticks && dimms && sticks > dimms) {
        compatibilityIssues.push({
          pair: 'Motherboard + RAM',
          issue: `RAM kit has ${sticks} modules, but motherboard only provides ${dimms} DIMM slots.`,
          severity: 'critical',
        });
      }

      const ramSpeed = Number(ram.speed_mhz || 0);
      const mbSpeed = Number(mb.max_ram_speed_mhz || 0);
      if (ramSpeed && mbSpeed && ramSpeed > mbSpeed) {
        compatibilityIssues.push({
          pair: 'Motherboard + RAM',
          issue: `RAM rated speed (${ramSpeed} MHz) exceeds motherboard supported speed (${mbSpeed} MHz).`,
          severity: 'warning',
        });
      }

      const ramForm = normalizeFormFactorToken(ram.ram_form_factor || ram.formFactor);
      const mbDimmsRaw = String(mb.dimms || '').toLowerCase();
      const mbSlotForm = mbDimmsRaw.includes('so-dimm') ? 'so-dimm' : 'dimm';
      if (ramForm && ramForm !== mbSlotForm) {
        compatibilityIssues.push({
          pair: 'Motherboard + RAM',
          issue: `RAM form factor (${ramForm}) does not fit motherboard slots (${mbSlotForm}).`,
          severity: 'critical',
        });
      }
    }

    // 4. Motherboard <-> Case form factor support
    if (mb && pcCase) {
      const mbForm = normalizeFormFactorToken(mb.form_factor || mb.formFactor);
      const supported = String(pcCase.form_factor_support || pcCase.formFactorSupport || '')
        .split(',')
        .map((s) => normalizeFormFactorToken(s))
        .filter(Boolean);
      if (mbForm && supported.length && !supported.includes(mbForm)) {
        compatibilityIssues.push({
          pair: 'Motherboard + PC Case',
          issue: `${mb.form_factor} motherboard does not fit inside ${pcCase.name} (supports ${pcCase.form_factor_support}).`,
          severity: 'critical',
        });
      }
    }

    // 5. GPU <-> Motherboard PCIe x16 & Case Length Clearance
    if (mb && gpu && Number(mb.pcie_x16_slots || 0) < 1) {
      compatibilityIssues.push({
        pair: 'Motherboard + GPU',
        issue: 'Motherboard does not provide a PCIe x16 expansion slot for a discrete GPU.',
        severity: 'critical',
      });
    }

    if (gpu && pcCase) {
      const gpuLen = Number(gpu.length_mm || gpu.dimensionsMm?.w || 0);
      const maxCaseGpu = Number(pcCase.max_gpu_length_mm || 0);
      if (gpuLen && maxCaseGpu && gpuLen > maxCaseGpu) {
        compatibilityIssues.push({
          pair: 'GPU + PC Case',
          issue: `GPU length (${gpuLen}mm) exceeds ${pcCase.name} maximum clearance (${maxCaseGpu}mm).`,
          severity: 'critical',
        });
      }
    }

    // 6. Cooler <-> Case height clearance & CPU TDP capacity
    if (cooler && pcCase) {
      const coolerH = Number(cooler.height_mm || cooler.dimensionsMm?.h || 0);
      const maxCoolerH = Number(pcCase.max_cooler_height_mm || 0);
      if (coolerH && maxCoolerH && coolerH > maxCoolerH) {
        compatibilityIssues.push({
          pair: 'CPU Cooler + PC Case',
          issue: `CPU Cooler height (${coolerH}mm) exceeds case side-panel clearance (${maxCoolerH}mm).`,
          severity: 'critical',
        });
      }
    }

    if (cooler && cpu) {
      const cpuTdp = Number(cpu.tdp_watts || firstNum(cpu.tdp, 65));
      const coolerMax = Number(cooler.max_tdp_watts || 180);
      if (cpuTdp > coolerMax) {
        compatibilityIssues.push({
          pair: 'CPU + CPU Cooler',
          issue: `${cpu.name} (${cpuTdp}W TDP) exceeds thermal capacity of ${cooler.name} (${coolerMax}W max).`,
          severity: 'warning',
        });
      }
    }

    // 7. Storage <-> Motherboard M.2 / interface
    if (mb && storage) {
      const sKind = detectStorageKind(storage);
      if (sKind === 'm2_nvme' && Number(mb.m2_slots || 0) < 1) {
        compatibilityIssues.push({
          pair: 'Motherboard + Storage',
          issue: 'M.2 NVMe SSD requires an onboard M.2 slot, which this motherboard lacks.',
          severity: 'critical',
        });
      }
      if (sKind === 'ide') {
        compatibilityIssues.push({
          pair: 'Motherboard + Storage',
          issue: 'Legacy IDE/PATA drive interface is unsupported by modern motherboards.',
          severity: 'critical',
        });
      }
    }

    // 8. PSU wattage & PCIe connectors
    const estimatedLoadWatts =
      (cpu ? Number(cpu.tdp_watts || 65) : 0) +
      (mb ? 50 : 0) +
      (ram ? 8 : 0) +
      (storage ? 6 : 0) +
      (gpu ? Number(gpu.tdp_watts || 120) : 0) +
      25;

    if (psu) {
      const psuWatts = Number(psu.wattage || firstNum(psu.powerOutput, 0));
      const gpuRec = Number(gpu?.recommended_psu_watts || 0);
      if (gpu && gpuRec && psuWatts < gpuRec) {
        compatibilityIssues.push({
          pair: 'PSU + GPU',
          issue: `PSU output (${psuWatts}W) is below GPU recommended wattage (${gpuRec}W).`,
          severity: 'critical',
        });
      } else if (psuWatts && psuWatts < estimatedLoadWatts + 75) {
        compatibilityIssues.push({
          pair: 'PSU + System Load',
          issue: `PSU (${psuWatts}W) leaves insufficient headroom for estimated ${estimatedLoadWatts}W system load.`,
          severity: 'warning',
        });
      }

      if (gpu && Number(gpu.tdp_watts || 0) > 75) {
        const extNeed = Number(gpu.tdp_watts) - 75;
        const pcieCap = pcieWattsFromString(psu.pcieConn || '');
        if (!pcieCap) {
          compatibilityIssues.push({
            pair: 'PSU + GPU Power',
            issue: 'GPU requires external PCIe power connector(s), but selected PSU lists no PCIe connectors.',
            severity: 'critical',
          });
        } else if (pcieCap < extNeed) {
          compatibilityIssues.push({
            pair: 'PSU + GPU Power',
            issue: `PSU PCIe cables supply ~${pcieCap}W, below GPU external draw (~${extNeed}W).`,
            severity: 'warning',
          });
        }
      }
    }

    // Modular custom rules hook
    for (const customFn of this.customCompatibilityRules) {
      const extra = customFn({ case: pcCase, mb, cpu, cooler, ram, gpu, psu, storage }, assemblyState);
      if (Array.isArray(extra)) compatibilityIssues.push(...extra);
    }

    // ========================================================
    // C. CONNECTION CORRECTNESS
    // ========================================================
    const sKindInstalled = storage ? detectStorageKind(storage) : null;
    const isSataStorage = sKindInstalled === 'sata_25' || sKindInstalled === 'sata_35';
    const gpuNeedsPcieCable = Boolean(gpu && Number(gpu.tdp_watts || 0) > 75);

    for (const cableDef of CABLE_DEFINITIONS) {
      let requiredNow = false;
      if (cableDef.alwaysRequired) {
        // Required whenever core desktop assembly is evaluated
        requiredNow = true;
      } else if (cableDef.requiredIfGpuExternalPower && gpuNeedsPcieCable) {
        requiredNow = true;
      } else if (cableDef.requiredIfSataStorage && isSataStorage) {
        requiredNow = true;
      } else if (cableDef.id === 'c_case_fan' && slots.case_fan && slots.case_fan.status !== COMPONENT_STATE.STAGED) {
        requiredNow = true;
      }

      if (!requiredNow) continue;
      if (!cables[cableDef.id]?.connected) {
        connectionIssues.push({
          cableId: cableDef.id,
          label: cableDef.name,
          port: cableDef.portLabel,
          required: true,
          issue: `${cableDef.name} (${cableDef.portLabel}) is not connected.`,
        });
      }
    }

    // ========================================================
    // D. FINAL STRUCTURED ASSESSMENT
    // ========================================================
    const scenarioEvaluation = (activityConfig?.objectives || []).map((obj) => ({
      id: obj.id,
      text: obj.text,
      passed: this._evaluateObjective(obj.text, {
        correctlyInstalled,
        incorrectlyInstalled,
        missingComponents,
        connectionIssues,
        compatibilityIssues,
        assemblyState,
      }),
    }));

    const criticalCount =
      missingComponents.length +
      incorrectlyInstalled.filter((i) => i.severity === 'error').length +
      compatibilityIssues.filter((c) => c.severity === 'critical').length +
      connectionIssues.length;

    const warningCount =
      incorrectlyInstalled.filter((i) => i.severity === 'warning').length +
      compatibilityIssues.filter((c) => c.severity !== 'critical').length;

    const totalChecklistWeight =
      requiredSlots.length +
      CABLE_DEFINITIONS.filter((c) => c.alwaysRequired).length;
    const completedItems =
      correctlyInstalled.filter((c) => requiredSlots.includes(c.slot)).length +
      CABLE_DEFINITIONS.filter((c) => c.alwaysRequired && cables[c.id]?.connected).length;

    const completionPercent = Math.max(
      0,
      Math.min(100, Math.round((completedItems / Math.max(1, totalChecklistWeight)) * 100))
    );

    let score = 100;
    score -= missingComponents.length * 11;
    score -= incorrectlyInstalled.filter((i) => i.severity === 'error').length * 10;
    score -= incorrectlyInstalled.filter((i) => i.severity === 'warning').length * 3;
    score -= compatibilityIssues.filter((c) => c.severity === 'critical').length * 14;
    score -= compatibilityIssues.filter((c) => c.severity !== 'critical').length * 6;
    score -= connectionIssues.length * 7;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const passed = criticalCount === 0 && score >= 80;
    const gradeLabel =
      score === 100 && warningCount === 0
        ? 'Master Technician — Ready for POST'
        : passed
          ? 'Passed — Functional Assembly'
          : score >= 60
            ? 'Needs Revision — Fix Highlighted Issues'
            : 'Incomplete / Failed Assembly Check';

    const summary = passed
      ? `All ${correctlyInstalled.length} installed components, compatibility rules, and power/data connections passed validation.`
      : `Found ${missingComponents.length} missing part(s), ${incorrectlyInstalled.length} installation issue(s), ${compatibilityIssues.length} compatibility conflict(s), and ${connectionIssues.length} missing cable(s).`;

    return {
      evaluatedAt: new Date().toISOString(),
      passed,
      score,
      completionPercent,
      gradeLabel,
      summary,
      estimatedLoadWatts,
      correctlyInstalled,
      incorrectlyInstalled,
      missingComponents,
      connectionIssues,
      compatibilityIssues,
      scenarioEvaluation,
      counts: {
        correct: correctlyInstalled.length,
        incorrect: incorrectlyInstalled.length,
        missing: missingComponents.length,
        connections: connectionIssues.length,
        compatibility: compatibilityIssues.length,
      },
    };
  }

  _evaluateObjective(text, ctx) {
    const t = String(text || '').toLowerCase();
    const okSlots = new Set(ctx.correctlyInstalled.map((c) => c.slot));
    const hasCompatErr = ctx.compatibilityIssues.some((c) => c.severity === 'critical');

    if (t.includes('side panel') || t.includes('prepare pc case')) {
      return !ctx.missingComponents.some((m) => m.slot === 'case');
    }
    if (t.includes('motherboard')) return okSlots.has('mb') && !hasCompatErr;
    if (t.includes('cpu') && t.includes('cooler')) return okSlots.has('cooler');
    if (t.includes('cpu')) return okSlots.has('cpu') && !hasCompatErr;
    if (t.includes('ram') || t.includes('memory') || t.includes('ddr5') || t.includes('ddr4')) {
      return okSlots.has('ram') && !ctx.compatibilityIssues.some((c) => c.pair.includes('RAM'));
    }
    if (t.includes('gpu') || t.includes('graphics') || t.includes('4070')) {
      return okSlots.has('gpu') && !ctx.compatibilityIssues.some((c) => c.pair.includes('GPU'));
    }
    if (t.includes('storage') || t.includes('nvme') || t.includes('ssd') || t.includes('hdd')) {
      return okSlots.has('storage') && !ctx.compatibilityIssues.some((c) => c.pair.includes('Storage'));
    }
    if (t.includes('psu') || t.includes('power supply') || t.includes('watt')) {
      return okSlots.has('psu') && !ctx.compatibilityIssues.some((c) => c.pair.includes('PSU'));
    }
    if (t.includes('cable') || t.includes('connect')) {
      return ctx.connectionIssues.length === 0;
    }
    return ctx.missingComponents.length === 0 && ctx.incorrectlyInstalled.length === 0 && !hasCompatErr;
  }
}
