# Assembly PC — Activity & Feature Tracker

A running log of changes, bug fixes, and added features for the Assembly PC application.

---

## Format for New Entries

```markdown
## [YYYY-MM-DD] — Short Summary

### Added
- New features, endpoints, or UI workflows

### Changed
- Updates to existing behavior, configuration, or architecture

### Fixed
- Bug fixes and root-cause notes

### Verified
- Tests and checks run after the change
```

---

## [2026-11-18] — 3D Placement Alignment Fixes & Sidebar-to-3D Drag-and-Drop (`/simulator`)

### Added
- **Sidebar-to-3D Direct Drag & Drop (`SimulatorApp.mjs`, `InteractionManager.mjs`, `ComponentManager.mjs`, `simulation.html`)**:
  - Hardware catalog rows (`#sidebarList .comp-item`) are now natively draggable (`draggable="true"` with grip indicator & `cursor: grab`) directly onto the `#sim3dViewport` 3D canvas while preserving click-to-stage.
  - Shared planar raycasting (`_projectClientToWorld`) renders a real-time translucent 3D drag ghost (`startDragGhost` / `updateDragGhost`), live green/amber/red snap ring guide, and status pill hints during drag, dropping parts directly onto the ESD Prep Pad, Case standoffs, sockets/slots, or Staging Tray.
- **Spatial Bounds Unit Test (`server/sim3d.test.mjs`)**:
  - Added automated assertions verifying grounded staging heights inside ESD mat boundaries, PSU shroud floor/ceiling clearances, motherboard standoff contact depth, and rear exhaust fan separation.

### Fixed
- **Case Rear Wall Cutouts & Hardware Fitment (`ProceduralHardwareFactory.mjs`, `PlacementSnappingSystem.mjs`)**:
  - Fixed the `rotateY(Math.PI / 2)` X/Z mirror inversion on `ioHole` (`z: -0.70..-0.34`), `rearFanHole` (`z: +0.24`, aligned to `CASE_SUB_ANCHORS.case_fan`), and expanded `pcieHole` (`y: 1.28..2.64`) with evenly pitched expansion covers so the GPU dual-slot bracket & DisplayPort housings sit flush without clipping.
  - Adjusted brass standoffs (`z = -0.712`, length `0.064`) to meet `CASE_MB_ANCHOR.z = -0.662` flush under the PCB, guarded mATX `pcieX1` bounds, and lifted `CASE_SUB_ANCHORS.psu` (`x: -3.24, y: 0.56`) so the PSU sits cleanly above the case floor inside the shroud viewing window.
- **ESD Mat & Grounded Staging Tray (`SceneManager.mjs`, `PlacementSnappingSystem.mjs`, `ComponentManager.mjs`)**:
  - Aligned `_makeEsdMatTexture()` zones (`CHASSIS BAY`, `MOTHERBOARD ESD PREP PAD`, `STAGING TRAY`) to exact world coordinates (`BENCH_PREP_ORIGIN` at `(2.05, 0.04, 0)`) and grounded all `STAGING_ANCHORS` items (Cooler, RAM, GPU, CPU, Storage, PSU, Case Fan) onto the mat surface with zero floating or overlapping parts.
- **3D Cable Ports (`ComponentManager.mjs`)**:
  - Routed `psu_main`, `psu_eps`, `psu_pcie`, `psu_sata` onto the PSU `+X` modular bank inside the chassis, computed `gpu_pwr` dynamically from installed GPU dimensions, aligned `sata_drive`/`case_fp`/`fan_lead` endpoints, and hid SATA cable port markers on M.2 NVMe builds.

### Verified
- `npm test` (`17/17` tests passing), `node --check frontend/static/js/sim3d/*.mjs`, and headless Chromium (`playwright-cli`) sidebar drag-and-drop & visual verification (`0` console errors).

---

## [2026-11-18] — High-Detail Procedural 3D Hardware Anatomy Upgrade (`/simulator`)

### Changed
- **Anatomical Multi-Part Procedural 3D Hardware (`ProceduralHardwareFactory.mjs`)**:
  - Upgraded all 10 hardware & cable builders (`mergeGeometries`, `ExtrudeGeometry` cutouts/bevels, `TubeGeometry` heatpipes, procedural `CanvasTexture` brushed-metal bump / honeycomb mesh / braided cable sleeve / PCB silkscreen / gold edge fingers / LGA+PGA underside pads) while preserving full interactive dragging, snapping, `R` rotation, 3D fasteners (`cpuLeverPivot`, `dimmLatches`, `fastenerScrews`), and port-to-port 3D cabling:
    - **Case**: Isolation chrome/rubber feet, bottom PSU filter, roof honeycomb grille + multi-port top I/O, aluminum corner pillars, rubber cable grommets, 9 brass standoffs, sculpted **cutout rear wall** (MB I/O, exhaust fan, slotted PCIe covers, PSU bay), 3x front intake fans behind perforated mesh, PSU shroud with viewing window, and removable tempered glass side panel.
    - **Motherboard**: Maker-themed (`ROG/ASUS`, `MSI`, `GIGABYTE`, `ASROCK`) PCB with normalized trace/silkscreen face, sculpted rear I/O shroud + 5 stacked color-coded ports, grooved VRM heatsinks + curved heatpipe + batched R68 chokes/caps, PCH heatsink, open-window stainless ILM CPU socket + Pin-1 triangle + lever, dual-rail keyed DIMM channels + latches, open `M2_1` & armored `M2_2`, steel PCIe x16, CR2032 coin battery, audio caps, and pin-filled headers.
    - **CPU, Coolers, RAM, GPU, PSU, Storage, Case Fans & Cables**: AM5 cruciform / Intel stepped IHS with normalized top branding & underside pad matrix; Radial (28 fins), Single-Tower (4 heatpipes + top cap), and Dual-Tower (6 heatpipes + twin 20-fin stacks + top caps + dual fans) coolers; exposed DRAM ICs + notched 288-pin RAM; 42-fin GPU with 4 heatpipes, X-clamp core window, flow-through backplate, circular shroud fan bores, swept rotor blades & nameplate; PSU with recessed intake fan, wire grille, 3-prong IEC C14 inlet, red rocker & modular socket bank; M.2 NVMe (controller/DRAM/NAND/M-key), 2.5" SATA SSD, and 3.5" cast-aluminum HDD; octagonal swept-blade fans with stator struts; braided-sleeve cables with cable combs.
- **3D Inspector & Render Loop (`SimulatorApp.mjs`, `ComponentManager.mjs`, `SceneManager.mjs`)**:
  - Added `RoomEnvironment` PMREM + `ACESFilmicToneMapping` to `openInspector3D()`, converted the Inspector render loop to on-demand damping (`requestInspRender`), disposed `bumpMap`/`roughnessMap`/`PMREM` cleanly on close, and improved software-WebGL camera preset damping & Rear I/O framing.

### Verified
- `node --check frontend/static/js/sim3d/*.mjs` passed (`0` errors).
- `npm test` (`16/16` tests passing in `/server/logic.test.mjs` and `/server/sim3d.test.mjs`).
- Headless Chromium (`playwright-cli`) verified real pointer drag-and-drop & `R` rotation on staged parts, 3D Inspector renders across all upgraded hardware models, repaired Fault Lab assembly, Rear I/O wall cutouts, closed glass case view, and `0` console errors.

---

## [2026-11-17] — Phase 2: Direct 3D Cabling, Fasteners, 3D Hardware Inspector, Fault Labs & Audio FX (`/simulator`)

### Added
- **Direct 3D Cable Port-to-Port Routing & 3D Fasteners (`ComponentManager.mjs`, `InteractionManager.mjs`, `ProceduralHardwareFactory.mjs`)**:
  - Added color-coded 3D header port markers inside open workstations (`cyan` = available, `yellow` = selected, `amber` = matching partner port, `green` = connected) with HUD `Ports: On/Off` toggle (`#btnTogglePorts`).
  - Added interactive 3D mechanical fasteners: hinged CPU ILM retention lever (`cpuLeverPivot`), animated RAM DIMM latches (`dimmLatches`), rear I/O shield blocks, and visible motherboard/GPU/PSU mounting thumbscrews (`fastenerScrews`) clickable directly in the 3D scene.
- **Standalone 3D Hardware Inspector Modal (`SimulatorApp.mjs`, `simulation.html`, `ProceduralHardwareFactory.mjs`)**:
  - Accessible from every catalog row (`3D`) and the selected part action bar (`Inspect 3D`).
  - Renders a dedicated orbitable turntable studio canvas (`OrbitControls`) with `Rotate 90°`, `Flip Underside` (exposing underside CPU LGA pads / AM4 pin grids & mirrored Pin-1 chamfer triangle, RAM keying, and PCIe fingers), `Reset View`, orientation tips, and clean WebGL resource disposal on close.
  - Added optional `tryAttachExternalGltf()` helper in `ProceduralHardwareFactory.mjs` for loading custom `.glb`/`.gltf` assets when `gltfUrl` is provided.
- **Troubleshooting / Fault-Finding Labs (`TROUBLESHOOTING_PRESETS`)**:
  - Added pre-built diagnostic workstations (`fault_no_post_orientation` and `fault_memory_power_mismatch`) selectable from the `#faultLabSelect` HUD dropdown and `window.AssemblySim3D.loadTroubleshootingPreset(id)`.
- **Synthesized Web Audio Tactile SFX (`SoundFX.mjs`)**:
  - Zero-asset Web Audio cues for aligned/misaligned snaps, retention latches, cable connections, and motherboard POST/fault speaker beeps, with persisted `SFX: On/Off` toggle (`#btnSfxToggle`).

### Verified
- `npm test` (`16/16` tests passing in `/server/logic.test.mjs` and `/server/sim3d.test.mjs`, covering bidirectional cable port pairs and both `TROUBLESHOOTING_PRESETS` fault + 100% repair cycles).
- `node --check frontend/static/js/sim3d/*.mjs` passed.
- Headless Chromium (`playwright-cli`) verified 3D Hardware Inspector modal + underside flip + WebGL disposal, Fault Lab 1 diagnostics, direct 3D canvas port-to-port cabling (`psu_pcie` -> `gpu_pwr`), 3D CPU ILM fastener latching, full Fault Lab 1 repair to `100%` score + POST pass, and `0` console errors.

---

## [2026-11-17] — Phase 1: 3D PC Assembly Simulation Engine (`/simulator`)

### Added
- **Modular 3D PC Assembly Architecture (`/frontend/static/js/sim3d/`)**:
  - `SceneManager.mjs`: Three.js WebGL workstation with `RoomEnvironment` PMREM reflections, interactive OrbitControls, workbench ESD mat (Case Bay, Motherboard Prep Pad, Staging Tray), and 5 camera presets (`default`, `interior`, `bench`, `psu`, `rear`) plus `focusOnObject(obj)` and on-demand rendering.
  - `SimulationDataManager.mjs`: Hydrates live `/api/components` database parts with millimeter-accurate physical dimensions (`1 unit = 100mm`), built-in `CASE_SPEC_CATALOG`, `CPU_COOLER_CATALOG`, `CABLE_DEFINITIONS`, `loadActivityConfig()`, `exportBuildPayload()`, and `exportAssessmentResult()`.
  - `ProceduralHardwareFactory.mjs`: Multi-part 3D hardware models for all 10 required component categories (PC Case with brass standoffs, removable tempered glass side panel, PSU shroud, and drive shelf; Motherboard with silkscreen headers, socket Pin-1 corner, DIMMs, M.2, PCIe x16; CPU with IHS & Pin-1 marker; CPU Cooler tower & fan rotor; DDR/SO-DIMM RAM sticks; Dual/Triple-fan GPU; PSU with fan & efficiency label; NVMe M.2 / 2.5" SATA / 3.5" HDD; Case Fan; `TubeGeometry` spline cables).
  - `PlacementSnappingSystem.mjs`: Dual-plane anchor snapping (bench prep pad <-> vertical motherboard tray), proximity thresholds, discrete 90-degree orientation verification, and clearance guards.
  - `AssemblyManager.mjs`: Component lifecycle state machine (`uninstalled | staged | placed | installed_correct | installed_incorrect`), configurable sequence presets (`bench_first`, `case_first`, `freeform`), retention latching/fastening, thermal paste state, dependency-guarded removal, and cable state.
  - `ComponentManager.mjs`: 3D mesh lifecycle sync, pea-sized thermal paste dot, glowing snap ring indicator, side-panel glass toggle, and grommet-routed internal 3D cables.
  - `InteractionManager.mjs`: Raycast selection, dual-plane drag-and-drop without interfering with OrbitControls, `R` (rotate 90 deg), `F` (focus), `Delete`/`Backspace` (remove), and `Escape` shortcuts.
  - `ValidationEngine.mjs`: **Post-assembly** grading engine evaluating (A) Installation correctness, (B) Component compatibility, (C) Cable & power connections, and (D) Structured final assessment & scenario objectives.
  - `SimulatorApp.mjs` & `window.AssemblySim3D`: Full workstation UI integration, `/api/builds` save/load/delete, `/api/scenarios` + `/complete`, `?build=<id>&readonly=1` Gallery inspection, and UEFI Monitor / POST diagnostics.
- **Three.js Vendor Routing (`/server.mjs`)**: Added `/vendor/three/` static serving from `node_modules/three/` and importmap wiring in `/frontend/templates/simulation.html`.
- **Unit Test Suite (`/server/sim3d.test.mjs`)**: Added `node:test` coverage for catalog hydration, placement snapping, bench-first workflow, non-blocking mid-build assembly, and post-assembly validation rules.

### Changed
- Rebuilt `/frontend/templates/simulation.html` into a 3-pane 3D workstation layout while preserving external dashboard, auth, gallery, profile, and scenario API contracts.
- Removed continuous mid-build compatibility blocking per simulation pedagogy requirements; all compatibility, orientation, and cable grading runs post-assembly (`Validate & Submit` / power-on `Monitor / POST` diagnostics).

### Verified
- `npm test` (`14/14` tests passing across `/server/logic.test.mjs` and `/server/sim3d.test.mjs`).
- `node --check frontend/static/js/sim3d/*.mjs` syntax verification passed.
- Headless Chromium (`playwright-cli`) verified full workstation render, pointer drag + `R` key rotation + camera orbit, full AM5 build (`100%` validation score), UEFI BIOS POST with non-blocking open-side-panel advisory, mismatched build diagnostics, `/api/builds` save/delete persistence, `?build=1&readonly=1` Gallery inspection, and `0` console errors.

---

## [2026-11-17] — Persistent SQLite Credentials Database & Firebase Firestore Rules

### Added
- **Durable Relational Persistence (`/server/db.mjs`)**: Replaced volatile in-memory storage with Node's built-in `node:sqlite` (`DatabaseSync`) backed by `/server/data/assemblypc.db` (WAL mode) for `student_users`, `admin_users`, `component_items`, `pc_scenarios`, `saved_builds`, `build_hearts`, `build_favorites`, `user_badges`, and `scenario_completions`.
- **Firebase Firestore Provisioning & Security Rules**: Configured `/firebase-applet-config.json`, `/firebase-blueprint.json`, `/security_spec.md`, `/eslint.config.js` (`@firebase/eslint-plugin-security-rules`), audited `/firestore.rules` deployed via `DeployRules`, and added `/frontend/static/js/firebase-client.mjs` with `testConnection()` and `handleFirestoreError()`.
- **Database Unit Tests**: Added `node:test` persistence checks in `/server/logic.test.mjs` verifying user registration, bcrypt hashes, password resets, and saved builds survive database reopen.

### Changed
- Updated `/server.mjs` so all auth registrations, logins (`last_login_at`), password resets, saved builds, hearts/favorites, badges, scenarios, completions, and admin CRUD operations read and persist directly to SQLite, and `/api/db-check` reports live SQLite row counts.
- Added `/server/data/` and `*.db*` exclusions to `/.gitignore`.

---

## [2026-11-17] — Cookie-Blocked Iframe Navigation & Logout Auth Fix

### Fixed
- **Full-page redirects back to login when third-party cookies are blocked in an iframe**: After signing in or registering on `/`, full-page navigations to `/simulator`, `/profile`, and `/admin` do not attach `Authorization: Bearer` headers. When an iframe blocks cookies, `GET /simulator` and `GET /profile` redirected back to `/?login_required=...`, causing repeated sign-in prompts (and `"Account is already registered"` when re-submitting registration).
- Added a token-gate HTML bootstrap (`renderTokenGateHtml`) on `/simulator`, `/profile`, and `/admin` when no session cookie is present, fetching the HTML via `Authorization: Bearer` from `sessionStorage`/`localStorage` before redirecting to login only if unauthenticated.
- Updated `IFRAME_TOKEN_BRIDGE_SCRIPT` to persist tokens in both `sessionStorage` and `localStorage`, updated `renderAdminLogin()` to submit via `/api/auth/login` with Bearer token persistence, and updated `GET /logout` and `GET /admin/logout` to clear stored tokens and session keys before redirecting home.

### Verified
- `node --test server/logic.test.mjs`: `7/7` unit tests passed.
- Headless Chromium verified student registration, student login -> `/simulator`, `/profile`, `/admin/login` -> `/admin`, and `/logout` **with all cookies stripped/blocked** across requests (`0` console errors).

---

## [2026-11-17] — Synced with GitHub `ORIG` (`ff70cd1`) Multi-Page Frontend

### Changed
- **Switched `server.mjs` from the stripped React SPA to the pushed `ORIG` HTML templates** (`frontend/templates/homepage.html`, `simulation.html`, `gallery.html`, `profile.html`, `search.html`, `admin-dashboard.html`) and `frontend/static/js/simulator.js`.
- Added `readAndProcessTemplate()` in `server.mjs` to resolve static asset links (`/static/...`) and inject a lightweight cross-site iframe `Authorization: Bearer` fetch bridge alongside `SameSite=None; Secure; Partitioned` HTTPS cookies.
- Added `/admin/login` (GET/POST) and `/admin/logout` (GET) HTML routes plus `GET /api/admin/users/students` and `GET /api/admin/users/instructors` endpoints in `server.mjs`.
- Removed the obsolete React SPA source files (`frontend/src/`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/package.json`) and updated root `package.json` scripts.

### Verified
- `node --test server/logic.test.mjs`: 7/7 unit tests passed.
- Headless Chromium verified `/` (`homepage.html`), Student login (`2024-0001` / `student123`) -> `/simulator` (38 catalog components loaded in `simulator.js`), `/profile`, `/gallery`, `/search?q=AM5`, and `/admin/login` (`admin` / `admin123`) -> `/admin` (`admin-dashboard.html`) with 0 console errors.

---

## [2026-11-17] — Cross-Site Iframe Session & Login Fix

### Fixed
- **Session loss right after login/registration**: Browsers block `SameSite=Lax` cookies inside cross-site iframes, causing `/api/auth/me` on route changes to return `user: null` and immediately log users out (which also made repeat sign-up attempts report `"Account already exists"`).
- Updated `server.mjs` to issue signed session tokens returned in login/register JSON responses alongside `SameSite=None; Secure; Partitioned` cookies over HTTPS (`SameSite=Lax` on local HTTP).
- Updated `frontend/src/api.js`, `frontend/src/pages/Auth.jsx`, `frontend/src/components/Nav.jsx`, and `frontend/src/App.jsx` to store the session token (with an in-memory fallback when browser storage is restricted) and attach `Authorization: Bearer <token>` on API requests.

### Changed
- Student login (`POST /api/auth/login`) now accepts either a Student ID (`school_id`) or registered email address.

### Verified
- `node --test server/logic.test.mjs`: 7/7 unit tests passed.
- `npm run build`: Vite production build succeeded.
- Headless Chromium verification with cookies cleared between reloads/navigations confirmed student registration, `/simulator` access, `/profile` loading, logout/re-login, and `/admin` dashboard persistence with 0 console errors.

---

## [2026-11-17] — Node.js / Express Migration & Port 3000 Boot

### Added
- **Node.js + Express Backend (`/server.mjs`)**: Migrated API routes from the legacy Python FastAPI backend to Express serving both `/api/*` endpoints and the built React SPA on `0.0.0.0:3000`.
- **Compatibility & Validation Engine (`/server/logic.mjs`)**: Implemented socket, RAM type/capacity/speed/DIMM slot/form-factor, PCIe x16 slot, PSU wattage & PCIe cable capacity, case clearance, and M.2/SATA/IDE storage compatibility checks, plus wattage/PSU recommendations and input validators.
- **Seeded In-Memory Store (`/server/seedData.mjs`)**: Seeded component catalog (CPUs, motherboards, RAM, GPUs, PSUs, SSDs, HDDs, cooling fans), default accounts (`admin`, sample instructor, sample student), sample guided scenarios, and a reference AM5 published build.
- **Unit Tests (`/server/logic.test.mjs`)**: Added 7 `node:test` cases covering balanced builds, socket mismatch, DDR3/DDR4 mismatch, PSU under-wattage, missing M.2 slot, power calculation, and category alias normalization.

### Changed
- Updated `/frontend/vite.config.js` to build to `dist` with `base: '/'` and `allowedHosts: true`.
- Updated root `/package.json` (`"type": "module"`, `"dev": "npm run build && node server.mjs"`, `"start": "node server.mjs"`, `"test": "node --test server/logic.test.mjs"`).
- Removed `/bun.lock` and legacy `/backend` and `/scripts` directories after verifying the Node.js build.

### Known Limitations
- Application data is stored in memory and resets when the server restarts (until connected to a persistent database).
- Default seeded test accounts:
  - Admin: `admin` / `admin123`
  - Instructor: `instructor@lnu.edu.ph` / `instructor123`
  - Student: `2024-0001` / `student123`

### Verified
- `node --test server/logic.test.mjs`: 7/7 passed.
- `npm run build`: Succeeded.
- Headless Chromium verified Home (`/`), Gallery (`/gallery`), read-only build view (`/simulator?build=1&readonly=1`), Student Login & Simulator compatibility/save flow, Search (`/search?q=AM5`), and Admin Dashboard (`/admin`) on port `3000`.
