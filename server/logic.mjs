export const ADMIN_TABLES = {
  cpu: 'admin_cpu',
  gpu: 'admin_gpu',
  psu: 'admin_psu',
  ssd: 'admin_ssd',
  hdd: 'admin_hdd',
  fan: 'admin_fan',
  mobo: 'admin_mobo',
  ram: 'admin_ram',
};

export const ADMIN_SCHEMAS = {
  cpu: {
    fields: ['brand', 'model', 'family', 'cores', 'baseClock', 'turboClock', 'cache', 'igpu', 'tdp', 'memSupport', 'socket', 'released'],
    labels: ['Brand', 'Model', 'CPU Family', 'Cores (P/E)', 'Base Clock', 'Turbo Clock', 'Cache', 'Integrated GPU', 'TDP', 'Memory Support', 'Socket', 'Date Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  gpu: {
    fields: ['brand', 'model', 'memType', 'memCapacity', 'busWidth', 'coreClock', 'cudaCores', 'tdp', 'psu', 'formFactor', 'release'],
    labels: ['Brand', 'Model', 'Memory Type', 'Memory Capacity', 'Bus Width', 'Core Clock', 'CUDA/Shader Cores', 'TDP', 'PSU Req.', 'Form Factor', 'Release Year'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  psu: {
    fields: ['brand', 'model', 'powerOutput', 'psuType', 'efficiency', 'inputVoltage', 'frequency', 'cooling', 'modular', 'mainPower', 'cpuPower', 'pcieConn', 'sataConn', 'warranty', 'released'],
    labels: ['Brand', 'Model', 'Power Output', 'PSU Type', 'Efficiency', 'Input Voltage', 'Frequency', 'Cooling', 'Modular Type', 'Main Power', 'CPU Power', 'PCIe Connectors', 'SATA Connectors', 'Warranty', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  ssd: {
    fields: ['brand', 'model', 'storageType', 'interface', 'formFactor', 'capacity', 'nand', 'readSpeed', 'writeSpeed', 'readIOPS', 'writeIOPS', 'cache', 'endurance', 'power', 'encryption', 'released'],
    labels: ['Brand', 'Model', 'Storage Type', 'Interface', 'Form Factor', 'Capacity', 'NAND Type', 'Read Speed', 'Write Speed', 'Read IOPS', 'Write IOPS', 'Cache', 'Endurance', 'Power', 'Encryption', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  hdd: {
    fields: ['brand', 'model', 'storageType', 'interface', 'formFactor', 'capacity', 'readSpeed', 'writeSpeed', 'readIOPS', 'writeIOPS', 'cache', 'power', 'encryption', 'released'],
    labels: ['Brand', 'Model', 'Storage Type', 'Interface', 'Form Factor', 'Capacity', 'Read Speed', 'Write Speed', 'Read IOPS', 'Write IOPS', 'Cache', 'Power', 'Encryption', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  fan: {
    fields: ['brand', 'model', 'dimensions', 'speed', 'airflow', 'connector', 'voltage', 'released'],
    labels: ['Brand', 'Model', 'Fan Dimensions', 'Fan Speed', 'Airflow (CFM)', 'Connector Type', 'Voltage', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  mobo: {
    fields: ['brand', 'model', 'formFactor', 'chipset', 'socket', 'memType', 'dimms', 'maxMem', 'memSpeed', 'pciSlots', 'm2Slots', 'usb', 'tier', 'released'],
    labels: ['Brand', 'Model', 'Form Factor', 'Chipset', 'Socket', 'Memory Type', 'DIMM Slots', 'Max Memory', 'Memory Speed', 'PCIe Slots', 'M.2 Slots', 'USB Ports', 'Tier', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
  ram: {
    fields: ['brand', 'model', 'memType', 'capacity', 'config', 'formFactor', 'speed', 'cas', 'voltage', 'pins', 'ecc', 'buffered', 'xmp', 'released'],
    labels: ['Brand', 'Model', 'Memory Type', 'Capacity', 'Config', 'Form Factor', 'Speed', 'CAS Latency', 'Voltage', 'Pins', 'ECC Support', 'Buffered', 'XMP Support', 'Released'],
    brandKey: 'brand',
    modelKey: 'model',
  },
};

export const CATEGORY_INFO = {
  cpu: { name: 'Processor (CPU)', subtitle: 'Manage CPU specifications and details', pill: 'pill-cpu', icon: 'cat-cpu' },
  gpu: { name: 'Graphics Card (GPU)', subtitle: 'Manage GPU specifications and details', pill: 'pill-gpu', icon: 'cat-gpu' },
  psu: { name: 'Power Supply (PSU)', subtitle: 'Manage PSU specifications and details', pill: 'pill-psu', icon: 'cat-psu' },
  ssd: { name: 'Storage (SSD)', subtitle: 'Manage SSD specifications and details', pill: 'pill-ssd', icon: 'cat-ssd' },
  hdd: { name: 'Storage (HDD)', subtitle: 'Manage HDD specifications and details', pill: 'pill-hdd', icon: 'cat-hdd' },
  fan: { name: 'Cooling Fans', subtitle: 'Manage cooling fan specifications', pill: 'pill-fan', icon: 'cat-fan' },
  mobo: { name: 'Motherboard', subtitle: 'Manage motherboard specifications', pill: 'pill-mobo', icon: 'cat-mobo' },
  ram: { name: 'Memory (RAM)', subtitle: 'Manage RAM specifications and details', pill: 'pill-ram', icon: 'cat-ram' },
};

export const INSTRUCTOR_EMAIL_DOMAINS = new Set(['lnu.edu.ph']);
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const SCHOOL_ID_PATTERN = /^[a-zA-Z0-9\-_]{3,}$/;
export const NAME_PATTERN = /^[a-zA-Z\s\-']{1,}$/;

export function cleanText(value, maxLength = null) {
  const text = String(value ?? '').trim();
  if (maxLength && text.length > maxLength) {
    const err = new Error(`Input exceeds maximum length of ${maxLength} characters`);
    err.status = 400;
    throw err;
  }
  return text;
}

export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

export function isInstitutionalEmail(emailValue) {
  const parts = String(emailValue || '').split('@');
  const domain = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  return INSTRUCTOR_EMAIL_DOMAINS.has(domain);
}

export function validateEmail(email, allowEmpty = false) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    if (allowEmpty) return '';
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }
  if (normalized.length > 180) {
    const err = new Error('Email exceeds maximum length of 180 characters');
    err.status = 400;
    throw err;
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    const err = new Error('Invalid email format');
    err.status = 400;
    throw err;
  }
  return normalized;
}

export function validatePassword(password, minLength = 8, maxLength = 256) {
  const pw = String(password ?? '');
  if (pw.length < minLength) {
    const err = new Error(`Password must be at least ${minLength} characters`);
    err.status = 400;
    throw err;
  }
  if (pw.length > maxLength) {
    const err = new Error(`Password exceeds maximum length of ${maxLength} characters`);
    err.status = 400;
    throw err;
  }
  return pw;
}

export function validateUsername(username) {
  const cleaned = cleanText(username, 80);
  if (!cleaned) {
    const err = new Error('Student ID is required');
    err.status = 400;
    throw err;
  }
  if (!SCHOOL_ID_PATTERN.test(cleaned)) {
    const err = new Error('Username must be 3+ characters with letters, numbers, hyphens, or underscores');
    err.status = 400;
    throw err;
  }
  return cleaned;
}

export function validateName(name, fieldName = 'Name') {
  const cleaned = cleanText(name, 100);
  if (!cleaned) {
    const err = new Error(`${fieldName} is required`);
    err.status = 400;
    throw err;
  }
  if (!NAME_PATTERN.test(cleaned)) {
    const err = new Error(`${fieldName} contains invalid characters`);
    err.status = 400;
    throw err;
  }
  return cleaned;
}

export function validateBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(text)) return false;
  const err = new Error('Invalid boolean value');
  err.status = 400;
  throw err;
}

export function normalizeCategory(category) {
  const c = String(category || '').toLowerCase().trim();
  const aliases = {
    all: 'all',
    cpu: 'cpu', cpus: 'cpu',
    mb: 'mb', mobo: 'mb', motherboard: 'mb', motherboards: 'mb',
    ram: 'ram', rams: 'ram', memory: 'ram', ram_modules: 'ram',
    gpu: 'gpu', gpus: 'gpu',
    storage: 'storage', ssd: 'storage', hdd: 'storage', storage_drives: 'storage',
    psu: 'psu', psus: 'psu',
    case: 'case', cases: 'case', pc_case: 'case', pc_cases: 'case',
    cooler: 'cooler', coolers: 'cooler', fan: 'cooler', fans: 'cooler',
  };
  return aliases[c] || null;
}

export function normalizeAdminCategory(category) {
  const c = String(category || '').toLowerCase().trim();
  const aliases = {
    cpu: 'cpu', processor: 'cpu', processors: 'cpu',
    gpu: 'gpu', graphics: 'gpu', graphics_card: 'gpu',
    psu: 'psu', power: 'psu', power_supply: 'psu',
    ssd: 'ssd',
    hdd: 'hdd', hard_drive: 'hdd',
    fan: 'fan', fans: 'fan', cooler: 'fan', coolers: 'fan', cooling: 'fan',
    mobo: 'mobo', mb: 'mobo', motherboard: 'mobo', motherboards: 'mobo',
    ram: 'ram', memory: 'ram',
  };
  return aliases[c] || null;
}

export function extractNumericId(value) {
  if (value === null || value === undefined) return null;
  let target = value;
  if (typeof target === 'object') {
    target =
      target.dbId ??
      target.db_id ??
      target.id ??
      target.cpu_id ??
      target.motherboard_id ??
      target.ram_id ??
      target.gpu_id ??
      target.psu_id ??
      target.storage_id ??
      target.case_id ??
      null;
  }
  if (target === null || target === undefined) return null;
  if (typeof target === 'number' && Number.isInteger(target)) return target;
  const text = String(target).trim();
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  const match = text.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export function getSelectedId(data, ...keys) {
  const sources = [data || {}];
  if (data && typeof data.components === 'object' && data.components !== null) {
    sources.push(data.components);
  }
  if (data && typeof data.selectedComponents === 'object' && data.selectedComponents !== null) {
    sources.push(data.selectedComponents);
  }
  for (const source of sources) {
    for (const key of keys) {
      const selectedId = extractNumericId(source[key]);
      if (selectedId) return selectedId;
    }
  }
  return null;
}

export function firstNumber(value, defaultVal = 0) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Math.trunc(parseFloat(match[1])) : defaultVal;
}

export function capacityToGb(value) {
  const text = String(value || '').toLowerCase();
  const num = firstNumber(text, 0);
  return text.includes('tb') ? num * 1000 : num;
}

export function parseBoolish(value) {
  return ['1', 'true', 'yes', 'y', 'supported', 'full', 'semi', 'modular', 'fully modular', 'semi-modular'].includes(
    String(value || '').toLowerCase().trim()
  );
}

export function parseRamSticks(config) {
  const match = String(config || '').toLowerCase().match(/(\d+)\s*x/);
  return match ? parseInt(match[1], 10) : 1;
}

export function maxNumber(value, defaultVal = 0) {
  const matches = String(value || '').match(/(\d+(?:\.\d+)?)/g);
  if (!matches || !matches.length) return defaultVal;
  return Math.max(...matches.map((m) => Math.trunc(parseFloat(m))));
}

export function fieldValue(component, ...keys) {
  if (!component) return '';
  for (const key of keys) {
    const val = component[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

export function memoryTypesFrom(...values) {
  const types = new Set();
  const fallback = new Set();
  for (const value of values) {
    const text = String(value || '').toUpperCase();
    const matches = text.matchAll(/\bDDR\s*([2-6])\w*/g);
    for (const m of matches) {
      types.add(`DDR${m[1]}`);
    }
    const cleaned = text.replace(/[^A-Z0-9]+/g, '');
    if (cleaned) fallback.add(cleaned);
  }
  return types.size ? types : fallback;
}

export function componentMemoryTypes(component) {
  if (!component) return new Set();
  return memoryTypesFrom(
    component.ram_type,
    component.memType,
    component.memoryType,
    component.type,
    component['Memory Type']
  );
}

export function memoryTypeLabel(component) {
  return String(fieldValue(component, 'ram_type', 'memType', 'memoryType', 'type', 'Memory Type') || 'unknown');
}

export function normalizeFormFactor(value) {
  const text = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!text) return '';
  if (text.includes('sodimm')) return 'so-dimm';
  if (text.includes('udimm') || text.includes('dimm')) return 'dimm';
  if (text.includes('microatx') || text === 'matx' || text === 'uatx') return 'micro-atx';
  if (text.includes('miniitx') || text === 'itx') return 'mini-itx';
  if (text === 'atx') return 'atx';
  if (text.includes('eatx')) return 'e-atx';
  if (text.includes('m2') || text.includes('2280')) return 'm.2';
  if (text.includes('25inch')) return '2.5 inch';
  if (text.includes('35inch')) return '3.5 inch';
  return text;
}

export function ramSlotFormFactor(component) {
  const explicit = normalizeFormFactor(fieldValue(component, 'ram_form_factor', 'ramSlotFormFactor', 'memoryFormFactor', 'slotFormFactor'));
  if (explicit) return explicit;
  const dimmText = String(fieldValue(component, 'dimms', 'dimmSlots', 'memorySlots')).toLowerCase();
  if (dimmText.includes('so-dimm') || dimmText.includes('sodimm')) return 'so-dimm';
  if (dimmText.includes('udimm') || dimmText.includes('dimm')) return 'dimm';
  const boardForm = normalizeFormFactor(fieldValue(component, 'form_factor', 'formFactor'));
  if (dimmText && ['atx', 'micro-atx', 'e-atx'].includes(boardForm)) return 'dimm';
  return '';
}

export function componentRamFormFactor(component) {
  return normalizeFormFactor(fieldValue(component, 'ram_form_factor', 'form_factor', 'formFactor', 'memoryFormFactor'));
}

export function pciePowerCapacityWatts(value) {
  const text = String(value || '').toLowerCase();
  if (!text || text.includes('none') || text.includes('n/a')) return 0;
  let capacity = 0;
  const regex = /(\d+)\s*x?\s*([0-9+]+)\s*-?\s*pin/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const count = parseInt(match[1], 10);
    const pins = match[2].replace(/\+/g, '');
    if (pins.includes('62') || pins.includes('8')) capacity += count * 150;
    else if (pins.includes('6')) capacity += count * 75;
  }
  if (capacity) return capacity;
  if (text.includes('6+2') || text.includes('8-pin') || text.includes('8 pin')) return 150;
  if (text.includes('6-pin') || text.includes('6 pin')) return 75;
  return 0;
}

export function pcieX16SlotCount(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('none') || !text.includes('x16')) return 0;
  let total = 0;
  const regex = /(\d+)\s*x\s*pcie[^,;]*x16/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    total += parseInt(match[1], 10);
  }
  if (total) return total;
  const x16Count = (text.match(/x16/g) || []).length;
  return x16Count || 1;
}

export function storageInterfaceKind(storage) {
  const text = String(fieldValue(storage, 'interface', 'storageInterface', 'storage_type', 'storageType')).toLowerCase();
  if (text.includes('nvme')) return 'nvme';
  if (text.includes('m.2') || text.includes('m2')) return 'm.2';
  if (text.includes('sata')) return 'sata';
  if (text.includes('ide') || text.includes('pata')) return 'ide';
  return text.trim();
}

export function adminCpuToSim(row) {
  const cores = firstNumber(row.cores);
  const threadsMatch = String(row.cores || '').match(/\/\s*(\d+)/);
  const threads = threadsMatch ? parseInt(threadsMatch[1], 10) : cores;
  return {
    ...row,
    dbId: row.id,
    cat: 'cpu',
    category: 'cpu',
    name: row.model || 'CPU',
    cpu_name: row.model || 'CPU',
    sub: `${row.cores || 'N/A'} · ${row.socket || 'N/A'}`,
    cores,
    threads,
    base_clock: firstNumber(row.baseClock),
    boost_clock: firstNumber(row.turboClock),
    tdp_watts: firstNumber(row.tdp),
    integrated_graphics: Boolean(row.igpu && !['none', 'no', 'false'].includes(String(row.igpu).toLowerCase())),
  };
}

export function adminMoboToSim(row) {
  return {
    ...row,
    dbId: row.id,
    cat: 'mb',
    category: 'mb',
    name: row.model || 'Motherboard',
    motherboard_name: row.model || 'Motherboard',
    sub: `${row.chipset || 'N/A'} · ${row.socket || 'N/A'} · ${row.memType || 'N/A'}`,
    ram_type: row.memType || '',
    dimm_slots: firstNumber(row.dimms),
    ram_slot_form_factor: ramSlotFormFactor(row),
    max_ram_gb: capacityToGb(row.maxMem),
    max_ram_speed_mhz: maxNumber(row.memSpeed),
    form_factor: row.formFactor || '',
    pcie_x16_slots: pcieX16SlotCount(row.pciSlots),
    m2_slots: firstNumber(row.m2Slots),
  };
}

export function adminRamToSim(row) {
  return {
    ...row,
    dbId: row.id,
    cat: 'ram',
    category: 'ram',
    name: row.model || 'RAM',
    ram_name: row.model || 'RAM',
    sub: `${row.capacity || 'N/A'} · ${row.memType || 'N/A'} · ${row.speed || 'N/A'}`,
    ram_type: row.memType || '',
    capacity_gb: capacityToGb(row.capacity),
    speed_mhz: firstNumber(row.speed),
    sticks: parseRamSticks(row.config),
    ram_form_factor: componentRamFormFactor(row),
  };
}

export function adminGpuToSim(row) {
  return {
    ...row,
    dbId: row.id,
    cat: 'gpu',
    category: 'gpu',
    name: row.model || 'GPU',
    gpu_name: row.model || 'GPU',
    sub: `${row.memCapacity || 'N/A'} VRAM · ${row.busWidth || 'N/A'}`,
    vram_gb: capacityToGb(row.memCapacity),
    interface: 'PCIe x16',
    recommended_psu_watts: firstNumber(row.psu),
    length_mm: 0,
    tdp_watts: firstNumber(row.tdp),
  };
}

export function adminStorageToSim(row, storageKind) {
  const simId = Number(row.id) + (storageKind === 'hdd' ? 100000 : 0);
  return {
    ...row,
    id: simId,
    dbId: simId,
    sourceDbId: row.id,
    cat: 'storage',
    category: 'storage',
    sourceCategory: storageKind,
    name: row.model || storageKind.toUpperCase(),
    storage_name: row.model || storageKind.toUpperCase(),
    sub: `${row.capacity || 'N/A'} · ${row.interface || 'N/A'}`,
    storage_type: row.storageType || storageKind.toUpperCase(),
    capacity_gb: capacityToGb(row.capacity),
    interface: row.interface || '',
  };
}

export function adminPsuToSim(row) {
  return {
    ...row,
    dbId: row.id,
    cat: 'psu',
    category: 'psu',
    name: row.model || 'PSU',
    psu_name: row.model || 'PSU',
    sub: `${row.powerOutput || 'N/A'} · ${row.efficiency || 'N/A'}`,
    wattage: firstNumber(row.powerOutput),
    efficiency_rating: row.efficiency || '',
    modular: parseBoolish(row.modular),
    pcie_power_capacity_watts: pciePowerCapacityWatts(row.pcieConn),
  };
}

export function adminFanToSim(row) {
  return {
    ...row,
    dbId: row.id,
    cat: 'cooler',
    category: 'cooler',
    name: row.model || 'Cooling Fan',
    sub: `${row.dimensions || 'N/A'} · ${row.airflow || 'N/A'} CFM`,
  };
}

function setsDisjoint(a, b) {
  for (const item of a) {
    if (b.has(item)) return false;
  }
  return true;
}

export function compatibilityIssues(selected) {
  const { cpu, mb, ram, gpu, storage, psu, case: pcCase } = selected;
  const issues = [];

  if (cpu && mb) {
    const cpuSocket = String(fieldValue(cpu, 'socket')).trim();
    const mbSocket = String(fieldValue(mb, 'socket')).trim();
    if (cpuSocket && mbSocket && cpuSocket.toLowerCase() !== mbSocket.toLowerCase()) {
      issues.push(`CPU socket ${cpuSocket} is not compatible with motherboard socket ${mbSocket}.`);
    }
  }

  if (cpu && ram) {
    const cpuRamTypes = memoryTypesFrom(fieldValue(cpu, 'memSupport', 'memorySupport', 'ramSupport'));
    const ramTypes = componentMemoryTypes(ram);
    if (cpuRamTypes.size && ramTypes.size && setsDisjoint(cpuRamTypes, ramTypes)) {
      issues.push(
        `RAM type ${memoryTypeLabel(ram)} is not supported by CPU memory support ${fieldValue(cpu, 'memSupport', 'memorySupport', 'ramSupport')}.`
      );
    }
  }

  if (mb && ram) {
    const boardRamTypes = componentMemoryTypes(mb);
    const ramTypes = componentMemoryTypes(ram);
    if (boardRamTypes.size && ramTypes.size && setsDisjoint(boardRamTypes, ramTypes)) {
      issues.push(`RAM type ${memoryTypeLabel(ram)} is not compatible with motherboard RAM type ${memoryTypeLabel(mb)}.`);
    }

    const ramCapacity = Number(fieldValue(ram, 'capacity_gb') || 0);
    const boardCapacity = Number(fieldValue(mb, 'max_ram_gb') || 0);
    if (ramCapacity && boardCapacity && ramCapacity > boardCapacity) {
      issues.push(`RAM capacity ${ramCapacity}GB exceeds motherboard maximum of ${boardCapacity}GB.`);
    }

    const ramSticks = Number(fieldValue(ram, 'sticks') || 0);
    const dimmSlots = Number(fieldValue(mb, 'dimm_slots', 'dimms') || 0);
    if (ramSticks && dimmSlots && ramSticks > dimmSlots) {
      issues.push(`RAM kit uses ${ramSticks} stick(s), but motherboard has only ${dimmSlots} memory slot(s).`);
    }

    const ramSpeed = Number(fieldValue(ram, 'speed_mhz') || 0);
    const boardSpeed = Number(fieldValue(mb, 'max_ram_speed_mhz') || 0);
    if (ramSpeed && boardSpeed && ramSpeed > boardSpeed) {
      issues.push(`RAM speed ${ramSpeed}MHz exceeds motherboard supported memory speed ${boardSpeed}MHz.`);
    }

    const ramForm = componentRamFormFactor(ram);
    const slotForm = ramSlotFormFactor(mb);
    if (ramForm && slotForm && ramForm !== slotForm) {
      issues.push(`RAM form factor ${ramForm} is not compatible with motherboard memory slot form factor ${slotForm}.`);
    }
  }

  if (mb && gpu) {
    if (Number(fieldValue(mb, 'pcie_x16_slots') || 0) < 1) {
      issues.push('Motherboard does not have a PCIe x16 slot for the GPU.');
    }
  }

  if (gpu && psu) {
    const psuWatts = Number(fieldValue(psu, 'wattage') || 0);
    const gpuRecommended = Number(fieldValue(gpu, 'recommended_psu_watts') || 0);
    if (psuWatts && gpuRecommended && psuWatts < gpuRecommended) {
      issues.push(`PSU wattage ${psuWatts}W is lower than GPU recommended ${gpuRecommended}W.`);
    }

    const gpuTdp = Number(fieldValue(gpu, 'tdp_watts', 'tdp') || 0);
    const externalGpuPower = Math.max(gpuTdp - 75, 0);
    const pcieCapacity = Number(fieldValue(psu, 'pcie_power_capacity_watts') || 0);
    if (externalGpuPower && pcieCapacity && pcieCapacity < externalGpuPower) {
      issues.push(
        `PSU PCIe power connectors provide about ${pcieCapacity}W, but GPU may need about ${externalGpuPower}W from PCIe power cables.`
      );
    } else if (externalGpuPower && !pcieCapacity) {
      issues.push('GPU requires PCIe power connectors, but the PSU does not list any PCIe connectors.');
    }
  }

  if (gpu && pcCase) {
    const gpuLength = Number(fieldValue(gpu, 'length_mm') || 0);
    const caseGpuLength = Number(fieldValue(pcCase, 'max_gpu_length_mm') || 0);
    if (gpuLength && caseGpuLength && gpuLength > caseGpuLength) {
      issues.push(`GPU length ${gpuLength}mm exceeds case maximum of ${caseGpuLength}mm.`);
    }
  }

  if (mb && storage) {
    const storageKind = storageInterfaceKind(storage);
    if (['nvme', 'm.2'].includes(storageKind) && Number(fieldValue(mb, 'm2_slots') || 0) < 1) {
      issues.push('M.2/NVMe storage requires at least one M.2 slot on the motherboard.');
    }
    if (storageKind === 'ide') {
      issues.push('IDE/PATA storage is not supported by this motherboard catalog.');
    }
  }

  if (mb && pcCase) {
    const motherboardForm = normalizeFormFactor(fieldValue(mb, 'form_factor', 'formFactor'));
    const caseSupport = String(fieldValue(pcCase, 'form_factor_support', 'formFactorSupport')).toLowerCase();
    if (
      motherboardForm &&
      caseSupport &&
      !normalizeFormFactor(caseSupport).includes(motherboardForm) &&
      !caseSupport.includes(motherboardForm)
    ) {
      issues.push(`Motherboard form factor ${fieldValue(mb, 'form_factor', 'formFactor')} is not supported by the selected case.`);
    }
  }

  return issues;
}

export function buildReport(data, fetchComponent) {
  const cpuId = getSelectedId(data, 'cpu', 'cpu_id', 'cpuId');
  const mbId = getSelectedId(data, 'mb', 'motherboard', 'motherboard_id', 'motherboardId', 'mb_id');
  const ramId = getSelectedId(data, 'ram', 'ram_id', 'ramId');
  const gpuId = getSelectedId(data, 'gpu', 'gpu_id', 'gpuId');
  const storageId = getSelectedId(data, 'storage', 'storage_id', 'storageId');
  const psuId = getSelectedId(data, 'psu', 'psu_id', 'psuId');
  const caseId = getSelectedId(data, 'case', 'case_id', 'caseId');

  const selected = {
    cpu: cpuId ? fetchComponent('cpu', cpuId) : null,
    mb: mbId ? fetchComponent('mb', mbId) : null,
    ram: ramId ? fetchComponent('ram', ramId) : null,
    gpu: gpuId ? fetchComponent('gpu', gpuId) : null,
    storage: storageId ? fetchComponent('storage', storageId) : null,
    psu: psuId ? fetchComponent('psu', psuId) : null,
    case: caseId ? fetchComponent('case', caseId) : null,
    cooler: null,
  };

  const { cpu, mb, ram, gpu, storage, psu, case: pcCase } = selected;
  const issues = compatibilityIssues(selected);
  const componentCount = [cpu, mb, ram, gpu, storage, psu, pcCase].filter(Boolean).length;

  let totalPower = 0;
  let totalMemory = 0;
  let gpuMemory = 0;

  if (cpu) totalPower += Number(cpu.tdp_watts || 0);
  if (mb) totalPower += 50;
  if (ram) {
    totalPower += 5;
    totalMemory = Number(ram.capacity_gb || 0);
  }
  if (storage) totalPower += 5;
  if (gpu) {
    totalPower += Math.max(Number(gpu.recommended_psu_watts || 0) - 250, 75);
    gpuMemory = Number(gpu.vram_gb || 0);
  }

  let recommendedPsu = totalPower + 150;
  if (gpu) {
    recommendedPsu = Math.max(recommendedPsu, Number(gpu.recommended_psu_watts || 0));
  }

  const score =
    issues.length === 0
      ? componentCount >= 5
        ? 100
        : Math.min(100, componentCount * 20)
      : Math.max(0, 100 - issues.length * 25);

  return {
    compatible: issues.length === 0,
    issues,
    selectedParts: selected,
    totalPower,
    recommendedPsu,
    totalMemory,
    gpuMemory,
    componentCount,
    score,
  };
}

export function searchTerms(value) {
  const seen = [];
  for (const raw of cleanText(value).toLowerCase().split(/\s+/)) {
    const term = raw.trim();
    if (term.length >= 2 && !seen.includes(term)) {
      seen.push(term);
    }
  }
  return seen.slice(0, 6);
}

export function matchesQuery(fields, query, terms) {
  const lowerQuery = query.toLowerCase();
  const haystacks = fields.map((f) => String(f || '').toLowerCase());
  if (haystacks.some((h) => h.includes(lowerQuery))) return true;
  if (!terms.length) return false;
  return terms.every((term) => haystacks.some((h) => h.includes(term)));
}
