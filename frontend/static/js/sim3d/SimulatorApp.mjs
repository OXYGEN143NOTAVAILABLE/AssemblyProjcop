/**
 * SimulatorApp.mjs
 * Main 3D PC Assembly Simulation Engine controller.
 * Coordinates SceneManager, ComponentManager, InteractionManager,
 * AssemblyManager, PlacementSnappingSystem, ValidationEngine, and
 * SimulationDataManager with the /simulator UI & LMS/database APIs.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  SimulationDataManager,
  HARDWARE_SLOTS,
  SLOT_DISPLAY_NAMES,
  CABLE_DEFINITIONS,
  TROUBLESHOOTING_PRESETS,
  enrichComponentRecord,
} from './SimulationDataManager.mjs';
import {
  PlacementSnappingSystem,
  BENCH_PREP_ORIGIN,
  CASE_MB_ANCHOR,
} from './PlacementSnappingSystem.mjs';
import {
  AssemblyManager,
  COMPONENT_STATE,
  SEQUENCE_PRESETS,
} from './AssemblyManager.mjs';
import { ValidationEngine } from './ValidationEngine.mjs';
import { SceneManager } from './SceneManager.mjs';
import { ComponentManager } from './ComponentManager.mjs';
import { InteractionManager } from './InteractionManager.mjs';
import { createComponentMesh } from './ProceduralHardwareFactory.mjs';
import { SoundFX } from './SoundFX.mjs';

const CAT_BADGE_MAP = {
  case: { cls: 'cat-case', abbr: 'CS' },
  mb: { cls: 'cat-mb', abbr: 'MB' },
  cpu: { cls: 'cat-cpu', abbr: 'CPU' },
  cooler: { cls: 'cat-cooler', abbr: 'CLR' },
  ram: { cls: 'cat-ram', abbr: 'RAM' },
  gpu: { cls: 'cat-gpu', abbr: 'GPU' },
  storage: { cls: 'cat-storage', abbr: 'STR' },
  psu: { cls: 'cat-psu', abbr: 'PSU' },
  case_fan: { cls: 'cat-cooler', abbr: 'FAN' },
};

const STEP_EXPLANATIONS = {
  prep_case: 'Ground yourself via the ESD mat and remove the tempered glass panel to expose motherboard standoffs and drive bays.',
  mb_bench: 'Working on the ESD Prep Pad lets you seat delicate CPU pins, cooler brackets, and RAM cleanly with zero case obstruction.',
  cpu: 'Match the gold Pin-1 triangle on the CPU corner to the socket triangle. Zero force is required—do not force misaligned pins.',
  cooler: 'Apply a pea-sized dot of thermal paste on the IHS center before clamping the cooler for efficient heat transfer.',
  ram: 'Align the offset key notch in the DDR module with the DIMM slot bridge before pressing down evenly.',
  mb_case: 'Carefully lower the pre-assembled motherboard onto all brass standoffs, aligning the rear I/O shield edge toward the back (-X).',
  psu: 'Orient the PSU intake fan DOWN toward the bottom filtered vent so it draws cool air instead of hot case exhaust.',
  storage: 'M.2 NVMe SSDs mount directly onto the motherboard slot; 2.5"/3.5" SATA drives install into the front drive bay.',
  gpu: 'Align gold PCIe x16 fingers with the primary board slot and seat the rear expansion bracket flush against the chassis wall.',
  case_fan: 'Check the airflow arrow on the fan housing so the rear 120mm fan exhausts hot air out the back of the case.',
  cables: 'Route 24-pin ATX, 8-pin EPS CPU, fan PWM, PCIe GPU power, SATA, and Front Panel power leads neatly.',
  inspect: 'Close the side panel, power on to test POST/boot, or run Final Assembly Validation to grade every rule.',
  core_hw: 'Open Lab lets you stage and install components in any physically unobstructed order.',
};

const COMPONENT_DETAIL_FIELDS = {
  cpu: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Model', keys: ['model', 'name'] },
    { label: 'Socket', keys: ['socket'] },
    { label: 'Cores / Threads', keys: ['cores', 'threads'] },
    { label: 'Clock', keys: ['base_clock', 'baseClock', 'boost_clock', 'turboClock'] },
    { label: 'TDP', keys: ['tdp_watts', 'tdp'] },
    { label: 'Memory Support', keys: ['memSupport'] },
  ],
  mb: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Form Factor', keys: ['form_factor', 'formFactor'] },
    { label: 'Chipset', keys: ['chipset'] },
    { label: 'Socket', keys: ['socket'] },
    { label: 'Memory Type', keys: ['ram_type', 'memType'] },
    { label: 'DIMM Slots', keys: ['dimm_slots', 'dimms'] },
    { label: 'Max Memory', keys: ['max_ram_gb', 'maxMem'] },
    { label: 'M.2 Slots', keys: ['m2_slots', 'm2Slots'] },
  ],
  ram: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Memory Type', keys: ['ram_type', 'memType'] },
    { label: 'Capacity', keys: ['capacity_gb', 'capacity'] },
    { label: 'Config', keys: ['config', 'sticks'] },
    { label: 'Form Factor', keys: ['ram_form_factor', 'formFactor'] },
    { label: 'Speed', keys: ['speed_mhz', 'speed'] },
  ],
  gpu: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'VRAM', keys: ['vram_gb', 'memCapacity', 'memType'] },
    { label: 'TDP', keys: ['tdp_watts', 'tdp'] },
    { label: 'Length', keys: ['length_mm'] },
    { label: 'Recommended PSU', keys: ['recommended_psu_watts', 'psu'] },
  ],
  storage: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Type', keys: ['storageType', 'storage_type'] },
    { label: 'Interface', keys: ['interface'] },
    { label: 'Capacity', keys: ['capacity_gb', 'capacity'] },
    { label: 'Read / Write', keys: ['readSpeed', 'writeSpeed'] },
  ],
  psu: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Wattage', keys: ['wattage', 'powerOutput'] },
    { label: 'Efficiency', keys: ['efficiency_rating', 'efficiency'] },
    { label: 'Modular', keys: ['modular'] },
    { label: 'PCIe Cables', keys: ['pcieConn'] },
  ],
  cooler: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Socket Support', keys: ['socket_support'] },
    { label: 'Max TDP Rating', keys: ['max_tdp_watts'] },
    { label: 'Height', keys: ['height_mm'] },
    { label: 'Fan Size', keys: ['fan_size_mm'] },
  ],
  case: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Motherboard Support', keys: ['form_factor_support', 'formFactorSupport'] },
    { label: 'Max GPU Length', keys: ['max_gpu_length_mm'] },
    { label: 'Max Cooler Height', keys: ['max_cooler_height_mm'] },
  ],
  case_fan: [
    { label: 'Brand', keys: ['brand'] },
    { label: 'Dimensions', keys: ['dimensions'] },
    { label: 'Airflow', keys: ['airflow'] },
    { label: 'Connector', keys: ['connector'] },
  ],
};

function escapeHtml(val) {
  return String(val ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

class SimulatorApp {
  constructor() {
    this.userRole = sessionStorage.getItem('userRole') || 'guest';
    this.userName = sessionStorage.getItem('userName') || 'Guest';

    const params = new URLSearchParams(window.location.search);
    this.galleryBuildId = params.get('build');
    this.scenarioId = params.get('scenario');
    this.readOnly = Boolean(
      this.galleryBuildId &&
      ['1', 'true', 'yes'].includes(String(params.get('readonly') || '').toLowerCase())
    );

    this.currentCat = 'all';
    this.compSearchQuery = '';
    this.currentSTab = 'comp';
    this.currentRTab = 'build';
    this.currentView = '3d';
    this.lastValidation = null;
    this.saveInFlight = false;
    this.pendingScenarioObjectives = [];
    this.toastTimer = null;
    this.pendingCablePort = null;
    this.activeFaultLabId = '';
    this.inspectorCtx = null;

    // Core Modular Simulation Engine
    this.sfx = new SoundFX();
    this.dataMgr = new SimulationDataManager();
    this.snapping = new PlacementSnappingSystem();
    this.asm = new AssemblyManager(this.snapping);
    this.validator = new ValidationEngine();

    this.sceneMgr = null;
    this.compMgr = null;
    this.interactionMgr = null;
  }

  async init() {
    this._applyRoleUi();
    this._init3dViewport();
    await this._loadCatalog();

    // Initialize default clean bench/case state
    this.dataMgr.loadActivityConfig(null);
    this.asm.reset(this.dataMgr.getDefaultCase(), 'bench_first');
    this.interactionMgr.setReadOnly(this.readOnly);

    this._bindAssemblyUiSync();
    this._bindGlobalUiEvents();
    this._exposeIntegrationApi();
    this._syncMuteUi();
    this._syncPortsToggleUi();

    if (this.scenarioId) {
      await this._loadScenarioFromUrl(this.scenarioId);
    }
    if (this.galleryBuildId) {
      await this._loadGalleryBuild(this.galleryBuildId);
    }

    this.renderAllUi();

    if (new URLSearchParams(window.location.search).get('newScenario') === '1') {
      if (this.userRole === 'teacher' || this.userRole === 'instructor') {
        this.openScenarioModal();
      }
    }
  }

  _applyRoleUi() {
    const btnScenario = document.getElementById('btnScenario');
    const tabScenario = document.getElementById('tabScenario');
    const isInstructor = this.userRole === 'teacher' || this.userRole === 'instructor';
    if (btnScenario) btnScenario.style.display = isInstructor ? 'inline-flex' : 'none';
    if (tabScenario) tabScenario.style.display = isInstructor || this.scenarioId ? 'block' : 'none';
  }

  _init3dViewport() {
    const mount = document.getElementById('sim3dViewport');
    this.sceneMgr = new SceneManager(mount);
    this.compMgr = new ComponentManager(this.sceneMgr, this.asm);
    this.interactionMgr = new InteractionManager(this.sceneMgr, this.compMgr, this.asm, {
      onSelectChange: (slotKey) => {
        this._renderSelectedActionBar();
        this._renderBuildRows();
        void slotKey;
      },
      onHoverChange: (slotKey, fastenerSlot) => {
        this._updateHoverHint(slotKey, fastenerSlot);
      },
      onHoverPort: (portHit) => {
        this._updateHoverPortHint(portHit);
      },
      onCablePortClick: (portKey, label) => {
        this._handle3dCablePortClick(portKey, label);
      },
      onFastenerClick: (slotKey) => {
        this._handle3dFastenerClick(slotKey);
      },
      onCancelCableMode: () => {
        this._cancelPendingCablePort();
      },
      onDragStatus: (slotKey, evalRes) => {
        this._updateDragStatusPill(slotKey, evalRes);
      },
      onFeedback: (msg, type) => {
        if (
          msg.startsWith('Aligned at') ||
          msg.toLowerCase().includes('orient') ||
          msg.toLowerCase().includes('rotated') ||
          msg.toLowerCase().includes('clearance')
        ) {
          this.sfx.playSnap(type === 'ok');
        }
        this.showToast(msg, type);
      },
    });

    // Spin fans on-demand only when system is powered on
    this.sceneMgr.onBeforeRender = (dt) => {
      if (this.asm.isPowered) {
        return this.compMgr.spinFans(dt);
      }
      return false;
    };
  }

  async _loadCatalog() {
    try {
      const resp = await fetch(`/api/components?cache=${Date.now()}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const grouped = await resp.json();
      this.dataMgr.hydrateCatalogFromApi(grouped);
    } catch (err) {
      console.error('Failed to load components from API:', err);
      this.dataMgr.hydrateCatalogFromApi({});
      this.showToast('Loaded fallback chassis/coolers; catalog fetch failed.', 'warn');
    }
  }

  _bindAssemblyUiSync() {
    this.asm.subscribe(() => {
      this._renderSelectedActionBar();
      this._renderComponentSidebar();
      this._renderCableList();
      this._renderBuildRows();
      this._renderInstallGuide();
      this._syncPanelToggleBtn();
      this._syncPowerButtonUi();
      this._updateHoverHint(this.asm.selectedSlot);
    });
  }

  _bindGlobalUiEvents() {
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('componentPopover');
      if (
        pop?.classList.contains('open') &&
        !pop.contains(e.target) &&
        !e.target.closest('.comp-specs-btn,#btnActionSpecs')
      ) {
        this.hideComponentDetails();
      }
    });

    // Delegate modal backdrop clicks
    ['clearConfirmOverlay', 'scenarioOverlay', 'submitOverlay'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) el.classList.remove('open');
        });
      }
    });

    const inspEl = document.getElementById('inspectorOverlay');
    if (inspEl) {
      inspEl.addEventListener('click', (e) => {
        if (e.target === inspEl) this.closeInspector3D();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('inspectorOverlay')?.classList.contains('open')) {
        this.closeInspector3D();
      }
    });
  }

  // ------------------------------------------------------------------
  // SIDEBAR: COMPONENTS / CABLES / BUILDS
  // ------------------------------------------------------------------
  switchSTab(tab, btnEl) {
    this.currentSTab = tab;
    document.querySelectorAll('.stab').forEach((b) => b.classList.remove('active'));
    const activeBtn = btnEl || document.getElementById(`stab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');

    document.getElementById('spanel-comp').style.display = tab === 'comp' ? 'flex' : 'none';
    document.getElementById('spanel-cable').style.display = tab === 'cable' ? 'flex' : 'none';
    document.getElementById('spanel-builds').style.display = tab === 'builds' ? 'flex' : 'none';

    if (tab === 'builds') {
      this.refreshBuildsList();
    }
  }

  filterCat(cat, btnEl) {
    this.currentCat = cat;
    document.querySelectorAll('#catTabs .cat-tab').forEach((b) => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    this._renderComponentSidebar();
  }

  onCompSearchChange(val) {
    this.compSearchQuery = String(val || '').trim().toLowerCase();
    const clrBtn = document.getElementById('clearCompSearch');
    if (clrBtn) clrBtn.style.display = this.compSearchQuery ? 'inline-flex' : 'none';
    this._renderComponentSidebar();
  }

  clearComponentSearch() {
    const inp = document.getElementById('compSearch');
    if (inp) inp.value = '';
    this.onCompSearchChange('');
  }

  _renderComponentSidebar() {
    const listEl = document.getElementById('sidebarList');
    if (!listEl) return;

    if (this.readOnly) {
      listEl.innerHTML = `<div style="padding:12px;font-size:11px;color:var(--muted);line-height:1.5;">
        <strong>Read-Only Inspection</strong><br/>
        Component library editing is locked while inspecting a Gallery build. Click any 3D part in the case or open the Builds tab to review full specs.
      </div>`;
      return;
    }

    let items = this.dataMgr.getCatalog(this.currentCat);
    if (this.compSearchQuery) {
      items = items.filter((c) => {
        const hay = `${c.name} ${c.brand} ${c.model || ''} ${c.sub || ''} ${c.socket || ''} ${c.cat}`.toLowerCase();
        return hay.includes(this.compSearchQuery);
      });
    }

    if (!items.length) {
      listEl.innerHTML = `<div style="text-align:center;color:var(--faint);font-size:11px;padding:24px 10px;">No matching components.</div>`;
      return;
    }

    listEl.innerHTML = items.map((comp) => {
      const badge = CAT_BADGE_MAP[comp.cat] || { cls: 'cat-mb', abbr: 'HW' };
      const slotEntry = this.asm.slots[comp.cat];
      const isActive = slotEntry && String(slotEntry.component?.id) === String(comp.id);
      const stateTag = isActive
        ? (slotEntry.status === COMPONENT_STATE.STAGED ? 'Staged' : 'Mounted')
        : '';

      return `
        <div class="comp-item ${isActive ? 'active-part' : ''}" data-cat="${escapeHtml(comp.cat)}" data-id="${escapeHtml(comp.id)}">
          <div class="comp-icon ${badge.cls}" style="font-size:9px;font-weight:800;">${badge.abbr}</div>
          <div class="comp-info">
            <div class="comp-name" title="${escapeHtml(comp.name)}">${escapeHtml(comp.name)}</div>
            <div class="comp-sub">${escapeHtml(comp.sub || comp.brand || SLOT_DISPLAY_NAMES[comp.cat])}</div>
          </div>
          ${stateTag ? `<span class="comp-pill">${stateTag}</span>` : ''}
          <button type="button" class="comp-inspect-btn" title="Inspect 3D Model" data-cat="${escapeHtml(comp.cat)}" data-id="${escapeHtml(comp.id)}">3D</button>
          <button type="button" class="comp-specs-btn" title="Inspect Specs" data-cat="${escapeHtml(comp.cat)}" data-id="${escapeHtml(comp.id)}">i</button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.comp-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.comp-specs-btn,.comp-inspect-btn')) return;
        const cat = row.dataset.cat;
        const id = row.dataset.id;
        this.stageCatalogComponent(cat, id);
      });
    });

    listEl.querySelectorAll('.comp-inspect-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const comp = this.dataMgr.findComponent(btn.dataset.cat, btn.dataset.id);
        if (comp) this.openInspector3D(comp);
      });
    });

    listEl.querySelectorAll('.comp-specs-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const comp = this.dataMgr.findComponent(btn.dataset.cat, btn.dataset.id);
        if (comp) this.showComponentDetails(comp, btn);
      });
    });
  }

  stageCatalogComponent(slotKey, compId) {
    if (this.readOnly) {
      this.showToast('Gallery view is read-only.', 'warn');
      return;
    }
    const comp = this.dataMgr.findComponent(slotKey, compId);
    if (!comp) return;

    const res = this.asm.stageComponent(slotKey, comp);
    if (!res.ok) {
      this.showToast(res.reason, 'warn');
      return;
    }

    this.interactionMgr.selectSlot(slotKey);
    if (slotKey === 'case') {
      this.sceneMgr.applyCameraPreset('default');
      this.showToast(`Switched PC Case to ${comp.name}`, 'ok');
    } else {
      const obj = this.compMgr.getObjectForSlot(slotKey);
      if (obj) this.sceneMgr.focusOnObject(obj);
      this.showToast(`${comp.name} placed on ESD Staging Tray. Drag into position or click Mount.`, 'ok');
    }
  }

  _renderCableList() {
    const listEl = document.getElementById('cableList');
    if (!listEl) return;

    listEl.innerHTML = CABLE_DEFINITIONS.map((def) => {
      const isConnected = Boolean(this.asm.cables[def.id]?.connected);
      return `
        <div class="cable-item ${isConnected ? 'connected' : ''}" data-cable-id="${escapeHtml(def.id)}">
          <div class="cable-swatch" style="background:${def.color};"></div>
          <div class="comp-info">
            <div class="comp-name">${escapeHtml(def.name)}</div>
            <div class="comp-sub">${escapeHtml(def.portLabel)} · ${escapeHtml(def.desc)}</div>
          </div>
          <button type="button" class="btn-sm ${isConnected ? 'btn-ghost' : 'btn-blue'}" style="padding:4px 8px;font-size:10px;" data-toggle-cable="${escapeHtml(def.id)}">
            ${isConnected ? 'Unplug' : 'Connect'}
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-toggle-cable]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.readOnly) {
          this.showToast('Gallery view is read-only.', 'warn');
          return;
        }
        const id = btn.dataset.toggleCable;
        if (this.asm.cables[id]?.connected) {
          this.asm.disconnectCable(id);
          this.sfx.playCable(false);
          this.showToast('Cable disconnected.', 'info');
        } else {
          const res = this.asm.connectCable(id);
          if (!res.ok) this.showToast(res.reason, 'warn');
          else {
            this.sfx.playCable(true);
            this.sceneMgr.applyCameraPreset('interior');
            this.showToast(`Connected ${res.def.name} -> ${res.def.portLabel}`, 'ok');
          }
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // VIEWPORT TOOLBAR, CAMERA & SELECTED COMPONENT ACTION BAR
  // ------------------------------------------------------------------
  setCameraPreset(presetKey) {
    this.sceneMgr.applyCameraPreset(presetKey);
    document.querySelectorAll('#camPresetBar .cam-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.cam === presetKey);
    });
  }

  toggleSidePanel() {
    if (this.readOnly && !this.asm.sidePanelOpen) {
      // Allow opening/closing tempered glass in read-only inspection so user can see inside!
    }
    this.asm.setSidePanelOpen(!this.asm.sidePanelOpen);
    this.showToast(
      this.asm.sidePanelOpen
        ? 'Side panel removed — interior accessible.'
        : 'Tempered glass side panel closed.',
      'info'
    );
  }

  _syncPanelToggleBtn() {
    const btn = document.getElementById('togglePanelBtn');
    if (!btn) return;
    btn.textContent = this.asm.sidePanelOpen ? 'Side Panel: Open' : 'Side Panel: Closed';
    btn.classList.toggle('active', this.asm.sidePanelOpen);
  }

  setSequencePreset(sequenceId) {
    this.asm.setSequencePreset(sequenceId);
    this._renderInstallGuide();
    this.showToast(`Guide sequence: ${SEQUENCE_PRESETS[sequenceId]?.name || sequenceId}`, 'info');
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.isMuted());
    this._syncMuteUi();
    if (!this.sfx.isMuted()) {
      this.sfx.playLatch();
    }
    this.showToast(this.sfx.isMuted() ? 'Audio SFX muted.' : 'Audio SFX enabled.', 'info');
  }

  _syncMuteUi() {
    const btn = document.getElementById('btnSfxToggle');
    if (!btn) return;
    const muted = this.sfx.isMuted();
    btn.textContent = muted ? 'SFX: Off' : 'SFX: On';
    btn.classList.toggle('active', !muted);
  }

  toggleCablePorts() {
    const next = !this.compMgr.showCablePorts;
    this.compMgr.setShowCablePorts(next);
    if (!next) this._cancelPendingCablePort();
    this._syncPortsToggleUi();
    this.showToast(next ? '3D cable ports visible inside open case.' : '3D cable port markers hidden.', 'info');
  }

  _syncPortsToggleUi() {
    const btn = document.getElementById('btnTogglePorts');
    if (!btn || !this.compMgr) return;
    btn.textContent = this.compMgr.showCablePorts ? 'Ports: On' : 'Ports: Off';
    btn.classList.toggle('active', this.compMgr.showCablePorts);
  }

  _updateHoverPortHint(portHit) {
    if (this.interactionMgr?.dragState || !portHit) return;
    const pill = document.getElementById('liveStatusPill');
    if (!pill) return;
    if (this.pendingCablePort) {
      pill.textContent = `Connect ${this.pendingCablePort} -> Click ${portHit.label} (${portHit.portKey}) or Esc to cancel`;
      pill.className = 'sim-status-pill pill-ok';
    } else {
      pill.textContent = `3D Port: ${portHit.label} (${portHit.portKey}) — click to start routing cable`;
      pill.className = 'sim-status-pill pill-ok';
    }
  }

  _updateHoverHint(slotKey, fastenerSlot = null) {
    if (this.interactionMgr?.dragState) return;
    const pill = document.getElementById('liveStatusPill');
    if (!pill) return;
    if (this.pendingCablePort) {
      pill.textContent = `Routing from port [${this.pendingCablePort}] — click highlighted amber target port in 3D or Esc`;
      pill.className = 'sim-status-pill pill-warn';
      return;
    }
    if (fastenerSlot) {
      const secured = Boolean(this.asm.slots[fastenerSlot]?.secured);
      pill.textContent = `${SLOT_DISPLAY_NAMES[fastenerSlot]} Fastener — click to ${secured ? 'unlatch' : 'lock latch'}`;
      pill.className = 'sim-status-pill pill-ok';
      return;
    }
    if (!slotKey) {
      pill.textContent = this.asm.sidePanelOpen
        ? 'Drag parts · Click CPU/RAM latches or cyan 3D ports to wire · R: Rotate · F: Focus'
        : 'Open Side Panel to access case interior, or stage Motherboard on ESD Prep Pad';
      pill.className = 'sim-status-pill';
      return;
    }
    const entry = this.asm.slots[slotKey];
    const name = entry?.component?.name || SLOT_DISPLAY_NAMES[slotKey] || slotKey;
    pill.textContent = slotKey === 'case'
      ? `Chassis: ${name} (${this.asm.sidePanelOpen ? 'Panel Open' : 'Panel Closed'})`
      : `${SLOT_DISPLAY_NAMES[slotKey]}: ${name}`;
    pill.className = 'sim-status-pill';
  }

  _updateDragStatusPill(slotKey, evalRes) {
    const pill = document.getElementById('liveStatusPill');
    if (!pill) return;
    if (!evalRes) {
      this._updateHoverHint(slotKey);
      return;
    }
    if (evalRes.status === 'aligned') {
      pill.textContent = `Aligned -> Release to place at ${evalRes.target?.label}`;
      pill.className = 'sim-status-pill pill-ok';
    } else if (evalRes.status === 'misaligned') {
      pill.textContent = evalRes.reason;
      pill.className = 'sim-status-pill pill-warn';
    } else if (evalRes.status === 'blocked') {
      pill.textContent = evalRes.reason;
      pill.className = 'sim-status-pill pill-err';
    } else if (evalRes.status === 'no_anchor') {
      pill.textContent = evalRes.reason;
      pill.className = 'sim-status-pill pill-warn';
    } else {
      pill.textContent = `Dragging ${SLOT_DISPLAY_NAMES[slotKey] || slotKey} — move near target mount or press R to rotate`;
      pill.className = 'sim-status-pill';
    }
  }

  _renderSelectedActionBar() {
    const bar = document.getElementById('selectedActionBar');
    if (!bar) return;

    const slotKey = this.asm.selectedSlot;
    const entry = slotKey ? this.asm.slots[slotKey] : null;
    if (!entry) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      return;
    }

    bar.classList.add('visible');
    const comp = entry.component;
    const label = SLOT_DISPLAY_NAMES[slotKey] || slotKey;

    let statusBadge = 'Staged on Tray';
    let badgeCls = 'ab-badge-muted';
    if (entry.status === COMPONENT_STATE.INSTALLED_CORRECT) {
      statusBadge = 'Installed & Secured';
      badgeCls = 'ab-badge-ok';
    } else if (entry.status === COMPONENT_STATE.INSTALLED_INCORRECT) {
      statusBadge = 'Misaligned Orientation';
      badgeCls = 'ab-badge-warn';
    } else if (entry.status === COMPONENT_STATE.PLACED) {
      statusBadge = 'Placed (Needs Latch / Screws)';
      badgeCls = 'ab-badge-blue';
    }

    const buttons = [];

    if (!this.readOnly && slotKey !== 'case') {
      if (slotKey === 'mb') {
        if (entry.mountLocation !== 'bench' && !entry.secured) {
          buttons.push(`<button class="ab-btn ab-primary" data-act="mount_bench">Place on Bench Pad</button>`);
        }
        if (entry.mountLocation !== 'case' && !entry.secured) {
          buttons.push(`<button class="ab-btn ab-primary" data-act="mount_case">Mount into Case</button>`);
        }
      } else if (entry.status === COMPONENT_STATE.STAGED) {
        buttons.push(`<button class="ab-btn ab-primary" data-act="mount_auto">Snap to Mount</button>`);
      }

      if (!entry.secured) {
        buttons.push(`<button class="ab-btn" data-act="rotate">Rotate 90° (R)</button>`);
      }

      if (slotKey === 'cpu' && entry.status !== COMPONENT_STATE.STAGED && !this.asm.thermalPasteApplied) {
        buttons.push(`<button class="ab-btn ab-accent" data-act="paste">Apply Thermal Paste</button>`);
      }

      const canSecureNow =
        entry.status !== COMPONENT_STATE.STAGED &&
        !entry.secured &&
        !(slotKey === 'mb' && entry.mountLocation === 'bench');

      if (canSecureNow) {
        buttons.push(`<button class="ab-btn ab-green" data-act="secure">Secure Latch / Screws</button>`);
      } else if (entry.secured) {
        buttons.push(`<button class="ab-btn" data-act="unsecure">Unfasten Screws</button>`);
      }

      buttons.push(`<button class="ab-btn ab-danger" data-act="remove">Remove (Del)</button>`);
    }

    if (slotKey === 'case') {
      buttons.push(`<button class="ab-btn ab-primary" data-act="toggle_panel">${this.asm.sidePanelOpen ? 'Close Side Panel' : 'Remove Side Panel'}</button>`);
    }

    buttons.push(`<button class="ab-btn" data-act="focus">Focus (F)</button>`);
    buttons.push(`<button class="ab-btn" id="btnActionInspect3d" data-act="inspect3d">Inspect 3D</button>`);
    buttons.push(`<button class="ab-btn" id="btnActionSpecs" data-act="specs">Specs</button>`);

    bar.innerHTML = `
      <div class="ab-head">
        <div>
          <span class="ab-slot">${escapeHtml(label)}</span>
          <span class="ab-title">${escapeHtml(comp?.name || label)}</span>
        </div>
        <span class="ab-badge ${badgeCls}">${statusBadge}</span>
      </div>
      ${entry.misalignedReason ? `<div class="ab-hint">${escapeHtml(entry.misalignedReason)}</div>` : ''}
      ${slotKey === 'cpu' && entry.status !== COMPONENT_STATE.STAGED && !this.asm.thermalPasteApplied ? '<div class="ab-hint ab-hint-info">Tip: Apply thermal paste before mounting the CPU Cooler.</div>' : ''}
      <div class="ab-actions">${buttons.join('')}</div>
    `;

    bar.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleActionBarClick(slotKey, btn.dataset.act, btn);
      });
    });
  }

  _handleActionBarClick(slotKey, act, btnEl) {
    if (act === 'focus') {
      const obj = this.compMgr.getObjectForSlot(slotKey);
      if (obj) this.sceneMgr.focusOnObject(obj);
      return;
    }
    if (act === 'inspect3d') {
      const comp = this.asm.slots[slotKey]?.component;
      if (comp) this.openInspector3D(comp);
      return;
    }
    if (act === 'specs') {
      const comp = this.asm.slots[slotKey]?.component;
      if (comp) this.showComponentDetails(comp, btnEl);
      return;
    }
    if (act === 'toggle_panel') {
      this.toggleSidePanel();
      return;
    }
    if (this.readOnly) return;

    if (act === 'mount_bench' || act === 'mount_case' || act === 'mount_auto') {
      const pref = act === 'mount_bench' ? 'bench' : act === 'mount_case' ? 'case' : null;
      const res = this.asm.snapToNearestValidAnchor(slotKey, pref);
      if (!res.ok) {
        this.showToast(res.reason, 'warn');
      } else {
        this.sfx.playSnap(res.aligned);
        const obj = this.compMgr.getObjectForSlot(slotKey);
        if (obj) this.sceneMgr.focusOnObject(obj);
        this.showToast(
          res.aligned
            ? `Positioned at ${res.target?.label || 'mount point'}.`
            : res.reason,
          res.aligned ? 'ok' : 'warn'
        );
      }
      return;
    }

    if (act === 'rotate') {
      const res = this.asm.rotateComponent(slotKey, 1);
      if (!res.ok) this.showToast(res.reason, 'warn');
      else this.showToast(`Rotated ${SLOT_DISPLAY_NAMES[slotKey]} (${res.rotationStep * 90}°)`, 'info');
      return;
    }

    if (act === 'paste') {
      const res = this.asm.applyThermalPaste(true);
      if (!res.ok) this.showToast(res.reason, 'warn');
      else {
        this.sfx.playLatch();
        this.showToast('Pea-sized thermal paste dot applied to CPU IHS.', 'ok');
      }
      return;
    }

    if (act === 'secure') {
      const res = this.asm.secureComponent(slotKey);
      if (!res.ok) this.showToast(res.reason, 'warn');
      else {
        this.sfx.playLatch();
        this.showToast(`${SLOT_DISPLAY_NAMES[slotKey]} secured.`, 'ok');
      }
      return;
    }

    if (act === 'unsecure') {
      const res = this.asm.unsecureComponent(slotKey);
      if (!res.ok) this.showToast(res.reason, 'warn');
      else {
        this.sfx.playLatch();
        this.showToast(`${SLOT_DISPLAY_NAMES[slotKey]} unfastened for adjustment.`, 'info');
      }
      return;
    }

    if (act === 'remove') {
      const res = this.asm.removeComponent(slotKey);
      if (!res.ok) this.showToast(res.reason, 'warn');
      else {
        this.interactionMgr.selectSlot(null);
        this.showToast(`${SLOT_DISPLAY_NAMES[slotKey]} removed.`, 'info');
      }
    }
  }

  // ------------------------------------------------------------------
  // RIGHT PANEL (NO CONTINUOUS COMPATIBILITY CHECKER)
  // ------------------------------------------------------------------
  switchRTab(tab, btnEl) {
    this.currentRTab = tab;
    document.querySelectorAll('.rpanel-tab').forEach((b) => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    document.getElementById('rtab-build').style.display = tab === 'build' ? 'block' : 'none';
    document.getElementById('rtab-guide').style.display = tab === 'guide' ? 'block' : 'none';
    document.getElementById('rtab-scenario').style.display = tab === 'scenario' ? 'block' : 'none';
  }

  _renderBuildRows() {
    const container = document.getElementById('buildRows');
    const cableContainer = document.getElementById('cableStatus');
    if (container) {
      container.innerHTML = HARDWARE_SLOTS.map((slot) => {
        const entry = this.asm.slots[slot];
        const label = SLOT_DISPLAY_NAMES[slot];
        let valText = 'Empty';
        let valClass = 'empty';
        if (entry?.component) {
          valText = entry.component.name;
          if (entry.status === COMPONENT_STATE.STAGED) valClass = '';
          else if (entry.secured && entry.aligned) valClass = 'ok';
          else valClass = '';
        }
        const stateShort = !entry
          ? 'Empty'
          : entry.status === COMPONENT_STATE.STAGED
            ? 'Staged'
            : entry.secured
              ? 'Secured'
              : 'Placed';
        const isSel = this.asm.selectedSlot === slot;
        return `
          <div class="build-row ${isSel ? 'selected-row' : ''}" data-select-slot="${escapeHtml(slot)}" style="cursor:pointer;">
            <div style="min-width:0;flex:1;">
              <div class="build-row-label">${escapeHtml(label)} · <span style="color:var(--faint);">${stateShort}</span></div>
              <div class="build-row-val ${valClass}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(valText)}</div>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-select-slot]').forEach((row) => {
        row.addEventListener('click', () => {
          const s = row.dataset.selectSlot;
          if (!this.asm.slots[s]) return;
          this.interactionMgr.selectSlot(s);
          const obj = this.compMgr.getObjectForSlot(s);
          if (obj) this.sceneMgr.focusOnObject(obj);
        });
      });
    }

    if (cableContainer) {
      cableContainer.innerHTML = CABLE_DEFINITIONS.map((def) => {
        const connected = Boolean(this.asm.cables[def.id]?.connected);
        return `
          <div class="build-row">
            <span class="build-row-label">${escapeHtml(def.portLabel)}</span>
            <span class="build-row-val ${connected ? 'ok' : 'empty'}">${connected ? 'Connected' : 'Unplugged'}</span>
          </div>
        `;
      }).join('');
    }
  }

  _renderInstallGuide() {
    const guideEl = document.getElementById('installGuide');
    const objEl = document.getElementById('objectivesList');
    const preset = SEQUENCE_PRESETS[this.asm.sequenceId] || SEQUENCE_PRESETS.bench_first;

    if (guideEl) {
      const doneStep = (id) => {
        const s = this.asm.slots;
        const placed = (k) => s[k] && s[k].status !== COMPONENT_STATE.STAGED;
        if (id === 'prep_case') return this.asm.sidePanelOpen;
        if (id === 'mb_bench') return this.asm.mbMountLocation === 'bench' || this.asm.mbMountLocation === 'case';
        if (id === 'mb_case') return this.asm.mbMountLocation === 'case';
        if (id === 'cpu') return placed('cpu');
        if (id === 'cooler') return placed('cooler') && this.asm.thermalPasteApplied;
        if (id === 'ram') return placed('ram');
        if (id === 'psu') return placed('psu');
        if (id === 'storage') return placed('storage');
        if (id === 'gpu') return placed('gpu');
        if (id === 'case_fan') return placed('case_fan');
        if (id === 'cables') return ['c_24pin', 'c_8pin_cpu', 'c_cpu_fan', 'c_front_panel'].every((c) => this.asm.cables[c]?.connected);
        if (id === 'core_hw') return ['mb', 'cpu', 'cooler', 'ram', 'storage', 'gpu', 'psu'].every(placed);
        if (id === 'inspect') return Boolean(this.lastValidation?.passed);
        return false;
      };

      guideEl.innerHTML = preset.steps.map((step) => {
        const isDone = doneStep(step.id);
        return `
          <div class="guide-step ${isDone ? 'done' : ''}">
            <div class="guide-step-title">${isDone ? '[Done] ' : ''}${escapeHtml(step.label)}</div>
            <div class="guide-step-desc">${escapeHtml(STEP_EXPLANATIONS[step.id] || '')}</div>
          </div>
        `;
      }).join('');
    }

    if (objEl) {
      const objs = this.dataMgr.activity?.objectives || [];
      objEl.innerHTML = objs.map((o) => `
        <div class="guide-step">
          <div class="guide-step-title" style="font-weight:600;">• ${escapeHtml(o.text)}</div>
        </div>
      `).join('');
    }
  }

  // ------------------------------------------------------------------
  // 3D vs MONITOR VIEW + POWER ON POST CHECK
  // ------------------------------------------------------------------
  switchView(view) {
    this.currentView = view;
    const btn3d = document.getElementById('btnFront');
    const btnMon = document.getElementById('btnMonitor');
    const monWrap = document.getElementById('monitorOverlayView');
    const stage3d = document.getElementById('sim3dStage');

    if (btn3d) btn3d.classList.toggle('active', view === '3d');
    if (btnMon) btnMon.classList.toggle('active', view === 'monitor');

    if (view === 'monitor') {
      if (stage3d) stage3d.style.display = 'none';
      if (monWrap) monWrap.style.display = 'flex';
      this._renderMonitorScreen();
    } else {
      if (monWrap) monWrap.style.display = 'none';
      if (stage3d) stage3d.style.display = 'flex';
      this.sceneMgr?.requestRender(150);
    }
  }

  togglePower() {
    this.asm.isPowered = !this.asm.isPowered;
    this._syncPowerButtonUi();

    if (this.asm.isPowered) {
      this.sceneMgr.requestRender(1200);
      const report = this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity);
      const hasCriticalPowerOrBootFault =
        report.missingComponents.some((m) => ['mb', 'cpu', 'ram', 'psu', 'storage', 'gpu', 'cooler'].includes(m.slot)) ||
        report.incorrectlyInstalled.some((i) => i.severity !== 'warning') ||
        report.compatibilityIssues.some((c) => c.severity === 'critical') ||
        report.connectionIssues.length > 0;

      this.sfx.playPostBeep(!hasCriticalPowerOrBootFault);
      if (hasCriticalPowerOrBootFault) {
        this.showToast('System attempted POST and halted — inspect Monitor for diagnostic codes.', 'warn');
      } else {
        this.showToast('Power ON — cooling fans spinning, POST passed!', 'ok');
      }
      if (this.currentView === 'monitor') {
        this._renderMonitorScreen();
      }
    } else {
      this.showToast('System powered OFF.', 'info');
      if (this.currentView === 'monitor') {
        this._renderMonitorScreen();
      }
    }
  }

  _syncPowerButtonUi() {
    const btn = document.getElementById('powerBtn');
    const lbl = document.getElementById('powerLabel');
    if (!btn || !lbl) return;
    btn.className = `power-btn ${this.asm.isPowered ? 'on' : 'off'}`;
    lbl.textContent = this.asm.isPowered ? 'ON' : 'OFF';
    lbl.style.color = this.asm.isPowered ? '#3ecf5e' : '#64748b';
  }

  _renderMonitorScreen() {
    const screen = document.getElementById('screenContent');
    if (!screen) return;

    if (!this.asm.isPowered) {
      screen.innerHTML = `
        <div style="background:#05080f;height:100%;display:flex;align-items:center;justify-content:center;color:#475569;font-family:'DM Mono',monospace;text-align:center;padding:24px;">
          <div>
            <div style="font-size:18px;font-weight:700;color:#64748b;margin-bottom:8px;">NO SIGNAL — STANDBY</div>
            <div style="font-size:12px;">Click the Power button in the top bar to test POST & boot.</div>
          </div>
        </div>
      `;
      return;
    }

    // Evaluate assembly when powered on (diagnostic POST behavior)
    const report = this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity);
    const faults = [
      ...report.missingComponents.map((m) => `MISSING: ${m.reason}`),
      ...report.incorrectlyInstalled.filter((i) => i.severity !== 'warning').map((i) => `INSTALL: ${i.name} — ${i.issues[0]}`),
      ...report.compatibilityIssues.filter((c) => c.severity === 'critical').map((c) => `COMPAT (${c.pair}): ${c.issue}`),
      ...report.connectionIssues.map((c) => `CABLE: ${c.issue}`),
    ];
    const advisories = [
      ...report.incorrectlyInstalled.filter((i) => i.severity === 'warning').map((i) => `${i.label}: ${i.issues[0]}`),
      ...report.compatibilityIssues.filter((c) => c.severity !== 'critical').map((c) => `${c.pair}: ${c.issue}`),
    ];

    if (faults.length > 0) {
      screen.innerHTML = `
        <div class="bios-screen" style="overflow-y:auto;">
          <div class="bios-top">AMERICAN MEGATRENDS / LNU UEFI POST DIAGNOSTICS</div>
          <div style="color:#f87171;font-weight:700;margin-bottom:8px;">POST HALTED — ${faults.length} HARDWARE / CONNECTION ISSUE(S) DETECTED</div>
          <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px;">
            ${faults.map((f) => `<div style="color:#fef08a;">• ${escapeHtml(f)}</div>`).join('')}
          </div>
          <div style="color:#94a3b8;">Fix the highlighted hardware, orientation, or cables in 3D view and power cycle.</div>
        </div>
      `;
      return;
    }

    const s = this.asm.slots;
    screen.innerHTML = `
      <div class="bios-screen" style="background:#0a1930;color:#e2e8f0;padding:18px;overflow-y:auto;">
        <div class="bios-top" style="background:#3ecf5e;color:#052e16;">UEFI BIOS POST SUCCESSFUL — ALL DEVICES INITIALIZED</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div style="background:rgba(255,255,255,.06);padding:10px;border-radius:6px;">
            <div style="color:#38bdf8;font-weight:700;margin-bottom:4px;">PROCESSOR</div>
            <div>${escapeHtml(s.cpu?.component?.name || 'CPU')}</div>
          </div>
          <div style="background:rgba(255,255,255,.06);padding:10px;border-radius:6px;">
            <div style="color:#38bdf8;font-weight:700;margin-bottom:4px;">MEMORY</div>
            <div>${escapeHtml(s.ram?.component?.name || 'RAM')}</div>
          </div>
          <div style="background:rgba(255,255,255,.06);padding:10px;border-radius:6px;">
            <div style="color:#38bdf8;font-weight:700;margin-bottom:4px;">GRAPHICS</div>
            <div>${escapeHtml(s.gpu?.component?.name || 'GPU')}</div>
          </div>
          <div style="background:rgba(255,255,255,.06);padding:10px;border-radius:6px;">
            <div style="color:#38bdf8;font-weight:700;margin-bottom:4px;">BOOT DRIVE</div>
            <div>${escapeHtml(s.storage?.component?.name || 'Storage')}</div>
          </div>
        </div>
        <div style="margin-top:14px;padding:10px;border-radius:6px;background:rgba(62,207,94,.15);color:#86efac;font-weight:600;">
          Estimated Load: ${report.estimatedLoadWatts}W · PSU Headroom: OK · Thermal Interface: Verified
        </div>
        ${advisories.length ? `
          <div style="margin-top:10px;padding:10px;border-radius:6px;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35);color:#fde68a;font-size:11px;">
            <div style="font-weight:700;margin-bottom:4px;">WORKSTATION ADVISORY (${advisories.length})</div>
            ${advisories.map((a) => `<div>• ${escapeHtml(a)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ------------------------------------------------------------------
  // POST-ASSEMBLY VALIDATION & SUBMISSION MODAL
  // ------------------------------------------------------------------
  openSubmitModal() {
    if (this.readOnly) {
      this.showToast('Gallery view is read-only.', 'warn');
      return;
    }

    const report = this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity);
    this.lastValidation = report;
    this._renderInstallGuide();

    const gradeColor = report.score >= 90 ? '#3ecf5e' : report.score >= 75 ? '#f59e0b' : '#ef4444';

    const renderSection = (title, items, emptyMsg, rowFormatter, cls) => `
      <div class="val-sec">
        <div class="val-sec-title">${title} <span>(${items.length})</span></div>
        ${items.length ? items.map(rowFormatter).join('') : `<div class="val-empty ${cls}">${emptyMsg}</div>`}
      </div>
    `;

    document.getElementById('submitContent').innerHTML = `
      <div class="modal-title">Post-Assembly Validation Report</div>
      <div class="modal-sub">${escapeHtml(this.dataMgr.activity?.title || 'PC Assembly Assessment')}</div>

      <div class="grade-box">
        <div class="grade-summary">
          <div>
            <div class="grade-pct" style="color:${gradeColor}">${report.score}%</div>
            <div class="grade-label">${escapeHtml(report.gradeLabel)}</div>
          </div>
          <div style="text-align:right;font-size:11px;color:#cbd5e1;">
            <div>Completion: <strong>${report.completionPercent}%</strong></div>
            <div>Est. Load: <strong>${report.estimatedLoadWatts}W</strong></div>
          </div>
        </div>
        <div class="grade-progress">
          <div class="grade-progress-fill" style="width:${report.score}%;background:${gradeColor};"></div>
        </div>
        <div class="grade-breakdown">${escapeHtml(report.summary)}</div>
      </div>

      <div style="max-height:310px;overflow-y:auto;padding-right:4px;">
        ${renderSection(
          'A. Installation & Placement Issues',
          [
            ...report.missingComponents.map((m) => ({ title: `${m.label} (Missing)`, detail: m.reason })),
            ...report.incorrectlyInstalled.map((i) => ({ title: `${i.label}: ${i.name}`, detail: i.issues.join(' ') })),
          ],
          'All placed components are aligned, properly located, and secured.',
          (x) => `<div class="val-row val-err"><strong>${escapeHtml(x.title)}</strong><div>${escapeHtml(x.detail)}</div></div>`,
          'ok'
        )}

        ${renderSection(
          'B. Hardware Compatibility Findings',
          report.compatibilityIssues,
          'All installed components are electrically and physically compatible.',
          (c) => `<div class="val-row ${c.severity === 'critical' ? 'val-err' : 'val-warn'}"><strong>${escapeHtml(c.pair)}</strong><div>${escapeHtml(c.issue)}</div></div>`,
          'ok'
        )}

        ${renderSection(
          'C. Cable & Power Connections',
          report.connectionIssues,
          'All required ATX, EPS, fan, GPU, storage & front-panel cables connected.',
          (c) => `<div class="val-row val-err"><strong>${escapeHtml(c.label)} (${escapeHtml(c.port)})</strong><div>${escapeHtml(c.issue)}</div></div>`,
          'ok'
        )}

        ${renderSection(
          'Verified Components',
          report.correctlyInstalled,
          'No components finalized yet.',
          (c) => `<div class="val-row val-ok"><strong>${escapeHtml(c.label)}: ${escapeHtml(c.name)}</strong><div>${escapeHtml(c.notes)}</div></div>`,
          'muted'
        )}
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn-sm btn-green" id="btnSubmitSaveBuild" style="flex:1;justify-content:center;padding:10px;">
          ${this.scenarioId ? 'Save & Submit Activity' : 'Save Build to Gallery'}
        </button>
        <button class="btn-sm btn-ghost" id="btnSubmitClose" style="padding:10px 16px;">Close</button>
      </div>
    `;

    document.getElementById('btnSubmitSaveBuild').addEventListener('click', () => this._submitAndPersist(report));
    document.getElementById('btnSubmitClose').addEventListener('click', () => this.closeSubmitModal());
    document.getElementById('submitOverlay').classList.add('open');
  }

  closeSubmitModal() {
    document.getElementById('submitOverlay')?.classList.remove('open');
  }

  async _submitAndPersist(report) {
    const btn = document.getElementById('btnSubmitSaveBuild');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }
    const buildId = await this.saveCurrentBuild(report);
    if (buildId && this.scenarioId) {
      try {
        await fetch(`/api/scenarios/${encodeURIComponent(this.scenarioId)}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            score: report.score,
            assessment: this.dataMgr.exportAssessmentResult(report, this.asm.getState()),
          }),
        });
      } catch (err) {
        console.warn('Scenario completion save failed:', err);
      }
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = this.scenarioId ? 'Save & Submit Activity' : 'Save Build to Gallery';
    }
    if (buildId) {
      this.closeSubmitModal();
    }
  }

  // ------------------------------------------------------------------
  // BUILD DATABASE SAVE / LOAD / GALLERY READ-ONLY
  // ------------------------------------------------------------------
  async saveCurrentBuild(reportOverride = null) {
    if (this.readOnly) {
      this.showToast('Gallery view is read-only.', 'warn');
      return null;
    }
    if (this.saveInFlight) return null;

    const filled = HARDWARE_SLOTS.filter((k) => k !== 'case' && this.asm.slots[k]?.component).length;
    if (filled === 0) {
      this.showToast('Stage or install at least one component before saving.', 'warn');
      return null;
    }

    const report = reportOverride || this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity);
    const payload = this.dataMgr.exportBuildPayload(this.asm.getState(), report);

    this.saveInFlight = true;
    try {
      const resp = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        window.location.href = '/?login_required=simulator';
        return null;
      }
      if (!resp.ok) {
        throw new Error(data?.detail?.error || data?.error || `HTTP ${resp.status}`);
      }
      this.showToast(`Build saved (${report.score}% validation score).`, 'ok');
      this.refreshBuildsList();
      return data.id;
    } catch (err) {
      this.showToast(err.message || 'Failed to save build.', 'err');
      return null;
    } finally {
      this.saveInFlight = false;
    }
  }

  async refreshBuildsList() {
    const listEl = document.getElementById('buildsList');
    if (!listEl) return;

    if (this.readOnly) {
      listEl.innerHTML = `<div style="padding:10px;font-size:11px;color:var(--muted);">Inspecting Gallery Build #${escapeHtml(this.galleryBuildId)}.</div>`;
      return;
    }

    listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:16px;">Loading saved builds...</div>';
    try {
      const resp = await fetch('/api/builds?scope=mine', { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const builds = await resp.json();
      if (!builds.length) {
        listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:16px;">No saved builds yet.</div>';
        return;
      }
      listEl.innerHTML = builds.map((b) => `
        <div style="padding:10px;border:1px solid var(--border);border-radius:8px;background:#fff;margin-bottom:6px;">
          <div style="font-weight:700;font-size:12px;color:var(--slate);">${escapeHtml(b.name || 'Untitled Build')}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;">${escapeHtml(b.description || '')}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button type="button" class="btn-sm btn-green" style="flex:1;padding:5px;" data-load-build="${escapeHtml(b.id)}">Load 3D</button>
            <button type="button" class="btn-sm btn-ghost" style="padding:5px 9px;" data-del-build="${escapeHtml(b.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-load-build]').forEach((btn) => {
        btn.addEventListener('click', () => this._fetchAndLoadBuild(btn.dataset.loadBuild));
      });
      listEl.querySelectorAll('[data-del-build]').forEach((btn) => {
        btn.addEventListener('click', () => this._deleteBuild(btn.dataset.delBuild));
      });
    } catch {
      listEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:16px;">Sign in to access saved builds.</div>';
    }
  }

  async _fetchAndLoadBuild(buildId) {
    try {
      const resp = await fetch(`/api/builds/${encodeURIComponent(buildId)}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buildData = await resp.json();
      this.loadBuildPayload(buildData);
      this.showToast(`Loaded "${buildData.name || 'Build'}" into 3D workstation.`, 'ok');
    } catch (err) {
      this.showToast(err.message || 'Could not load build.', 'err');
    }
  }

  async _deleteBuild(buildId) {
    try {
      const resp = await fetch(`/api/builds/${encodeURIComponent(buildId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.showToast('Build deleted.', 'ok');
      this.refreshBuildsList();
    } catch (err) {
      this.showToast(err.message || 'Delete failed.', 'err');
    }
  }

  async _loadGalleryBuild(buildId) {
    await this._fetchAndLoadBuild(buildId);
    // In read-only gallery showcase, keep glass panel open or clearly inspectable inside case
    this.asm.setSidePanelOpen(true);
    this.sceneMgr.applyCameraPreset('interior');
    const lbl = document.getElementById('scenarioLabel');
    if (lbl) lbl.textContent = 'Gallery 3D Inspection (Read-Only)';
  }

  loadBuildPayload(buildData) {
    const bd = buildData?.build_data || buildData || {};
    const comps = bd.components || buildData?.components || {};
    const savedSim = bd.sim3d || null;

    const caseComp = comps.case
      ? enrichComponentRecord(comps.case, 'case')
      : this.dataMgr.getDefaultCase();

    this.asm.reset(caseComp, 'bench_first');
    this.asm.setSidePanelOpen(true);

    // Install MB first in case
    if (comps.mb) {
      const mbRec = enrichComponentRecord(comps.mb, 'mb');
      this.asm.stageComponent('mb', mbRec);
      const targetLoc = savedSim?.mbMountLocation === 'bench' ? 'bench' : 'case';
      const mbRot = savedSim?.slots?.mb?.rotationStep ?? 0;
      this.asm.placeComponentAt('mb', targetLoc === 'bench' ? BENCH_PREP_ORIGIN : CASE_MB_ANCHOR, mbRot);
      if (!savedSim || savedSim?.slots?.mb?.secured !== false) {
        this.asm.secureComponent('mb');
      }
    }

    for (const slot of ['cpu', 'cooler', 'ram', 'storage', 'gpu', 'psu', 'case_fan']) {
      if (!comps[slot]) continue;
      const rec = enrichComponentRecord(comps[slot], slot);
      this.asm.stageComponent(slot, rec);

      const savedSlot = savedSim?.slots?.[slot];
      if (!savedSlot || savedSlot.status !== COMPONENT_STATE.STAGED) {
        if (savedSlot?.rotationStep) {
          this.asm.rotateComponent(slot, savedSlot.rotationStep);
        }
        this.asm.snapToNearestValidAnchor(slot);
        if (!savedSlot || savedSlot.secured !== false) {
          this.asm.secureComponent(slot);
        }
      }
    }

    const pasteState = savedSim ? Boolean(savedSim.thermalPasteApplied) : Boolean(comps.cooler);
    if (comps.cpu) {
      this.asm.thermalPasteApplied = pasteState;
      this.compMgr.syncPasteDot();
    }

    const cables = bd.connectedCables || buildData?.connectedCables || {};
    for (const [cid, val] of Object.entries(cables)) {
      if (val) this.asm.connectCable(cid);
    }

    if (savedSim && savedSim.sidePanelOpen === false && !this.readOnly) {
      this.asm.setSidePanelOpen(false);
    }

    this.renderAllUi();
  }

  // ------------------------------------------------------------------
  // CLEAR / SCENARIO / DETAILS / TOAST
  // ------------------------------------------------------------------
  openClearConfirm() {
    if (this.readOnly) {
      this.showToast('Gallery view is read-only.', 'warn');
      return;
    }
    document.getElementById('clearConfirmOverlay')?.classList.add('open');
  }

  closeClearConfirm() {
    document.getElementById('clearConfirmOverlay')?.classList.remove('open');
  }

  confirmClearBuild() {
    this.closeClearConfirm();
    this.lastValidation = null;
    this.activeFaultLabId = '';
    const labSel = document.getElementById('faultLabSelect');
    if (labSel) labSel.value = '';
    this._cancelPendingCablePort();
    this.dataMgr.loadActivityConfig(null);
    this.asm.reset(this.dataMgr.getDefaultCase(), this.asm.sequenceId);
    this.interactionMgr.selectSlot(null);
    this.sceneMgr.applyCameraPreset('default');
    this._syncScenarioUi();
    this.showToast('Workstation reset.', 'info');
  }

  // ------------------------------------------------------------------
  // PHASE 2: 3D FASTENER CLICK, 3D PORT CABLING, INSPECTOR & FAULT LABS
  // ------------------------------------------------------------------
  _handle3dFastenerClick(slotKey) {
    if (this.readOnly) return;
    const entry = this.asm.slots[slotKey];
    if (!entry || entry.status === COMPONENT_STATE.STAGED) return;

    const res = entry.secured
      ? this.asm.unsecureComponent(slotKey)
      : this.asm.secureComponent(slotKey);

    if (!res.ok) {
      this.showToast(res.reason, 'warn');
      return;
    }
    this.sfx.playLatch();
    this.showToast(
      entry.secured
        ? `${SLOT_DISPLAY_NAMES[slotKey]} latch/screws unfastened.`
        : `${SLOT_DISPLAY_NAMES[slotKey]} retention latch locked.`,
      entry.secured ? 'info' : 'ok'
    );
  }

  _cancelPendingCablePort() {
    this.pendingCablePort = null;
    this.compMgr?.setPendingCablePort(null);
    this._updateHoverHint(this.asm.selectedSlot);
  }

  _handle3dCablePortClick(portKey, label) {
    if (this.readOnly) return;
    if (!this.pendingCablePort) {
      this.pendingCablePort = portKey;
      this.compMgr.setPendingCablePort(portKey);
      this._updateHoverHint(this.asm.selectedSlot);
      this.showToast(`Selected ${label || portKey} — click highlighted amber partner port to connect/unplug.`, 'info');
      return;
    }
    if (this.pendingCablePort === portKey) {
      this._cancelPendingCablePort();
      this.showToast('Cable port selection cancelled.', 'info');
      return;
    }
    const res = this.connectCablePortPair(this.pendingCablePort, portKey);
    if (!res.ok) {
      this.sfx.playSnap(false);
      this.showToast(res.reason, 'warn');
    }
  }

  connectCablePortPair(portA, portB) {
    const def = CABLE_DEFINITIONS.find(
      (d) =>
        (d.fromPortKey === portA && d.toPortKey === portB) ||
        (d.fromPortKey === portB && d.toPortKey === portA)
    );
    if (!def) {
      return {
        ok: false,
        reason: `No cable routes directly between ${portA} and ${portB}. Click an amber-highlighted partner port.`,
      };
    }

    const isConn = Boolean(this.asm.cables[def.id]?.connected);
    if (isConn) {
      this.asm.disconnectCable(def.id);
      this.sfx.playCable(false);
      this._cancelPendingCablePort();
      this.showToast(`Disconnected ${def.name} (${def.portLabel}).`, 'info');
      return { ok: true, action: 'disconnected', cableId: def.id };
    }

    const res = this.asm.connectCable(def.id);
    if (!res.ok) {
      return res;
    }
    this.sfx.playCable(true);
    this._cancelPendingCablePort();
    this.showToast(`Connected ${def.name} -> ${def.portLabel}.`, 'ok');
    return { ok: true, action: 'connected', cableId: def.id };
  }

  _getInspectorOrientationTip(comp) {
    const tips = {
      cpu: 'Flip underside to inspect the gold contact pads / AM4 PGA pin array and yellow Pin-1 corner triangle that must align with the motherboard socket corner.',
      mb: 'Check the LGA/AM socket Pin-1 corner arrow, hinged stainless ILM retention lever, DIMM latch clips, and printed header labels (CPU_PWR1, ATX_24PIN, JFP1).',
      ram: 'Inspect the gold edge fingers and asymmetric DDR key notch spacing—never force DDR3/DDR4/DDR5 modules backwards into DIMM slots.',
      gpu: 'Check the bottom PCIe x16 gold edge connector, rear metallic expansion bracket screw flange, and top 8-pin PCIe auxiliary power header.',
      storage: 'Inspect M.2 2280 M-key gold notch & mounting standoff hole, or 2.5"/3.5" SATA L-keyed data and power connectors.',
      psu: 'Check the bottom 120mm intake fan grille (faces DOWN toward filtered bottom vent), rear AC rocker switch, and modular cable ports.',
      cooler: 'Inspect the copper coldplate contact base, heatpipes, and PWM fan housing airflow direction arrows.',
      case_fan: 'Check the plastic frame directional arrows showing blade rotation and exhaust airflow direction.',
      case: 'Inspect ATX/mATX brass standoff positions, bottom PSU shroud chamber, rear exhaust mesh, and removable tempered glass panel.',
    };
    return tips[comp?.cat] || 'Drag to orbit 360°, scroll to zoom, or use Flip Underside to check connectors and keying.';
  }

  openInspector3D(comp) {
    if (!comp) return;
    this.closeInspector3D();

    const overlay = document.getElementById('inspectorOverlay');
    const mount = document.getElementById('inspector3dViewport');
    const titleEl = document.getElementById('inspectorTitle');
    const metaEl = document.getElementById('inspectorMeta');
    const tipEl = document.getElementById('inspectorTips');
    if (!overlay || !mount) return;

    const dims = comp.dimensionsMm
      ? `${comp.dimensionsMm.w} × ${comp.dimensionsMm.h} × ${comp.dimensionsMm.d} mm`
      : 'Standard Form Factor';
    if (titleEl) titleEl.textContent = comp.name || '3D Hardware Inspector';
    if (metaEl) metaEl.textContent = `${comp.brand || 'Hardware'} · ${SLOT_DISPLAY_NAMES[comp.cat] || comp.cat} · ${dims}`;
    if (tipEl) tipEl.textContent = this._getInspectorOrientationTip(comp);

    overlay.classList.add('open');

    const w = Math.max(320, mount.clientWidth || 640);
    const h = Math.max(240, mount.clientHeight || 340);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081220);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xdbeafe, 1.35));
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 0.95));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    fillLight.position.set(-4, -3, -4);
    scene.add(fillLight);

    const modelPivot = new THREE.Group();
    const mesh = createComponentMesh(comp.cat, comp);
    // Re-center mesh bounding box cleanly at origin for turntable inspection
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    mesh.position.sub(center);
    modelPivot.add(mesh);
    scene.add(modelPivot);

    const radius = Math.max(0.28, sphere.radius);
    const baseDist = (radius / Math.sin(THREE.MathUtils.degToRad(21))) * 1.15;
    const defaultCamPos = new THREE.Vector3(baseDist * 0.72, baseDist * 0.48, baseDist * 0.85);
    camera.position.copy(defaultCamPos);
    controls.target.set(0, 0, 0);
    controls.minDistance = radius * 0.7;
    controls.maxDistance = radius * 6;
    controls.update();

    const grid = new THREE.GridHelper(radius * 3.6, 12, 0x334155, 0x1e293b);
    grid.position.y = -radius * 1.08;
    scene.add(grid);

    let active = true;
    let rafId = 0;
    const renderLoop = () => {
      if (!active) return;
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    this.inspectorCtx = {
      renderer,
      scene,
      camera,
      controls,
      modelPivot,
      defaultCamPos,
      stop: () => { active = false; cancelAnimationFrame(rafId); },
    };
  }

  rotateInspectorModel() {
    if (!this.inspectorCtx) return;
    this.inspectorCtx.modelPivot.rotation.y += Math.PI / 2;
  }

  flipInspectorModel() {
    if (!this.inspectorCtx) return;
    this.inspectorCtx.modelPivot.rotation.x += Math.PI;
  }

  resetInspectorView() {
    if (!this.inspectorCtx) return;
    this.inspectorCtx.modelPivot.rotation.set(0, 0, 0);
    this.inspectorCtx.camera.position.copy(this.inspectorCtx.defaultCamPos);
    this.inspectorCtx.controls.target.set(0, 0, 0);
    this.inspectorCtx.controls.update();
  }

  closeInspector3D() {
    document.getElementById('inspectorOverlay')?.classList.remove('open');
    const ctx = this.inspectorCtx;
    if (!ctx) return;
    this.inspectorCtx = null;
    ctx.stop();
    ctx.controls.dispose();
    ctx.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
    ctx.renderer.dispose();
    const mount = document.getElementById('inspector3dViewport');
    if (mount) mount.innerHTML = '';
  }

  onFaultLabChange(presetId) {
    if (!presetId) {
      this.confirmClearBuild();
      return;
    }
    this.loadTroubleshootingPreset(presetId);
  }

  loadTroubleshootingPreset(presetId) {
    if (this.readOnly) {
      this.showToast('Gallery view is read-only.', 'warn');
      return { ok: false, reason: 'Read-only mode' };
    }
    const preset = TROUBLESHOOTING_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      return { ok: false, reason: 'Preset not found' };
    }

    this.activeFaultLabId = preset.id;
    this.lastValidation = null;
    this._cancelPendingCablePort();

    this.asm.reset(this.dataMgr.getDefaultCase(), 'freeform');
    this.asm.setSidePanelOpen(true);

    const rotSteps = preset.faults?.rotationSteps || {};
    const unsecured = new Set(preset.faults?.unsecured || []);

    if (preset.parts.mb) {
      const mbComp = this.dataMgr.findComponent('mb', preset.parts.mb);
      if (mbComp) {
        this.asm.stageComponent('mb', mbComp);
        this.asm.placeComponentAt('mb', CASE_MB_ANCHOR, rotSteps.mb || 0);
        if (!unsecured.has('mb')) this.asm.secureComponent('mb');
      }
    }

    for (const slot of ['cpu', 'cooler', 'ram', 'storage', 'gpu', 'psu', 'case_fan']) {
      const name = preset.parts[slot];
      if (!name) continue;
      const comp = this.dataMgr.findComponent(slot, name);
      if (!comp) continue;
      this.asm.stageComponent(slot, comp);
      if (rotSteps[slot]) {
        this.asm.rotateComponent(slot, rotSteps[slot]);
      }
      this.asm.snapToNearestValidAnchor(slot);
      if (!unsecured.has(slot)) {
        this.asm.secureComponent(slot);
      }
    }

    if (this.asm.slots.cpu) {
      this.asm.thermalPasteApplied = Boolean(preset.faults?.thermalPasteApplied);
      this.compMgr.syncPasteDot();
    }

    for (const cid of preset.faults?.cables || []) {
      this.asm.connectCable(cid);
    }

    this.dataMgr.loadActivityConfig({
      id: preset.id,
      title: preset.title,
      description: preset.description,
      activityType: 'troubleshoot',
      objectives: preset.objectives,
    });

    const labSel = document.getElementById('faultLabSelect');
    if (labSel) labSel.value = preset.id;
    const seqSel = document.getElementById('sequencePresetSelect');
    if (seqSel) seqSel.value = 'freeform';

    this.sceneMgr.applyCameraPreset('interior');
    this.renderAllUi();
    this.showToast(`Loaded ${preset.title}. Run Monitor / POST to diagnose faults!`, 'warn');
    return { ok: true, preset };
  }

  async _loadScenarioFromUrl(id) {
    try {
      const resp = await fetch(`/api/scenarios/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail?.error || 'Scenario not found');
      this.dataMgr.loadActivityConfig(data);
      this._syncScenarioUi();
      this.showToast(`Loaded scenario: ${data.title}`, 'ok');
    } catch (err) {
      this.showToast(err.message || 'Could not load scenario.', 'err');
    }
  }

  _syncScenarioUi() {
    const act = this.dataMgr.activity;
    const lbl = document.getElementById('scenarioLabel');
    const sum = document.getElementById('scenarioSummary');
    if (lbl) lbl.textContent = act?.title || '3D Lab';
    if (sum) {
      sum.innerHTML = `
        <strong>${escapeHtml(act?.title || 'Free PC Assembly Lab')}</strong><br/>
        Type: ${escapeHtml(act?.activityType || 'build')} · Tier: ${escapeHtml(act?.tier || 'Any')}<br/>
        <span style="color:var(--muted);">${escapeHtml(act?.description || '')}</span>
      `;
    }
    this._renderInstallGuide();
  }

  openScenarioModal() {
    document.getElementById('scenarioOverlay')?.classList.add('open');
  }

  closeScenarioModal() {
    document.getElementById('scenarioOverlay')?.classList.remove('open');
  }

  addObj() {
    const inp = document.getElementById('sc-obj-input');
    const val = inp?.value.trim();
    if (!val) return;
    this.pendingScenarioObjectives.push({ text: val });
    inp.value = '';
    this._renderPendingObjs();
  }

  removeObj(idx) {
    this.pendingScenarioObjectives.splice(idx, 1);
    this._renderPendingObjs();
  }

  _renderPendingObjs() {
    const el = document.getElementById('sc-obj-list');
    if (!el) return;
    el.innerHTML = this.pendingScenarioObjectives.map((o, i) => `
      <div class="obj-tag">${escapeHtml(o.text)} <button type="button" data-rm-obj="${i}">×</button></div>
    `).join('');
    el.querySelectorAll('[data-rm-obj]').forEach((b) => {
      b.addEventListener('click', () => this.removeObj(Number(b.dataset.rmObj)));
    });
  }

  async applyScenario() {
    const title = document.getElementById('sc-name')?.value.trim();
    if (!title) {
      this.showToast('Enter a scenario name.', 'err');
      return;
    }
    const payload = {
      title,
      tier: document.getElementById('sc-tier')?.value || '',
      activityType: document.getElementById('sc-type')?.value || 'build',
      description: document.getElementById('sc-desc')?.value.trim() || '',
      objectives: [...this.pendingScenarioObjectives],
      isPublished: true,
    };

    const btn = document.getElementById('sc-publish-btn');
    if (this.userRole === 'teacher' || this.userRole === 'instructor') {
      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }
        const resp = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        const resData = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(resData?.detail?.error || 'Publish failed');
        if (resData?.scenario?.id) this.scenarioId = String(resData.scenario.id);
      } catch (err) {
        this.showToast(err.message || 'Could not publish scenario.', 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Publish Scenario'; }
      }
    }

    this.dataMgr.loadActivityConfig(payload);
    this._syncScenarioUi();
    this.closeScenarioModal();
    this.showToast('Scenario applied.', 'ok');
  }

  showComponentDetails(comp, anchorEl) {
    const pop = document.getElementById('componentPopover');
    if (!pop) return;
    const badge = CAT_BADGE_MAP[comp.cat] || { cls: 'cat-mb', abbr: 'HW' };
    const fields = COMPONENT_DETAIL_FIELDS[comp.cat] || [];
    const rows = fields
      .map((f) => {
        const k = f.keys.find((key) => comp[key] !== undefined && comp[key] !== null && comp[key] !== '');
        return k ? { label: f.label, val: comp[k] } : null;
      })
      .filter(Boolean);

    if (comp.dimensionsMm) {
      rows.push({
        label: 'Physical Size',
        val: `${comp.dimensionsMm.w} × ${comp.dimensionsMm.h} × ${comp.dimensionsMm.d} mm`,
      });
    }

    pop.innerHTML = `
      <div class="component-popover-header">
        <div class="component-popover-icon ${badge.cls}" style="font-size:10px;font-weight:800;">${badge.abbr}</div>
        <div style="min-width:0;flex:1;">
          <div class="component-popover-title">${escapeHtml(comp.name)}</div>
          <div class="component-popover-meta">${escapeHtml(comp.brand || 'Hardware')} · ${escapeHtml(SLOT_DISPLAY_NAMES[comp.cat] || comp.cat)}</div>
        </div>
        <button type="button" class="component-popover-close" id="btnClosePopover">×</button>
      </div>
      <div class="component-popover-body">
        ${comp.description ? `<div class="component-popover-desc">${escapeHtml(comp.description)}</div>` : ''}
        <div class="component-spec-grid">
          ${rows.map((r) => `
            <div class="component-spec-row">
              <div class="component-spec-label">${escapeHtml(r.label)}</div>
              <div class="component-spec-value">${escapeHtml(String(r.val))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    pop.classList.add('open');
    document.getElementById('btnClosePopover')?.addEventListener('click', () => this.hideComponentDetails());

    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    const popRect = pop.getBoundingClientRect();
    let left = rect ? rect.right + 10 : 260;
    let top = rect ? rect.top : 90;
    if (left + popRect.width + 12 > window.innerWidth) {
      left = rect ? rect.left - popRect.width - 10 : window.innerWidth - popRect.width - 16;
    }
    if (left < 12) left = 12;
    if (top + popRect.height + 12 > window.innerHeight) {
      top = Math.max(12, window.innerHeight - popRect.height - 12);
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  hideComponentDetails() {
    document.getElementById('componentPopover')?.classList.remove('open');
  }

  showToast(msg, type = 'ok') {
    clearTimeout(this.toastTimer);
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const txt = document.getElementById('toastMsg');
    if (!toast || !txt) return;

    const iconClass = type === 'err' ? 'toast-err' : type === 'warn' ? 'toast-warn' : 'toast-ok';
    if (icon) {
      icon.className = `toast-icon ${iconClass}`;
      icon.textContent = type === 'err' ? '!' : type === 'warn' ? '!' : '✓';
    }
    txt.textContent = msg;
    toast.classList.add('show');
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
  }

  renderAllUi() {
    this._renderComponentSidebar();
    this._renderCableList();
    this._renderBuildRows();
    this._renderInstallGuide();
    this._renderSelectedActionBar();
    this._syncPanelToggleBtn();
    this._syncPowerButtonUi();
    this._syncScenarioUi();
  }

  // ------------------------------------------------------------------
  // EXTERNAL SYSTEM / LMS INTEGRATION INTERFACE
  // ------------------------------------------------------------------
  _exposeIntegrationApi() {
    window.AssemblySim3D = {
      loadActivity: (config) => {
        const act = this.dataMgr.loadActivityConfig(config);
        this._syncScenarioUi();
        return act;
      },
      setSequence: (seqId) => {
        const ok = this.asm.setSequencePreset(seqId);
        const sel = document.getElementById('sequencePresetSelect');
        if (sel && ok) sel.value = seqId;
        this._renderInstallGuide();
        return ok;
      },
      getState: () => this.asm.getState(),
      getCatalog: (cat = 'all') => this.dataMgr.getCatalog(cat),
      stageComponent: (slotKey, compIdOrName) => {
        const comp = this.dataMgr.findComponent(slotKey, compIdOrName);
        if (!comp) return { ok: false, reason: 'Component not found' };
        return this.asm.stageComponent(slotKey, comp);
      },
      focusSlot: (slotKey) => {
        this.interactionMgr.selectSlot(slotKey);
        const obj = this.compMgr.getObjectForSlot(slotKey);
        if (obj) this.sceneMgr.focusOnObject(obj);
      },
      setReadOnly: (ro) => {
        this.readOnly = Boolean(ro);
        this.interactionMgr.setReadOnly(this.readOnly);
        this.renderAllUi();
      },
      loadBuildPayload: (payload) => this.loadBuildPayload(payload),
      inspectComponent: (slotOrCat, idOrName) => {
        const comp = idOrName
          ? this.dataMgr.findComponent(slotOrCat, idOrName)
          : this.asm.slots[slotOrCat]?.component;
        if (!comp) return false;
        this.openInspector3D(comp);
        return true;
      },
      closeInspector: () => this.closeInspector3D(),
      getTroubleshootingPresets: () => TROUBLESHOOTING_PRESETS,
      loadTroubleshootingPreset: (id) => this.loadTroubleshootingPreset(id),
      connectCablePortPair: (a, b) => this.connectCablePortPair(a, b),
      setShowCablePorts: (show) => {
        this.compMgr.setShowCablePorts(show);
        this._syncPortsToggleUi();
      },
      setMute: (muted) => {
        this.sfx.setMuted(muted);
        this._syncMuteUi();
      },
      runValidation: () => this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity),
      exportResults: () => {
        const report = this.validator.evaluateAssembly(this.asm.getState(), this.dataMgr.activity);
        return this.dataMgr.exportAssessmentResult(report, this.asm.getState());
      },
    };
    window.simApp = this;
  }
}

const app = new SimulatorApp();
app.init();
