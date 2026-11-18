/**
 * SimulationDataManager.mjs
 * Pure hardware specification enrichment, scenario/activity ingestion,
 * state serialization, and external dashboard integration contract.
 * Works identically in Node.js (node:test) and modern browsers.
 */

export const SIM_SCALE_MM_TO_UNITS = 0.01; // 100mm = 1.0 Three.js unit

export const HARDWARE_SLOTS = [
  'case',
  'mb',
  'cpu',
  'cooler',
  'ram',
  'gpu',
  'psu',
  'storage',
  'case_fan',
];

export const SLOT_DISPLAY_NAMES = {
  case: 'PC Case',
  mb: 'Motherboard',
  cpu: 'Processor (CPU)',
  cooler: 'CPU Cooler',
  ram: 'Memory (RAM)',
  gpu: 'Graphics Card (GPU)',
  psu: 'Power Supply (PSU)',
  storage: 'Storage Drive',
  case_fan: 'Case Fan',
};

export const CASE_SPEC_CATALOG = [
  {
    id: 'case_atx_mid',
    dbId: 9001,
    cat: 'case',
    category: 'case',
    brand: 'LNU TechLab',
    model: 'Workstation ATX Mid-Tower',
    name: 'Workstation ATX Mid-Tower',
    sub: 'ATX / mATX / Mini-ITX · Max GPU 345mm · Max Cooler 168mm',
    form_factor_support: 'ATX, Micro-ATX, Mini-ITX',
    formFactorSupport: 'ATX, Micro-ATX, Mini-ITX',
    max_gpu_length_mm: 345,
    max_cooler_height_mm: 168,
    dimensionsMm: { w: 220, h: 460, d: 460 },
    psuShroud: true,
    isDefaultCase: true,
    description: 'Standard ATX mid-tower chassis with tempered glass side panel, bottom PSU shroud, rear 120mm exhaust mount, and front mesh intake.',
  },
  {
    id: 'case_matx_compact',
    dbId: 9002,
    cat: 'case',
    category: 'case',
    brand: 'Corsair',
    model: '2000D Airflow Micro-ATX',
    name: '2000D Airflow Micro-ATX',
    sub: 'Micro-ATX / Mini-ITX · Max GPU 290mm · Max Cooler 155mm',
    form_factor_support: 'Micro-ATX, Mini-ITX',
    formFactorSupport: 'Micro-ATX, Mini-ITX',
    max_gpu_length_mm: 290,
    max_cooler_height_mm: 155,
    dimensionsMm: { w: 210, h: 410, d: 390 },
    psuShroud: true,
    description: 'Compact Micro-ATX chassis built for classroom lab desks; does not accept full ATX motherboards or oversized triple-slot GPUs.',
  },
  {
    id: 'case_full_pro',
    dbId: 9003,
    cat: 'case',
    category: 'case',
    brand: 'Fractal Design',
    model: 'Meshify 2 Pro Full-Tower',
    name: 'Meshify 2 Pro Full-Tower',
    sub: 'E-ATX / ATX / mATX / ITX · Max GPU 390mm · Max Cooler 185mm',
    form_factor_support: 'E-ATX, ATX, Micro-ATX, Mini-ITX',
    formFactorSupport: 'E-ATX, ATX, Micro-ATX, Mini-ITX',
    max_gpu_length_mm: 390,
    max_cooler_height_mm: 185,
    dimensionsMm: { w: 240, h: 490, d: 500 },
    psuShroud: true,
    description: 'High-clearance workstation chassis supporting long triple-slot GPUs, tall dual-tower coolers, and E-ATX/ATX boards.',
  },
];

export const CPU_COOLER_CATALOG = [
  {
    id: 'cooler_stock_65',
    dbId: 8001,
    cat: 'cooler',
    category: 'cooler',
    brand: 'OEM Reference',
    model: 'Low-Profile Radial Cooler (92mm)',
    name: 'Low-Profile Radial Cooler (92mm)',
    sub: 'AM4 / AM5 / LGA1700 / LGA1151 · 95W TDP · 72mm Height',
    coolerType: 'low_profile',
    socket_support: 'AM4, AM5, LGA1700, LGA1151',
    max_tdp_watts: 95,
    height_mm: 72,
    fan_size_mm: 92,
    connector: '4-pin PWM',
    tdp_watts: 4,
    dimensionsMm: { w: 96, h: 72, d: 96 },
    description: 'Compact downward-blowing heatsink suitable for 65W CPUs.',
  },
  {
    id: 'cooler_tower_120',
    dbId: 8002,
    cat: 'cooler',
    category: 'cooler',
    brand: 'DeepCool',
    model: 'AK400 Single-Tower 120mm Cooler',
    name: 'AK400 Single-Tower 120mm Cooler',
    sub: 'AM4 / AM5 / LGA1700 / LGA1151 · 220W TDP · 155mm Height',
    coolerType: 'tower',
    socket_support: 'AM4, AM5, LGA1700, LGA1151',
    max_tdp_watts: 220,
    height_mm: 155,
    fan_size_mm: 120,
    connector: '4-pin PWM',
    tdp_watts: 6,
    dimensionsMm: { w: 124, h: 155, d: 92 },
    description: '4-heatpipe direct-touch aluminum fin tower cooler with 120mm PWM fan.',
  },
  {
    id: 'cooler_dual_tower',
    dbId: 8003,
    cat: 'cooler',
    category: 'cooler',
    brand: 'Noctua',
    model: 'NH-D15 Dual-Tower 140mm Cooler',
    name: 'NH-D15 Dual-Tower 140mm Cooler',
    sub: 'AM4 / AM5 / LGA1700 · 250W TDP · 165mm Height',
    coolerType: 'dual_tower',
    socket_support: 'AM4, AM5, LGA1700',
    max_tdp_watts: 250,
    height_mm: 165,
    fan_size_mm: 140,
    connector: '4-pin PWM',
    tdp_watts: 8,
    dimensionsMm: { w: 150, h: 165, d: 135 },
    description: 'High-capacity dual-fin-stack tower cooler rated for high-TDP workstation processors.',
  },
];

export const CABLE_DEFINITIONS = [
  {
    id: 'c_24pin',
    name: '24-Pin ATX Power',
    desc: 'Main power harness from PSU to Motherboard 24-pin ATX header.',
    color: '#ef4444',
    from: 'psu',
    to: 'mb',
    fromPortKey: 'psu_main',
    toPortKey: 'mb_24pin',
    portLabel: 'ATX_24PIN',
    requiredWhenInstalled: ['psu', 'mb'],
    alwaysRequired: true,
  },
  {
    id: 'c_8pin_cpu',
    name: '8-Pin EPS CPU Power',
    desc: 'Supplemental +12V CPU VRM power from PSU to top-left MB EPS header.',
    color: '#f59e0b',
    from: 'psu',
    to: 'mb',
    fromPortKey: 'psu_eps',
    toPortKey: 'mb_eps',
    portLabel: 'CPU_PWR1',
    requiredWhenInstalled: ['psu', 'mb', 'cpu'],
    alwaysRequired: true,
  },
  {
    id: 'c_cpu_fan',
    name: 'CPU Cooler 4-Pin PWM',
    desc: 'Connects CPU Cooler PWM fan lead to Motherboard CPU_FAN1 header.',
    color: '#06b6d4',
    from: 'cooler',
    to: 'mb',
    fromPortKey: 'cooler_lead',
    toPortKey: 'mb_cpufan',
    portLabel: 'CPU_FAN1',
    requiredWhenInstalled: ['cooler', 'mb'],
    alwaysRequired: true,
  },
  {
    id: 'c_pcie_8',
    name: 'PCIe 6+2-Pin GPU Power',
    desc: 'Dedicated +12V PCIe power cable from PSU to discrete GPU.',
    color: '#8b5cf6',
    from: 'psu',
    to: 'gpu',
    fromPortKey: 'psu_pcie',
    toPortKey: 'gpu_pwr',
    portLabel: 'PCIE_PWR',
    requiredIfGpuExternalPower: true,
    alwaysRequired: false,
  },
  {
    id: 'c_sata_pwr',
    name: 'SATA Power Cable',
    desc: 'PSU SATA power connector for 2.5" SSD or 3.5" HDD drives.',
    color: '#10b981',
    from: 'psu',
    to: 'storage',
    fromPortKey: 'psu_sata',
    toPortKey: 'sata_drive',
    portLabel: 'SATA_PWR',
    requiredIfSataStorage: true,
    alwaysRequired: false,
  },
  {
    id: 'c_sata_data',
    name: 'SATA III Data Cable',
    desc: 'Data ribbon connecting SATA storage drive to Motherboard SATA port.',
    color: '#0ea5e9',
    from: 'storage',
    to: 'mb',
    fromPortKey: 'sata_drive',
    toPortKey: 'mb_sata',
    portLabel: 'SATA6G_1',
    requiredIfSataStorage: true,
    alwaysRequired: false,
  },
  {
    id: 'c_case_fan',
    name: 'Case Fan 4-Pin PWM',
    desc: 'Connects rear/front chassis cooling fan to Motherboard SYS_FAN1 header.',
    color: '#14b8a6',
    from: 'case_fan',
    to: 'mb',
    fromPortKey: 'fan_lead',
    toPortKey: 'mb_sysfan',
    portLabel: 'SYS_FAN1',
    requiredWhenInstalled: ['case_fan', 'mb'],
    alwaysRequired: false,
  },
  {
    id: 'c_front_panel',
    name: 'Front Panel Power SW',
    desc: 'Case power button, reset & status LED jumper block to MB JFP1.',
    color: '#f97316',
    from: 'case',
    to: 'mb',
    fromPortKey: 'case_fp',
    toPortKey: 'mb_jfp1',
    portLabel: 'JFP1',
    requiredWhenInstalled: ['case', 'mb'],
    alwaysRequired: true,
  },
];

export const TROUBLESHOOTING_PRESETS = [
  {
    id: 'fault_no_post_orientation',
    title: 'Fault Lab 1: No-POST & Inverted Airflow Rig',
    description: 'Diagnose why this workstation fails POST & thermal checks: inspect CPU orientation, thermal paste, PSU/Case fan orientation, and GPU power cabling.',
    parts: {
      mb: 'ROG STRIX B850-E',
      cpu: 'Ryzen 9 7900X',
      cooler: 'AK400 Single-Tower 120mm Cooler',
      ram: 'Vengeance 32GB DDR5 5600',
      gpu: 'GeForce RTX 4070',
      storage: '980 1TB NVMe SSD',
      psu: 'RM850e 850W 80+ Gold',
      case_fan: 'SickleFlow 120',
    },
    faults: {
      rotationSteps: { cpu: 1, psu: 2, case_fan: 2 },
      unsecured: ['cpu', 'gpu'],
      thermalPasteApplied: false,
      cables: ['c_24pin', 'c_8pin_cpu', 'c_cpu_fan', 'c_front_panel'], // missing c_pcie_8 & c_case_fan
    },
    objectives: [
      { id: 'fl1_cpu', text: 'Re-orient rotated CPU Pin-1 corner, apply thermal paste, and latch ILM lever' },
      { id: 'fl1_airflow', text: 'Flip upside-down PSU (fan down) and backward rear Case Fan' },
      { id: 'fl1_cables', text: 'Connect missing PCIe GPU power and Case Fan cables, then pass POST' },
    ],
  },
  {
    id: 'fault_memory_power_mismatch',
    title: 'Fault Lab 2: Memory Conflict & Unplugged Rails',
    description: 'This workstation halts at boot with memory and power faults. Swap out incompatible RAM, re-fasten unlatched components, and connect missing motherboard cables.',
    parts: {
      mb: 'PRO B660M-A DDR4',
      cpu: 'Core i5-12400',
      cooler: 'AK400 Single-Tower 120mm Cooler',
      ram: 'HyperX Fury 8GB DDR3 1600', // Wrong DDR3 module in DDR4 board!
      gpu: 'GeForce RTX 4060',
      storage: '870 EVO 500GB SATA SSD',
      psu: 'MWE 650W 80+ Bronze',
    },
    faults: {
      rotationSteps: { ram: 2 },
      unsecured: ['ram', 'psu'],
      thermalPasteApplied: true,
      cables: ['c_24pin', 'c_front_panel', 'c_sata_pwr'], // missing c_8pin_cpu, c_cpu_fan, c_pcie_8, c_sata_data
    },
    objectives: [
      { id: 'fl2_ram', text: 'Replace DDR3 RAM with compatible DDR4 memory and secure DIMM latches' },
      { id: 'fl2_power', text: 'Fasten PSU, connect 8-pin CPU_PWR1, CPU_FAN1, PCIE_PWR, and SATA6G_1 data' },
      { id: 'fl2_post', text: 'Verify clean UEFI BIOS POST & pass Final Assembly Validation' },
    ],
  },
];

export function firstNum(val, fallback = 0) {
  const m = String(val ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : fallback;
}

export function capacityGbFrom(val) {
  const txt = String(val ?? '').toLowerCase();
  const n = firstNum(txt, 0);
  return txt.includes('tb') ? n * 1000 : n;
}

export function normalizeFormFactorToken(val) {
  const t = String(val ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!t) return '';
  if (t.includes('sodimm')) return 'so-dimm';
  if (t.includes('udimm') || t.includes('dimm')) return 'dimm';
  if (t.includes('eatx')) return 'e-atx';
  if (t.includes('microatx') || t === 'matx' || t === 'uatx') return 'micro-atx';
  if (t.includes('miniitx') || t === 'itx') return 'mini-itx';
  if (t === 'atx') return 'atx';
  if (t.includes('m2') || t.includes('2280') || t.includes('nvme')) return 'm.2';
  if (t.includes('25')) return '2.5 inch';
  if (t.includes('35')) return '3.5 inch';
  return t;
}

export function detectStorageKind(item) {
  const raw = `${item?.interface ?? ''} ${item?.formFactor ?? ''} ${item?.storageType ?? ''} ${item?.storage_type ?? ''}`.toLowerCase();
  if (raw.includes('nvme') || raw.includes('m.2') || raw.includes('2280')) return 'm2_nvme';
  if (raw.includes('3.5') || raw.includes('hdd')) return 'sata_35';
  if (raw.includes('ide') || raw.includes('pata')) return 'ide';
  return 'sata_25';
}

export function computeDimensionsMm(cat, item) {
  if (item?.dimensionsMm) return { ...item.dimensionsMm };
  if (cat === 'case') {
    const ff = String(item?.form_factor_support || item?.formFactorSupport || '').toLowerCase();
    if (ff.includes('e-atx')) return { w: 240, h: 490, d: 500 };
    if (!ff.includes('atx') && ff.includes('micro')) return { w: 210, h: 410, d: 390 };
    return { w: 220, h: 460, d: 460 };
  }
  if (cat === 'mb') {
    const ff = normalizeFormFactorToken(item?.form_factor || item?.formFactor);
    if (ff === 'mini-itx') return { w: 170, h: 170, d: 18 };
    if (ff === 'micro-atx') return { w: 244, h: 244, d: 22 };
    return { w: 244, h: 305, d: 24 };
  }
  if (cat === 'cpu') {
    const sock = String(item?.socket || '').toUpperCase();
    if (sock.includes('LGA1700')) return { w: 37.5, h: 45, d: 5 };
    return { w: 40, h: 40, d: 6 };
  }
  if (cat === 'cooler') {
    const h = Number(item?.height_mm || firstNum(item?.dimensions, 155)) || 155;
    return { w: 124, h, d: 96 };
  }
  if (cat === 'ram') {
    const isSo = normalizeFormFactorToken(item?.ram_form_factor || item?.formFactor) === 'so-dimm';
    return isSo ? { w: 69.6, h: 30, d: 4 } : { w: 133.3, h: 42, d: 7 };
  }
  if (cat === 'gpu') {
    const ff = String(item?.formFactor || '').toLowerCase();
    const tdp = firstNum(item?.tdp_watts ?? item?.tdp, 115);
    const triple = ff.includes('triple') || tdp >= 350;
    const len = Number(item?.length_mm || (triple ? 328 : tdp >= 180 ? 268 : 228));
    return { w: len, h: triple ? 140 : 118, d: triple ? 62 : 42 };
  }
  if (cat === 'psu') {
    const w = firstNum(item?.wattage ?? item?.powerOutput, 550);
    return { w: 150, h: 86, d: w >= 800 ? 160 : 140 };
  }
  if (cat === 'storage') {
    const kind = detectStorageKind(item);
    if (kind === 'm2_nvme') return { w: 80, h: 22, d: 4 };
    if (kind === 'sata_35') return { w: 101.6, h: 26, d: 147 };
    return { w: 69.8, h: 7, d: 100 };
  }
  if (cat === 'case_fan') {
    const sz = firstNum(item?.dimensions, 120) || 120;
    return { w: sz, h: sz, d: 25 };
  }
  return { w: 100, h: 100, d: 40 };
}

export function enrichComponentRecord(rawItem, explicitCat = null) {
  if (!rawItem || typeof rawItem !== 'object') return null;
  let cat = explicitCat || rawItem.cat || rawItem.category || '';
  if (cat === 'mobo' || cat === 'motherboard') cat = 'mb';
  if (cat === 'ssd' || cat === 'hdd') cat = 'storage';
  if (cat === 'fan' && !rawItem.coolerType) cat = 'case_fan';

  const name = rawItem.name || rawItem.model || rawItem.cpu_name || rawItem.motherboard_name || 'Hardware Component';
  const item = {
    ...rawItem,
    id: rawItem.id ?? rawItem.dbId ?? name,
    dbId: rawItem.dbId ?? rawItem.id ?? null,
    cat,
    category: cat,
    name,
    brand: rawItem.brand || 'Generic',
  };

  if (cat === 'gpu') {
    const tdp = firstNum(item.tdp_watts ?? item.tdp, 75);
    const dims = computeDimensionsMm('gpu', item);
    item.tdp_watts = tdp;
    item.length_mm = Number(item.length_mm || dims.w);
    item.requiresExternalPower = tdp > 75;
    item.recommended_psu_watts = Number(item.recommended_psu_watts || firstNum(item.psu, 300));
  }

  if (cat === 'cpu') {
    item.tdp_watts = Number(item.tdp_watts || firstNum(item.tdp, 65));
  }

  if (cat === 'mb') {
    item.form_factor = item.form_factor || item.formFactor || 'ATX';
    item.ram_type = item.ram_type || item.memType || '';
    item.dimm_slots = Number(item.dimm_slots || firstNum(item.dimms, 2));
    item.max_ram_gb = Number(item.max_ram_gb || capacityGbFrom(item.maxMem));
    item.max_ram_speed_mhz = Number(item.max_ram_speed_mhz || firstNum(item.memSpeed, 3200));
    item.m2_slots = Number(item.m2_slots ?? firstNum(item.m2Slots, 0));
    item.pcie_x16_slots = Number(item.pcie_x16_slots ?? (String(item.pciSlots || '').toLowerCase().includes('x16') ? 1 : 0));
  }

  if (cat === 'ram') {
    item.ram_type = item.ram_type || item.memType || '';
    item.capacity_gb = Number(item.capacity_gb || capacityGbFrom(item.capacity));
    item.speed_mhz = Number(item.speed_mhz || firstNum(item.speed, 3200));
    const m = String(item.config || '').toLowerCase().match(/(\d+)\s*x/);
    item.sticks = Number(item.sticks || (m ? parseInt(m[1], 10) : 1));
    item.ram_form_factor = item.ram_form_factor || normalizeFormFactorToken(item.formFactor || item.form_factor || 'DIMM');
  }

  if (cat === 'psu') {
    item.wattage = Number(item.wattage || firstNum(item.powerOutput, 450));
  }

  if (cat === 'storage') {
    item.storageKind = detectStorageKind(item);
    item.capacity_gb = Number(item.capacity_gb || capacityGbFrom(item.capacity));
  }

  if (cat === 'cooler') {
    item.height_mm = Number(item.height_mm || computeDimensionsMm('cooler', item).h);
    item.max_tdp_watts = Number(item.max_tdp_watts || 180);
  }

  item.dimensionsMm = computeDimensionsMm(cat, item);
  return item;
}

export class SimulationDataManager {
  constructor() {
    this.catalog = [];
    this.catalogByCategory = {};
    this.activity = null;
    this.listeners = new Set();
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
        console.error('SimulationDataManager listener error:', err);
      }
    }
  }

  /**
   * Hydrates the hardware catalog from /api/components grouped payload,
   * preserving every DB record while supplying realistic Case / CPU Cooler
   * physical hardware entries and converting DB fans into Case Fans.
   */
  hydrateCatalogFromApi(apiGrouped) {
    const grouped = {
      case: [],
      mb: [],
      cpu: [],
      cooler: [],
      ram: [],
      gpu: [],
      psu: [],
      storage: [],
      case_fan: [],
    };

    const pushList = (cat, arr) => {
      if (!Array.isArray(arr)) return;
      for (const raw of arr) {
        const enriched = enrichComponentRecord(raw, cat);
        if (enriched) grouped[cat].push(enriched);
      }
    };

    pushList('cpu', apiGrouped?.cpu);
    pushList('mb', apiGrouped?.mb);
    pushList('ram', apiGrouped?.ram);
    pushList('gpu', apiGrouped?.gpu);
    pushList('storage', apiGrouped?.storage);
    pushList('psu', apiGrouped?.psu);

    if (Array.isArray(apiGrouped?.case) && apiGrouped.case.length > 0) {
      pushList('case', apiGrouped.case);
    } else {
      pushList('case', CASE_SPEC_CATALOG);
    }

    // DB `fan` items populate Case Fans, plus CPU Coolers (either DB coolers or calibrated cooler hardware)
    if (Array.isArray(apiGrouped?.cooler)) {
      const fanItems = apiGrouped.cooler.filter((c) => !c.coolerType);
      const explicitCoolers = apiGrouped.cooler.filter((c) => Boolean(c.coolerType));
      pushList('case_fan', fanItems.map((f) => ({ ...f, cat: 'case_fan', category: 'case_fan' })));
      if (explicitCoolers.length > 0) {
        pushList('cooler', explicitCoolers);
      } else {
        pushList('cooler', CPU_COOLER_CATALOG);
      }
    } else {
      pushList('cooler', CPU_COOLER_CATALOG);
    }

    this.catalogByCategory = grouped;
    this.catalog = HARDWARE_SLOTS.flatMap((cat) => grouped[cat] || []);
    this.emit('catalog:loaded', { count: this.catalog.length });
    return this.catalog;
  }

  getCatalog(category = 'all') {
    if (!category || category === 'all') return [...this.catalog];
    return [...(this.catalogByCategory[category] || [])];
  }

  findComponent(category, idOrName) {
    if (idOrName === null || idOrName === undefined) return null;
    const pool = category && this.catalogByCategory[category] ? this.catalogByCategory[category] : this.catalog;
    return (
      pool.find(
        (c) =>
          String(c.id) === String(idOrName) ||
          String(c.dbId) === String(idOrName) ||
          String(c.name).toLowerCase() === String(idOrName).toLowerCase()
      ) || null
    );
  }

  getDefaultCase() {
    const cases = this.catalogByCategory.case || CASE_SPEC_CATALOG;
    return cases.find((c) => c.isDefaultCase) || cases[0];
  }

  /**
   * Receives an assigned activity/scenario configuration from the backend
   * or an external dashboard caller.
   */
  loadActivityConfig(scenarioConfig = null) {
    if (!scenarioConfig) {
      this.activity = {
        id: null,
        title: 'Free PC Assembly Lab',
        description: 'Assemble a complete desktop PC inside the 3D workstation, route power & data cables, and run final validation.',
        activityType: 'build',
        tier: 'Any',
        sequenceMode: 'standard_bench_first',
        enforceSequence: false,
        requiredSlots: ['case', 'mb', 'cpu', 'cooler', 'ram', 'gpu', 'psu', 'storage'],
        objectives: [
          { id: 'obj_case', text: 'Prepare PC Case (remove side panel)' },
          { id: 'obj_mb', text: 'Install compatible Motherboard on case standoffs' },
          { id: 'obj_cpu', text: 'Align & install CPU with Pin-1 triangle matched' },
          { id: 'obj_cooler', text: 'Apply thermal paste & mount CPU Cooler' },
          { id: 'obj_ram', text: 'Orient & seat RAM stick(s) in DIMM slots' },
          { id: 'obj_storage', text: 'Install M.2 NVMe or SATA storage drive' },
          { id: 'obj_gpu', text: 'Mount GPU into PCIe x16 slot' },
          { id: 'obj_psu', text: 'Install PSU (fan oriented down) in bay' },
          { id: 'obj_cables', text: 'Connect required ATX, EPS, fan, GPU & front-panel cables' },
        ],
        constraints: {},
      };
    } else {
      const objs = Array.isArray(scenarioConfig.objectives)
        ? scenarioConfig.objectives.map((o, idx) =>
            typeof o === 'string' ? { id: `sc_obj_${idx}`, text: o } : { id: o.id || `sc_obj_${idx}`, ...o }
          )
        : [];
      this.activity = {
        id: scenarioConfig.id ?? null,
        title: scenarioConfig.title || scenarioConfig.name || 'Assigned Assembly Activity',
        description: scenarioConfig.description || scenarioConfig.desc || '',
        activityType: scenarioConfig.activityType || scenarioConfig.type || 'build',
        tier: scenarioConfig.tier || 'Any',
        budget: scenarioConfig.budget ?? null,
        timeLimitMinutes: scenarioConfig.timeLimitMinutes ?? null,
        sequenceMode: scenarioConfig.constraints?.sequenceMode || 'standard_bench_first',
        enforceSequence: Boolean(scenarioConfig.constraints?.enforceSequence),
        requiredSlots: scenarioConfig.constraints?.requiredSlots || ['case', 'mb', 'cpu', 'cooler', 'ram', 'gpu', 'psu', 'storage'],
        objectives: objs,
        constraints: scenarioConfig.constraints || {},
      };
    }

    this.emit('activity:loaded', this.activity);
    return this.activity;
  }

  /**
   * Serializes current assembly state into a /api/builds compatible payload
   * while embedding full 3D mechanical metadata under build_data.sim3d.
   */
  exportBuildPayload(assemblyState, validationReport = null, buildName = null) {
    const components = {};
    for (const slot of ['mb', 'cpu', 'cooler', 'ram', 'gpu', 'storage', 'psu', 'case', 'case_fan']) {
      components[slot] = assemblyState.slots[slot]?.component || null;
    }

    const connectedCables = {};
    for (const [cableId, conn] of Object.entries(assemblyState.cables || {})) {
      if (conn?.connected) {
        connectedCables[cableId] = cableId;
      }
    }

    const score = validationReport ? validationReport.score : 0;
    const filledCount = Object.values(components).filter(Boolean).length;
    const stamp = new Date().toLocaleString();
    const resolvedName = buildName || `3D Build ${score ? `${score}% ` : ''}- ${stamp}`;

    return {
      buildName: resolvedName,
      name: resolvedName,
      description: `${filledCount}/${HARDWARE_SLOTS.length} 3D components assembled`,
      grade: score,
      components,
      connectedCables,
      sim3d: {
        version: 1,
        sidePanelOpen: assemblyState.sidePanelOpen,
        mbMountLocation: assemblyState.mbMountLocation,
        thermalPasteApplied: assemblyState.thermalPasteApplied,
        slots: Object.fromEntries(
          Object.entries(assemblyState.slots).map(([k, v]) => [
            k,
            v
              ? {
                  componentId: v.component?.id ?? null,
                  dbId: v.component?.dbId ?? null,
                  status: v.status,
                  mountLocation: v.mountLocation,
                  rotationStep: v.rotationStep,
                  secured: v.secured,
                  misalignedReason: v.misalignedReason || null,
                }
              : null,
          ])
        ),
        cables: { ...assemblyState.cables },
      },
    };
  }

  /**
   * Formats final evaluation results cleanly for instructor/student dashboards.
   */
  exportAssessmentResult(validationReport, assemblyState) {
    return {
      activityId: this.activity?.id ?? null,
      activityTitle: this.activity?.title ?? 'Free PC Assembly Lab',
      completedAt: new Date().toISOString(),
      score: validationReport.score,
      passed: validationReport.passed,
      completionPercent: validationReport.completionPercent,
      gradeLabel: validationReport.gradeLabel,
      correctlyInstalled: validationReport.correctlyInstalled,
      incorrectlyInstalled: validationReport.incorrectlyInstalled,
      missingComponents: validationReport.missingComponents,
      connectionIssues: validationReport.connectionIssues,
      compatibilityIssues: validationReport.compatibilityIssues,
      scenarioEvaluation: validationReport.scenarioEvaluation,
      summary: validationReport.summary,
      buildSnapshot: this.exportBuildPayload(assemblyState, validationReport),
    };
  }
}
