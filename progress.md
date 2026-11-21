# Assembly-PC-(Student/Instructor/Assembly) — Feature Progress & Diff vs. `main`

- **Branch:** `Assembly-PC-(Student/Instructor/Assembly)` (built on `Assembly-w/-Instructor` + selectively integrated Student Dashboard SPA from `STUDENT-DASHBOARD` `b518cc0` / PR #8 without re-introducing Node/SQLite/Firebase)
- **Base Commit (`main`):** `992551d` (`Merge pull request #6 from Zary-bot/revert-3-REACT-Version`)
- **Feature & Merge Commits Ahead of `main`:**
  - `821c2e2` — *Add Instructor Dashboard under frontend/instructor-dashboard*
  - `af9c646` — *Integrate Instructor Dashboard DB, API, student classrooms UI, and Docker setup*
  - `dde6f37` — *Update INSTRUCTOR_DASHBOARD_PROGRESS.md*
  - `d087328` — *Merge ASSEMBLY-PROCESS 3D simulator with Instructor-Dashboard backend and activity dropdown*
  - `d21d08f` — *Fix .mjs MIME type and connect student classroom activities to 3D simulator*
  - `1aec376` — *Update INSTRUCTOR_DASHBOARD_PROGRESS.md and Dockerfile for Assembly-w/-Instructor*
  - `015a43c` — *Update README.md for Assembly-w/-Instructor branch and 3D classroom workflow*
  - `385288c` — *Selectively integrate Student Dashboard SPA into Assembly-PC branch*
  - `12ea9dc` — *Add role-aware Dashboard link to homepage and gallery headers*
  - Plus renaming/updating this progress log (`progress.md`) and project tree reference in `README.md`

This document summarizes everything built across `Instructor-Dashboard`, `Assembly-w/-Instructor`, and `Assembly-PC-(Student/Instructor/Assembly)` that does **not** exist on the `main` branch.

---

## Summary of New Capabilities

### 1. Instructor Dashboard Web App (`frontend/instructor-dashboard/`)
On `main`, instructors have no dedicated classroom management dashboard. `Instructor-Dashboard` adds a complete **React 19 + Vite** Single-Page App served at `/instructor`:
- **Dashboard Views:** Home overview (Classes grid + Upcoming Activity Schedules panel), All Classrooms view, All Schedules view, Classroom Detail view (**Scheduled Activities** & **Students List** / **Pending Invitations** tabs), and Activity Detail view.
- **Classroom Creation:** Create classrooms with optional student capacity (`1–500`), custom or auto-generated `APC-XXXX` join codes, and one-click code copy buttons (`NewClassroomModal.jsx`, `ClassCard.jsx`).
- **Direct Student Invitations:** Invite registered active students by **Student ID** or **email**, view pending invitations, and cancel pending invitations (`InviteStudentModal.jsx`).
- **Student Roster Management:** View enrolled students, track submission counts and overall averages, automatic **On Track** / **At-Risk** / **Enrolled** status pills, and remove students from a classroom.
- **Activity Scheduling & Grading:** Schedule, edit, delete (with confirmation dialog), and manually lock/unlock activities (`ScheduleActivityModal.jsx`, `ConfirmDeleteModal.jsx`), plus inline per-student `0–100` grading and score clearing (`ActivityDetailView.jsx`).
- **Profile Controls:** Edit instructor display name and log out cleanly from the sidebar profile popover (`Sidebar.jsx`).
- **Live PostgreSQL API Integration + Host Architecture:** `apiAdapter.js` connects every dashboard action to FastAPI with cookie auth (`credentials: 'include'`), while `placeholderAdapter.js` and `INTEGRATION.md` keep the component usable in standalone preview mode (`VITE_USE_PLACEHOLDER_DATA=true`).

---

### 2. PostgreSQL Schema Extensions (`backend/schemas/database_schema.sql`)
On `main`, the database has user, component, scenario, and build tables (`admin_users`, `student_users`, `pc_scenarios`, `saved_builds`, etc.) with no classroom or grading tables. This branch adds **5 tables** and **11 indexes** idempotently (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, without dropping existing data):

| Table | Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`classrooms`** | Stores instructor-created classes | PK `classroom_id`; FK `instructor_id → admin_users(admin_id)` (`ON DELETE CASCADE`); case-insensitive unique `join_code` (`UPPER(join_code)`); `student_capacity` check (`1..500`) |
| **`classroom_enrollments`** | Tracks students joined to a classroom | PK `enrollment_id`; FK `classroom_id → classrooms` & `student_id → student_users` (`ON DELETE CASCADE`); `UNIQUE (classroom_id, student_id)` |
| **`classroom_invitations`** | Tracks pending/accepted/declined invites | PK `invitation_id`; FK `classroom_id`, `student_id`, `invited_by → admin_users`; status check (`pending`/`accepted`/`declined`); partial unique index preventing duplicate pending invites |
| **`classroom_activities`** | Tracks scheduled assignments per class | PK `activity_id`; FK `classroom_id → classrooms` (`CASCADE`) & optional `scenario_id → pc_scenarios` (`SET NULL`); `CHECK (due_at > scheduled_at)`; `is_locked`, `manual_override` |
| **`activity_submissions`** | Stores student submissions & grades | PK `submission_id`; FK `activity_id → classroom_activities` (`CASCADE`), `student_id → student_users` (`CASCADE`), optional `build_id → saved_builds` (`SET NULL`), optional `graded_by → admin_users` (`SET NULL`); `score` check (`0..100`); `UNIQUE (activity_id, student_id)` |

`backend/scripts/setup_database.py` (`verify_data()`) was also updated to verify row counts across all 5 new tables alongside the existing 17 tables (22 tables total).

---

### 3. FastAPI Backend Endpoints & Role Routing (`backend/api/routes/instructor_dashboard.py`, `backend/app.py`, `backend/core/middleware.py`)
None of the routes below exist on `main`:

- **Role Redirects, Static Mounts & SPA Serving (`backend/app.py`):**
  - Instructor registration (`POST /api/auth/register`) and login (`POST /api/auth/login`) return `redirectUrl: "/instructor"`, while student registration and login now return `redirectUrl: "/student/dashboard"`.
  - Added `GET /instructor`, `GET /instructor/favicon.svg`, `/instructor/assets`, `GET /student`, `GET /student/dashboard`, and `/student/assets` static mounting via the shared `_render_spa_dashboard_html` helper (injecting `window.AUTH_USER` and `sessionStorage` sync with `\u003c` escaping, redirecting unauthenticated users to `/?login_required=instructor` or `/?login_required=student`, cross-routing roles cleanly, and returning `503` if a SPA bundle is unbuilt).
  - Registered `application/javascript` MIME types for `.mjs` and `.js` via `mimetypes.add_type(...)` before mounting static assets so Windows/browsers execute the 11 Three.js simulator ES modules cleanly, and mounted `/vendor/three/` and `/vendor/three/addons/`.
  - Enabled `PATCH` in `CORSMiddleware`, added `require_student`, preserved structured `detail` payloads on `404` responses, and called `ensure_instructor_dashboard_tables()` on startup.
- **Middleware (`backend/core/middleware.py`):**
  - Added `Cache-Control: no-store` protection for `/instructor`, `/student`, and `/student/dashboard`.
  - Added `/api/instructor`, `/api/student/classrooms`, `/api/student/invitations`, and `/api/student/activities` to `AUDIT_PATHS`.
- **Instructor Endpoints (11 routes):**
  - `GET /api/instructor/dashboard` — loads instructor name, classrooms (with enrolled students & pending invitations), and sorted schedules with scores
  - `POST /api/instructor/classrooms` — creates a classroom with auto/custom join code & capacity validation
  - `POST /api/instructor/classrooms/{classroom_id}/invitations` — invites an active student by Student ID or email (atomic capacity/duplicate checks)
  - `DELETE /api/instructor/classrooms/{classroom_id}/invitations/{invitation_id}` — cancels a pending invitation
  - `DELETE /api/instructor/classrooms/{classroom_id}/students/{student_id}` — removes student enrollment and associated classroom submissions transactionally
  - `POST /api/instructor/schedules` — schedules a new classroom activity
  - `PUT /api/instructor/schedules/{activity_id}` — edits an activity (clears submissions if moved to a different classroom)
  - `DELETE /api/instructor/schedules/{activity_id}` — deletes an activity
  - `PATCH /api/instructor/schedules/{activity_id}/lock` — locks/unlocks scoring with manual override flag
  - `PUT /api/instructor/schedules/{activity_id}/scores/{student_id}` — saves/updates/clears a `0–100` grade (returns `409` if locked)
  - `PATCH /api/instructor/profile` — updates instructor display name in `admin_users`
- **Student Endpoints (7 routes):**
  - `GET /api/student/activities` — lists all scheduled activities across active classrooms the student is enrolled in, enriched with `title`, `className`, `instructorName`, `description`, `tier`, `timeLimitMinutes`, `status` (`notStarted` | `locked` | `completed`), and `completion`
  - `GET /api/student/classrooms` — lists active classrooms the student is enrolled in along with each classroom's ordered `activities` list (`faultLabId`, `activityType`, due date, `isLocked`, `isSubmitted`, `score`, `buildId`, `submittedAt`)
  - `GET /api/student/activities/{activity_id}` — fetches assigned activity metadata, classroom/instructor info, and current submission state for enrolled students (`404` if not found or not enrolled)
  - `POST /api/student/activities/{activity_id}/submit` — records a student's `0–100` score and optional `buildId` into `activity_submissions` (enforces enrollment `403` and lock state `409`) so grades populate the Instructor Dashboard
  - `POST /api/student/classrooms/join` — enrolls via `joinCode` (enforcing capacity and auto-accepting any matching pending invitation)
  - `GET /api/student/invitations` — lists pending classroom invitations for the logged-in student
  - `POST /api/student/invitations/{invitation_id}/respond` — accepts or declines a pending invitation (`accept` enrolls inside the same transaction)
- **Automated Backend Tests (`backend/tests/test_instructor_dashboard.py`):**
  - 13 unit and integration tests covering role guards, DDL verification, `.mjs`/`.js` MIME registration, classroom capacity/join-code uniqueness, invite/accept/decline/join flows, student activities list/detail/submission flows (including `409` lock enforcement and instructor gradebook sync), `/instructor` and `/student/dashboard` HTML auth injection & redirects, `no-store` / `AUDIT_PATHS`, schedule locking, score grading, transactional rollback on student removal, CORS `PATCH`, and redirect behavior.

---

### 4. Student Classrooms, Invitations & 3D Simulator Launch UI (`frontend/templates/profile.html`, `frontend/static/js/sim3d/SimulatorApp.mjs`)
On `main`, `/profile` has only Overview, My Builds, Favorites, and instructor Scenarios tabs. `Assembly-w/-Instructor` adds:
- A student-only **Classrooms** tab (with a live pending-invitation count badge).
- A **Join a Classroom** form (`POST /api/student/classrooms/join`) for entering `APC-XXXX` codes with accessible validation and status feedback (`joinForm.reset()` on successful join).
- A **Pending Invitations** list with **Accept** and **Decline** buttons.
- A **My Classrooms** card grid displaying enrolled classrooms, instructor names, join codes, assigned activity lists with due dates and status badges (`Assigned`, `Locked`, `Submitted · <score>/100`), and direct **Launch Activity** / **Re-open Lab** links to `/simulator?activity=<id>`.
- **3D Simulator Classroom Integration (`SimulatorApp.mjs`):** Parses `?activity=<id>`, fetches `/api/student/activities/{id}`, auto-loads matching Troubleshooting Fault Labs or Build Scenarios in 3D, surfaces classroom status & an assigned-activities switcher in the **Activity** tab (`#rtab-scenario`), and submits builds/scores directly to `POST /api/student/activities/{id}/submit` via **Validate & Submit**.

---

### 5. Docker Setup, Demo Seeding & Documentation (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`)
Not present on `main`:
- **One-Command Docker Stack:** Multi-stage `Dockerfile` (`Stage 1` `frontend-builder` builds the React Instructor Dashboard bundle + installs `three@^0.187.0` with Node 22; `Stage 2` `student-builder` builds `frontend/student-dashboard` with Node 22; `Stage 3` packages FastAPI + templates + `frontend/static/js/sim3d/*.mjs` + `/vendor/three/` + both built SPAs with Python 3.13, verifies built/3D assets at build time, and defines a container `HEALTHCHECK` against `/api/health`), `docker-compose.yml` (`db` + `app` services with PostgreSQL healthcheck & persistent `postgres_data` volume), and `.dockerignore` (excluding both `frontend/instructor-dashboard/dist` and `frontend/student-dashboard/dist` from the build context).
- **Container Entrypoint & Demo Seeder:**
  - `backend/scripts/docker_entrypoint.py` — waits for PostgreSQL, initializes schema once on fresh volumes, runs `ensure_auth_tables()`, optionally seeds demo accounts & scenarios, and launches Uvicorn.
  - `backend/scripts/seed_demo_accounts.py` — idempotently seeds ready-to-test accounts (`prof.maria@lnu.edu.ph` / `Instructor123!`, `2024-1001` / `Student123!`, `2024-1002` / `Student123!`) plus all 4 workstation scenarios in `pc_scenarios`.
- **Updated `README.md`:** Step-by-step setup guides for **Option A (Docker)** and **Option B (Local Dependencies)** plus the demo account table and test scenarios.

---

## Complete File Inventory vs. `main`

### Modified Existing Files
- `README.md`
- `backend/app.py`
- `backend/core/middleware.py`
- `backend/schemas/database_schema.sql`
- `backend/scripts/setup_database.py`
- `frontend/templates/admin-dashboard.html`
- `frontend/templates/gallery.html`
- `frontend/templates/homepage.html`
- `frontend/templates/profile.html`
- `frontend/templates/simulation.html`

### Added Files
- `.dockerignore`
- `CHANGELOG.md`
- `Dockerfile`
- `LICENSE`
- `docker-compose.yml`
- `progress.md` *(this file, renamed from `INSTRUCTOR_DASHBOARD_PROGRESS.md`)*
- `backend/api/routes/instructor_dashboard.py`
- `backend/scripts/docker_entrypoint.py`
- `backend/scripts/seed_demo_accounts.py`
- `backend/tests/test_instructor_dashboard.py`
- `frontend/static/assembly-pc-logo.svg` *(Assembly PC logo asset selectively extracted from `b518cc0`)*
- `frontend/static/js/sim3d/*.mjs` *(11 modular Three.js 3D simulator files merged from `ASSEMBLY-PROCESS`, with classroom activity integration in `SimulatorApp.mjs`)*
- `frontend/instructor-dashboard/` *(React components, `apiAdapter.js`, `placeholderAdapter.js`, `dashboardLogic.js`, Vite config, styles, assets, `INTEGRATION.md`, `package.json`, `package-lock.json`, `.oxlintrc.json`)*
- `frontend/student-dashboard/` *(React 18 + Vite Student Dashboard SPA: `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/student.css`)*

---

## Verification Status & Known Notes

### Verified Passing
- **Backend unit & integration tests:** `python -m unittest discover -s tests -p "test_instructor_dashboard.py" -v` passed (**13/13 tests OK** using mocked DB/stubs), including `.mjs`/`.js` MIME registration, student activities list/detail/submission flows, `/student/dashboard` HTML auth injection & redirects, `Cache-Control: no-store` on `/student` and `/student/dashboard`, and `/api/student/activities` in `AUDIT_PATHS`.
- **JavaScript syntax checks:** `node --check frontend/static/js/sim3d/SimulatorApp.mjs` and inline `<script>` validation on `frontend/templates/profile.html`, `frontend/templates/simulation.html`, `frontend/templates/homepage.html`, and `frontend/templates/gallery.html` passed with exit code `0`.
- **Frontend lint & production build:** `oxlint` passed (**0 warnings, 0 errors** across 18 files) and `npm run build` compiled `frontend/instructor-dashboard/dist/` cleanly; `npm install` + `npm run build` inside `frontend/student-dashboard/` built `dist/index.html` and `dist/assets/` cleanly with `0` errors.
- **Live PostgreSQL browser walkthrough (`http://127.0.0.1:5001/`):** Tested end-to-end against PostgreSQL — instructor sign-up -> redirect to `/instructor` -> creating classrooms (`APC-7WRG`, `APC-EV52`) -> inviting student `2024-1001` -> student accepting invite and joining by code on `/profile` -> scheduling `Midterm PC Build` and `Fault Lab 1: No-POST & Inverted Airflow Rig` -> student launching `/simulator?activity=3` -> Three.js 3D Fault Lab 1 rendering cleanly with `0` `.mjs`/console errors -> clicking **Validate & Submit** -> **Save & Submit Classroom Activity** (`33%`) -> status updating to `Submitted · 33/100` on `/profile?tab=classrooms` and appearing automatically in the `/instructor` gradebook across reloads.
- **Live Side-Panel walkthrough (`Assembly-PC-(Student/Instructor/Assembly)` on `http://127.0.0.1:5001/`):** Verified Student `2024-1001` login auto-redirects to `/student/dashboard` (`0` console errors, `/static/assembly-pc-logo.svg` loaded); confirmed summary counters (`3` assigned, `1` ready to start, `2` completed), classroom/status filter pills, Classrooms tab (**Join Classroom by Code**, **Pending Invitations**, **Enrolled Classrooms**), 3D Simulator launch (`/simulator?activity=3`), validation/save (`33%`), and persisted score (`33`, `Submitted`) in `/instructor`; also verified role-aware `#navDashboardLink` (**Dashboard**) stays immediately visible on `/` and `/gallery` when signed in, navigates straight back to `/student/dashboard`, and remains hidden when logged out.
- **Isolated Docker Compose smoke check:** Verified multi-stage build, fresh DB schema init, automatic demo seeding, `/api/health`, `/api/db-check`, instructor `/instructor` auth, and student `/api/student/classrooms` endpoints.

### Known Minor Polish Items Observed
- Minor pre-existing UI polish items outside the dashboard scope were observed during browser testing: homepage hero text slightly overlapping the auth modal backdrop, and the student profile banner avatar defaulting to `U`.
- *(Resolved in commit below)* `/profile` (`Classrooms` tab) `joinForm.reset()` on successful join so the red border doesn't flash, `#tab-favorites` `Browse Gallery` links updated to `/gallery`.

---

## `Assembly-w/-Instructor` Branch Merge & 3D Workstation Activity Integration

- **Merged Branch:** `origin/ASSEMBLY-PROCESS` (`6859411`) merged into `Assembly-w/-Instructor` using **Option 1**:
  - Kept the complete Python FastAPI backend (`backend/app.py`, `backend/api/routes/instructor_dashboard.py`), PostgreSQL schema & setup scripts, Docker setup, Student Classrooms tab, and Instructor Dashboard intact.
  - Integrated the 3D Three.js PC Assembly & Wires Simulator (`frontend/static/js/sim3d/*.mjs` — 11 modules) and updated `simulation.html`, `homepage.html`, `admin-dashboard.html`, `CHANGELOG.md`, and `LICENSE`.
  - Mounted `/vendor/three/` and `/vendor/three/addons/` in `backend/app.py` (backed by `three@^0.187.0` in `frontend/instructor-dashboard/package.json` and `Dockerfile`) plus `<script type="importmap">` in `frontend/templates/simulation.html`.
- **Activity Creation Dropdown (`frontend/instructor-dashboard/src/components/ScheduleActivityModal.jsx`):**
  - Replaced the free-text activity name box with a grouped `<select>` dropdown (`WORKSTATION_ACTIVITY_GROUPS`) containing the workstation activities from `ASSEMBLY-PROCESS`:
    - **3D Workstation Troubleshooting Labs:** `Fault Lab 1: No-POST & Inverted Airflow Rig`, `Fault Lab 2: Memory Conflict & Unplugged Rails`
    - **3D Workstation Build Scenarios:** `AM5 DDR5 Workstation Build`, `Entry LGA1700 Lab PC`
  - Preserved fallback display if editing an older custom-named activity.
  - Added idempotent seeding for all 4 scenarios into `pc_scenarios` in `backend/scripts/seed_demo_accounts.py`.
- **`.mjs` MIME Type Fix (`backend/app.py`):**
  - Registered `mimetypes.add_type("application/javascript", ".mjs")` and `".js"` before mounting static files so Windows serves all 11 Three.js simulator ES modules (`frontend/static/js/sim3d/*.mjs`) as `application/javascript` instead of `text/plain`.
- **Student Classroom Activities <-> 3D Simulator Integration (`backend/api/routes/instructor_dashboard.py`, `frontend/templates/profile.html`, `frontend/static/js/sim3d/SimulatorApp.mjs`):**
  - **Backend APIs:**
    - `GET /api/student/classrooms` now includes each classroom's `activities` array (`faultLabId`, `activityType`, due date, `isLocked`, `isSubmitted`, `score`, `buildId`, `submittedAt`).
    - Added `GET /api/student/activities/{activity_id}` (enrolled students only; returns full classroom + activity metadata for `/simulator?activity=<id>`).
    - Added `POST /api/student/activities/{activity_id}/submit` (validates `score` `0..100` + optional `buildId`, enforces enrollment `403` and lock state `409`, and upserts `activity_submissions` so grades appear automatically in `/instructor`).
  - **Student Profile (`frontend/templates/profile.html`):**
    - Displays assigned activities inside each classroom card with due dates, status pills (`Assigned`, `Locked`, or `Submitted · <score>/100`), and **Launch Activity** / **Re-open Lab** links to `/simulator?activity=<id>`.
    - Added `joinForm.reset()` on successful classroom join and updated `Browse Gallery` links in Favorites to `/gallery`.
  - **3D Simulator (`frontend/static/js/sim3d/SimulatorApp.mjs`):**
    - Added `?activity=<id>` parameter loading (`_loadClassroomActivityFromUrl`), automatic Fault Lab preset / build scenario initialization, student assigned-activities switcher in the **Activity** tab (`#rtab-scenario`), and direct submission to `POST /api/student/activities/{id}/submit` via **Validate & Submit** -> **Save & Submit Classroom Activity**.

---

## `Assembly-PC-(Student/Instructor/Assembly)` — Student Dashboard SPA Integration (`b518cc0` / PR #8)

- **Selective Integration Strategy:** Built on `Assembly-w/-Instructor` and selectively ported the Student Dashboard React SPA UI and branding from `STUDENT-DASHBOARD` (`b518cc0` / PR #8) onto the existing FastAPI + PostgreSQL (`22` tables) backend without re-introducing PR #8's Node/SQLite (`server.mjs`, `server/`), `bun.lock`, or Firebase (`firebase-client.mjs`, `firestore.rules`) stack.
- **Student Dashboard SPA (`frontend/student-dashboard/` + `frontend/static/assembly-pc-logo.svg`):**
  - Added a standalone **React 18 + Vite** SPA (`package.json`, `package-lock.json`, `vite.config.js` with `base: '/student/'` on production builds and `/api` proxy via `VITE_API_TARGET`, `index.html`, `src/main.jsx`, `src/student.css`) plus `frontend/static/assembly-pc-logo.svg` extracted from `b518cc0`.
  - Provides **Dashboard** overview, **My Activities** (classroom & status filter pills, due dates, scores, built-in fallback metadata for `Fault Lab 1`, `Fault Lab 2`, `AM5 DDR5 Workstation Build`, and `Entry LGA1700 Lab PC`), and **Classrooms** management (Join by Code `#student-join-code-input`, Pending Invitations with **Accept** / **Decline**, and Enrolled Classrooms cards).
  - Unlocked activities link directly to `/simulator?activity=<id>` (`Open simulation ->` / `Re-open lab ->`), while instructor-locked activities render as non-interactive locked cards (`article[aria-disabled="true"]`), styled with the responsive theme (`#0d1b2e`, `#2aab56`, `#e9f8ee`, `#f4f6f8`, Manrope + DM Sans) from PR #8.
- **FastAPI Backend & Middleware Integration (`backend/app.py`, `backend/api/routes/instructor_dashboard.py`, `backend/core/middleware.py`):**
  - `backend/app.py`: Added `STUDENT_DIST_DIR` and `STUDENT_ASSETS_DIR`, mounted `/student/assets`, extracted shared `_render_spa_dashboard_html`, added `GET /student` and `GET /student/dashboard` (`student_dashboard_page`, injecting `window.AUTH_USER` + `sessionStorage` sync with `\u003c` escaping and role redirects), and updated student login/register + `instructor_dashboard_page` student redirects to `/student/dashboard`.
  - `backend/api/routes/instructor_dashboard.py`: Added `GET /api/student/activities` (`api_student_list_activities`) returning enrolled non-archived classroom activities enriched with `title`, `className`, `instructorName`, `description`, `tier`, `timeLimitMinutes`, `status` (`notStarted` | `locked` | `completed`), and `completion`.
  - `backend/core/middleware.py`: Added `"/student"` and `"/student/dashboard"` to `SecurityHeadersMiddleware` `Cache-Control: no-store` paths and `"/api/student/activities"` to `AuditLoggingMiddleware.AUDIT_PATHS`.
- **Template Navigation Links (`frontend/templates/homepage.html`, `frontend/templates/gallery.html`, `frontend/templates/simulation.html`, `frontend/templates/profile.html`):**
  - Added hidden-by-default role-aware Dashboard navigation links (`#navDashboardLink` in `homepage.html` & `gallery.html` pointing to `/student/dashboard`, `/instructor`, or `/admin`; `#btnStudentDashboard` in `simulation.html` & `#studentDashboardNav` in `profile.html` pointing to `/student/dashboard`), revealed only for authenticated sessions so logged-in students keep the Dashboard link after navigating Home or to Gallery.
- **Docker, `.dockerignore` & Automated Tests (`Dockerfile`, `.dockerignore`, `backend/tests/test_instructor_dashboard.py`):**
  - `Dockerfile`: Kept `Stage 1` (`frontend-builder`), added `Stage 2` (`student-builder`, `FROM node:22-alpine AS student-builder`) building `frontend/student-dashboard`, updated the Python runtime to `Stage 3` copying `frontend/student-dashboard/dist`, and added `test -f /app/frontend/student-dashboard/dist/index.html` to build-time asset verification.
  - `.dockerignore`: Added `frontend/student-dashboard/dist` right after `frontend/instructor-dashboard/dist`.
  - `backend/tests/test_instructor_dashboard.py`: Updated student redirect assertions to `/student/dashboard`, extended `_FakeCursor` for `GET /api/student/activities`, and added `test_student_activities_list_endpoint` and `test_student_html_route_redirects_and_auth_injection` (13/13 tests passing on mocked DB store).
