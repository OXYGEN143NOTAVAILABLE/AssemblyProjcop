import bcrypt from 'bcryptjs';

export function createInitialStore() {
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const instructorPasswordHash = bcrypt.hashSync('instructor123', 10);
  const studentPasswordHash = bcrypt.hashSync('student123', 10);
  const nowIso = new Date().toISOString();

  const admin_cpu = [
    { id: 1, brand: 'Intel', model: 'Core i5-12400', family: 'Alder Lake', cores: '6C/12T', baseClock: '2.5 GHz', turboClock: '4.4 GHz', cache: '18 MB', igpu: 'Intel UHD 730', tdp: '65W', memSupport: 'DDR4/DDR5', socket: 'LGA1700', released: '2022' },
    { id: 2, brand: 'Intel', model: 'Core i7-13700K', family: 'Raptor Lake', cores: '16C/24T', baseClock: '3.4 GHz', turboClock: '5.4 GHz', cache: '30 MB', igpu: 'Intel UHD 770', tdp: '125W', memSupport: 'DDR4/DDR5', socket: 'LGA1700', released: '2022' },
    { id: 3, brand: 'AMD', model: 'Ryzen 5 5600', family: 'Zen 3', cores: '6C/12T', baseClock: '3.5 GHz', turboClock: '4.4 GHz', cache: '35 MB', igpu: 'None', tdp: '65W', memSupport: 'DDR4', socket: 'AM4', released: '2022' },
    { id: 4, brand: 'AMD', model: 'Ryzen 9 7900X', family: 'Zen 4', cores: '12C/24T', baseClock: '4.7 GHz', turboClock: '5.6 GHz', cache: '76 MB', igpu: 'Radeon Graphics', tdp: '170W', memSupport: 'DDR5', socket: 'AM5', released: '2022' },
    { id: 5, brand: 'Intel', model: 'Core i5-7500', family: 'Kaby Lake', cores: '4C/4T', baseClock: '3.4 GHz', turboClock: '3.8 GHz', cache: '6 MB', igpu: 'Intel HD 630', tdp: '65W', memSupport: 'DDR4', socket: 'LGA1151', released: '2017' },
  ];

  const admin_mobo = [
    { id: 1, brand: 'ASUS', model: 'PRIME H610M-K D4', formFactor: 'Micro-ATX', chipset: 'H610', socket: 'LGA1700', memType: 'DDR4', dimms: '2', maxMem: '64GB', memSpeed: '3200 MHz', pciSlots: '1x PCIe x16', m2Slots: '1', usb: 'USB 3.2 Gen 1, USB 2.0', tier: 'Entry', released: '2022' },
    { id: 2, brand: 'MSI', model: 'PRO B660M-A DDR4', formFactor: 'Micro-ATX', chipset: 'B660', socket: 'LGA1700', memType: 'DDR4', dimms: '4', maxMem: '128GB', memSpeed: '4800 MHz', pciSlots: '1x PCIe x16, 1x PCIe x1', m2Slots: '2', usb: 'USB 3.2 Gen 2, USB 2.0', tier: 'Mainstream', released: '2022' },
    { id: 3, brand: 'Gigabyte', model: 'B550M DS3H', formFactor: 'Micro-ATX', chipset: 'B550', socket: 'AM4', memType: 'DDR4', dimms: '4', maxMem: '128GB', memSpeed: '4733 MHz', pciSlots: '1x PCIe x16, 1x PCIe x1', m2Slots: '2', usb: 'USB 3.2 Gen 1, USB 2.0', tier: 'Mainstream', released: '2020' },
    { id: 4, brand: 'ASUS', model: 'ROG STRIX B850-E', formFactor: 'ATX', chipset: 'B850', socket: 'AM5', memType: 'DDR5', dimms: '4', maxMem: '192GB', memSpeed: '8000 MHz', pciSlots: '2x PCIe x16', m2Slots: '4', usb: 'USB-C, USB 3.2 Gen 2x2', tier: 'High End', released: '2025' },
    { id: 5, brand: 'ASUS', model: 'H110M-K', formFactor: 'Micro-ATX', chipset: 'H110', socket: 'LGA1151', memType: 'DDR4', dimms: '2', maxMem: '32GB', memSpeed: '2133 MHz', pciSlots: '1x PCIe x16, 2x PCIe x1', m2Slots: '0', usb: 'USB 3.0, USB 2.0', tier: 'Entry', released: '2016' },
    { id: 6, brand: 'ASRock', model: 'J5040-ITX', formFactor: 'Mini-ITX', chipset: 'Intel J5040', socket: 'Integrated', memType: 'DDR4', dimms: '2x SO-DIMM', maxMem: '8GB', memSpeed: '2400 MHz', pciSlots: '1x PCIe 2.0 x1', m2Slots: '1', usb: 'USB 3.2 Gen 1, USB 2.0', tier: 'Entry', released: '2020' },
  ];

  const admin_ram = [
    { id: 1, brand: 'Kingston', model: 'Fury Beast 16GB DDR4 3200', memType: 'DDR4', capacity: '16GB', config: '2x8GB', formFactor: 'DIMM', speed: '3200 MHz', cas: 'CL16', voltage: '1.35V', pins: '288-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'XMP 2.0', released: '2020' },
    { id: 2, brand: 'Corsair', model: 'Vengeance 32GB DDR5 5600', memType: 'DDR5', capacity: '32GB', config: '2x16GB', formFactor: 'DIMM', speed: '5600 MHz', cas: 'CL36', voltage: '1.25V', pins: '288-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'XMP 3.0', released: '2022' },
    { id: 3, brand: 'Kingston', model: 'FURY Beast 32GB DDR5 5200', memType: 'DDR5', capacity: '32GB', config: '2x16GB', formFactor: 'DIMM', speed: '5200 MHz', cas: 'CL40', voltage: '1.25V', pins: '288-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'XMP 3.0', released: '2022' },
    { id: 4, brand: 'Kingston', model: 'HyperX Fury 8GB DDR3 1600', memType: 'DDR3', capacity: '8GB', config: '2x4GB', formFactor: 'DIMM', speed: '1600 MHz', cas: 'CL10', voltage: '1.5V', pins: '240-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'XMP 1.3', released: '2014' },
    { id: 5, brand: 'Corsair', model: 'Vengeance LPX 64GB DDR4 3200', memType: 'DDR4', capacity: '64GB', config: '2x32GB', formFactor: 'DIMM', speed: '3200 MHz', cas: 'CL16', voltage: '1.35V', pins: '288-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'XMP 2.0', released: '2020' },
    { id: 6, brand: 'Crucial', model: '8GB DDR4 2400 SO-DIMM', memType: 'DDR4', capacity: '8GB', config: '1x8GB', formFactor: 'SO-DIMM', speed: '2400 MHz', cas: 'CL17', voltage: '1.2V', pins: '260-pin', ecc: 'No', buffered: 'Unbuffered', xmp: 'None', released: '2017' },
  ];

  const admin_gpu = [
    { id: 1, brand: 'NVIDIA', model: 'GeForce GTX 1650', memType: 'GDDR5', memCapacity: '4GB', busWidth: '128-bit', coreClock: '1485 MHz', cudaCores: '896', tdp: '75W', psu: '300W', formFactor: 'Dual-slot', release: '2019' },
    { id: 2, brand: 'NVIDIA', model: 'GeForce RTX 3050', memType: 'GDDR6', memCapacity: '8GB', busWidth: '128-bit', coreClock: '1552 MHz', cudaCores: '2560', tdp: '130W', psu: '450W', formFactor: 'Dual-slot', release: '2022' },
    { id: 3, brand: 'NVIDIA', model: 'GeForce RTX 4060', memType: 'GDDR6', memCapacity: '8GB', busWidth: '128-bit', coreClock: '1830 MHz', cudaCores: '3072', tdp: '115W', psu: '550W', formFactor: 'Dual-slot', release: '2023' },
    { id: 4, brand: 'NVIDIA', model: 'GeForce RTX 4070', memType: 'GDDR6X', memCapacity: '12GB', busWidth: '192-bit', coreClock: '1920 MHz', cudaCores: '5888', tdp: '200W', psu: '700W', formFactor: 'Dual-slot', release: '2023' },
    { id: 5, brand: 'NVIDIA', model: 'GeForce GTX 750 Ti', memType: 'GDDR5', memCapacity: '2GB', busWidth: '128-bit', coreClock: '1020 MHz', cudaCores: '640', tdp: '60W', psu: '300W', formFactor: 'Dual-slot', release: '2014' },
    { id: 6, brand: 'NVIDIA', model: 'GeForce RTX 4090', memType: 'GDDR6X', memCapacity: '24GB', busWidth: '384-bit', coreClock: '2235 MHz', cudaCores: '16384', tdp: '450W', psu: '850W', formFactor: 'Triple-slot', release: '2022' },
  ];

  const admin_psu = [
    { id: 1, brand: 'Corsair', model: 'CV450 450W 80+ Bronze', powerOutput: '450W', psuType: 'ATX', efficiency: '80+ Bronze', inputVoltage: '100-240V', frequency: '50-60Hz', cooling: '120mm Fan', modular: 'Non-modular', mainPower: '24-pin ATX', cpuPower: '1x 8-pin EPS', pcieConn: '1x 6+2-pin', sataConn: '4', warranty: '3 years', released: '2020' },
    { id: 2, brand: 'Corsair', model: 'CV550 550W 80+ Bronze', powerOutput: '550W', psuType: 'ATX', efficiency: '80+ Bronze', inputVoltage: '100-240V', frequency: '50-60Hz', cooling: '120mm Fan', modular: 'Non-modular', mainPower: '24-pin ATX', cpuPower: '1x 8-pin EPS', pcieConn: '2x 6+2-pin', sataConn: '6', warranty: '3 years', released: '2020' },
    { id: 3, brand: 'Cooler Master', model: 'MWE 650W 80+ Bronze', powerOutput: '650W', psuType: 'ATX', efficiency: '80+ Bronze', inputVoltage: '100-240V', frequency: '50-60Hz', cooling: '120mm Fan', modular: 'Non-modular', mainPower: '24-pin ATX', cpuPower: '1x 8-pin EPS', pcieConn: '4x 6+2-pin', sataConn: '6', warranty: '5 years', released: '2021' },
    { id: 4, brand: 'Corsair', model: 'RM850e 850W 80+ Gold', powerOutput: '850W', psuType: 'ATX', efficiency: '80+ Gold', inputVoltage: '100-240V', frequency: '50-60Hz', cooling: '140mm Fan', modular: 'Fully modular', mainPower: '24-pin ATX', cpuPower: '2x 8-pin EPS', pcieConn: '4x 6+2-pin', sataConn: '8', warranty: '7 years', released: '2023' },
    { id: 5, brand: 'Corsair', model: 'CX430 430W 80+ Bronze', powerOutput: '430W', psuType: 'ATX', efficiency: '80+ Bronze', inputVoltage: '100-240V', frequency: '50-60Hz', cooling: '120mm Fan', modular: 'Non-modular', mainPower: '24-pin ATX', cpuPower: '1x 4+4-pin EPS', pcieConn: '1x 6+2-pin', sataConn: '4', warranty: '3 years', released: '2013' },
  ];

  const admin_ssd = [
    { id: 1, brand: 'Samsung', model: '870 EVO 500GB SATA SSD', storageType: 'SSD', interface: 'SATA', formFactor: '2.5 inch', capacity: '500GB', nand: 'TLC', readSpeed: '560 MB/s', writeSpeed: '530 MB/s', readIOPS: '98000', writeIOPS: '88000', cache: 'DRAM', endurance: '300 TBW', power: '3W', encryption: 'AES 256-bit', released: '2021' },
    { id: 2, brand: 'Samsung', model: '980 1TB NVMe SSD', storageType: 'SSD', interface: 'M.2 NVMe', formFactor: 'M.2 2280', capacity: '1TB', nand: 'TLC', readSpeed: '3500 MB/s', writeSpeed: '3000 MB/s', readIOPS: '500000', writeIOPS: '480000', cache: 'HMB', endurance: '600 TBW', power: '5W', encryption: 'None', released: '2021' },
    { id: 3, brand: 'Kingston', model: 'NV2 500GB NVMe SSD', storageType: 'SSD', interface: 'M.2 NVMe', formFactor: 'M.2 2280', capacity: '500GB', nand: 'QLC/TLC', readSpeed: '3500 MB/s', writeSpeed: '2100 MB/s', readIOPS: '190000', writeIOPS: '220000', cache: 'HMB', endurance: '160 TBW', power: '5W', encryption: 'None', released: '2022' },
    { id: 4, brand: 'Crucial', model: 'MX100 256GB SATA SSD', storageType: 'SSD', interface: 'SATA', formFactor: '2.5 inch', capacity: '256GB', nand: 'MLC', readSpeed: '550 MB/s', writeSpeed: '330 MB/s', readIOPS: '85000', writeIOPS: '70000', cache: 'DRAM', endurance: '72 TBW', power: '3W', encryption: 'AES 256-bit', released: '2014' },
  ];

  const admin_hdd = [
    { id: 1, brand: 'Seagate', model: 'Barracuda 1TB HDD', storageType: 'HDD', interface: 'SATA', formFactor: '3.5 inch', capacity: '1TB', readSpeed: '210 MB/s', writeSpeed: '190 MB/s', readIOPS: '120', writeIOPS: '120', cache: '64MB', power: '5.3W', encryption: 'None', released: '2018' },
    { id: 2, brand: 'Western Digital', model: 'Blue 2TB HDD', storageType: 'HDD', interface: 'SATA', formFactor: '3.5 inch', capacity: '2TB', readSpeed: '215 MB/s', writeSpeed: '200 MB/s', readIOPS: '150', writeIOPS: '150', cache: '256MB', power: '5.6W', encryption: 'None', released: '2020' },
    { id: 3, brand: 'Western Digital', model: 'Blue 500GB HDD', storageType: 'HDD', interface: 'SATA', formFactor: '3.5 inch', capacity: '500GB', readSpeed: '126 MB/s', writeSpeed: '110 MB/s', readIOPS: '75', writeIOPS: '75', cache: '16MB', power: '5.4W', encryption: 'None', released: '2012' },
  ];

  const admin_fan = [
    { id: 1, brand: 'Cooler Master', model: 'SickleFlow 120', dimensions: '120x120x25mm', speed: '650-1800 RPM', airflow: '62', connector: '4-pin PWM', voltage: '12V', released: '2020' },
    { id: 2, brand: 'Corsair', model: 'AF120 Elite', dimensions: '120x120x25mm', speed: '400-1850 RPM', airflow: '59', connector: '4-pin PWM', voltage: '12V', released: '2022' },
    { id: 3, brand: 'Cooler Master', model: 'Blade Master 120', dimensions: '120x120x25mm', speed: '600-2000 RPM', airflow: '76', connector: '4-pin PWM', voltage: '12V', released: '2010' },
  ];

  const admin_users = [
    {
      admin_id: 1,
      username: 'admin',
      password_hash: adminPasswordHash,
      display_name: 'Administrator',
      role: 'admin',
      is_active: true,
      last_login_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      admin_id: 2,
      username: 'instructor@lnu.edu.ph',
      password_hash: instructorPasswordHash,
      display_name: 'Prof. Santos (BSIT)',
      role: 'instructor',
      is_active: true,
      last_login_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const student_users = [
    {
      student_id: 1,
      school_id: '2024-0001',
      email: 'student@lnu.edu.ph',
      password_hash: studentPasswordHash,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      display_name: 'Juan Dela Cruz',
      is_active: true,
      last_login_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const pc_scenarios = [
    {
      scenario_id: 1,
      instructor_id: 2,
      title: 'AM5 DDR5 Workstation Build',
      description: 'Assemble a compatible AM5 DDR5 PC with NVMe storage and an RTX 4070.',
      activity_type: 'build',
      tier: 'High End',
      budget: 1500,
      time_limit_minutes: 30,
      objectives: ['Match AM5 CPU and motherboard', 'Select DDR5 memory', 'Use an M.2 NVMe SSD', 'Provide 700W+ PSU capacity'],
      troubleshooting: [],
      constraints: {},
      is_published: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      scenario_id: 2,
      instructor_id: 2,
      title: 'Entry LGA1700 Lab PC',
      description: 'Configure an entry-level LGA1700 DDR4 system suitable for classroom workstations.',
      activity_type: 'build',
      tier: 'Entry',
      budget: 600,
      time_limit_minutes: 20,
      objectives: ['Select Core i5-12400', 'Pair with DDR4 motherboard and RAM', 'Verify 450W+ PSU'],
      troubleshooting: [],
      constraints: {},
      is_published: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const saved_builds = [
    {
      build_id: 1,
      build_name: 'LNU Lab AM5 Reference Build',
      owner_role: 'student',
      owner_id: 1,
      is_published: true,
      created_at: nowIso,
      updated_at: nowIso,
      build_data: {
        buildName: 'LNU Lab AM5 Reference Build',
        components: {
          cpu: { id: 4, dbId: 4, cat: 'cpu', category: 'cpu', brand: 'AMD', name: 'Ryzen 9 7900X', socket: 'AM5', tdp_watts: 170, memSupport: 'DDR5' },
          mb: { id: 4, dbId: 4, cat: 'mb', category: 'mb', brand: 'ASUS', name: 'ROG STRIX B850-E', socket: 'AM5', ram_type: 'DDR5', dimm_slots: 4, max_ram_gb: 192, max_ram_speed_mhz: 8000, form_factor: 'ATX', pcie_x16_slots: 2, m2_slots: 4 },
          ram: { id: 2, dbId: 2, cat: 'ram', category: 'ram', brand: 'Corsair', name: 'Vengeance 32GB DDR5 5600', ram_type: 'DDR5', capacity_gb: 32, speed_mhz: 5600, sticks: 2, ram_form_factor: 'dimm' },
          gpu: { id: 4, dbId: 4, cat: 'gpu', category: 'gpu', brand: 'NVIDIA', name: 'GeForce RTX 4070', vram_gb: 12, recommended_psu_watts: 700, tdp_watts: 200 },
          storage: { id: 2, dbId: 2, cat: 'storage', category: 'storage', brand: 'Samsung', name: '980 1TB NVMe SSD', storage_type: 'SSD', capacity_gb: 1000, interface: 'M.2 NVMe' },
          psu: { id: 4, dbId: 4, cat: 'psu', category: 'psu', brand: 'Corsair', name: 'RM850e 850W 80+ Gold', wattage: 850, pcie_power_capacity_watts: 600 },
        },
        connectedCables: {},
        stats: {
          compatible: true,
          issues: [],
          totalPower: 675,
          recommendedPsu: 825,
          totalMemory: 32,
          gpuMemory: 12,
          componentCount: 6,
          score: 100,
        },
      },
    },
  ];

  const user_badges = [
    {
      badge_id: 1,
      user_role: 'student',
      user_id: 1,
      badge_key: 'build_1',
      badge_name: '1 Build',
      badge_description: 'Created 1 published build.',
      earned_at: nowIso,
    },
  ];

  return {
    components: {
      cpu: admin_cpu,
      gpu: admin_gpu,
      psu: admin_psu,
      ssd: admin_ssd,
      hdd: admin_hdd,
      fan: admin_fan,
      mobo: admin_mobo,
      ram: admin_ram,
    },
    admin_users,
    student_users,
    pc_scenarios,
    saved_builds,
    build_favorites: [],
    build_hearts: [{ heart_id: 1, build_id: 1, user_role: 'instructor', user_id: 2, created_at: nowIso }],
    user_badges,
    scenario_completions: [],
    nextIds: {
      cpu: 6,
      mobo: 7,
      ram: 7,
      gpu: 7,
      psu: 6,
      ssd: 5,
      hdd: 4,
      fan: 4,
      admin_user: 3,
      student_user: 2,
      scenario: 3,
      build: 2,
      favorite: 1,
      heart: 2,
      badge: 2,
      completion: 1,
    },
  };
}
