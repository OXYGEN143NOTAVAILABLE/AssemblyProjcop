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
