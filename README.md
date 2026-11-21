# Assembly PC Simulator

An interactive 3D educational PC assembly simulator built with **Node.js + Express 5**, **SQLite (`node:sqlite`)**, and **Three.js**. Learn PC hardware compatibility, physical assembly sequencing, thermal/power budgeting, cabling, and troubleshooting inside a virtual ESD-safe 3D workstation.

## Features

- **3D Drag & Drop Workstation**: Assemble cases, motherboards, CPUs, coolers, RAM, GPUs, storage drives, PSUs, and case fans on an ESD bench prep pad and inside the chassis using procedural 3D hardware models (`Three.js`).
- **3D Hardware Inspector**: Orbit 360° and flip individual parts to inspect sockets, keying notches, pinouts, and connectors.
- **Physical Cabling & POST Monitor**: Route ATX 24-pin, EPS 8-pin, PCIe, SATA power/data, fan, and front-panel headers, then power on to inspect BIOS/POST diagnostics.
- **Validation & Troubleshooting Labs**: Includes guided procedure modes (`Bench-First`, `Case-First`, `Open Lab`) and pre-built fault-diagnosis presets.
- **Student, Instructor & Admin Workflows**: Role-based authentication, saved builds, community gallery, public profiles, instructor scenario publishing, and an admin hardware/user management dashboard.

## Project Structure

```
.
├── server.mjs                          # Express 5 server, API routes, auth, & template serving
├── server/
│   ├── db.mjs                          # SQLite persistence layer (node:sqlite -> server/data/assemblypc.db)
│   ├── logic.mjs                       # Compatibility rules, power math, and catalog adapters
│   ├── seedData.mjs                    # Initial component catalog, student/admin/instructor accounts
│   ├── logic.test.mjs                  # Backend & compatibility unit tests
│   └── sim3d.test.mjs                  # 3D snapping, assembly, validation, & fault-lab tests
├── frontend/
│   ├── templates/                      # Served HTML pages (homepage, simulation, gallery, profile, search, admin)
│   └── static/js/
│       ├── firebase-client.mjs         # Optional Firebase client SDK bootstrap & probe
│       └── sim3d/                      # Modular 3D workstation engine (SceneManager, AssemblyManager, etc.)
├── firestore.rules                     # Firestore security rules
├── firebase-blueprint.json             # Firestore collection schema blueprint
├── security_spec.md                    # Firestore security invariants
└── package.json
```

## Quick Start

### Prerequisites

- **Node.js 22+** (uses built-in `node:sqlite` and `node:test`)
- **npm**

### Installation & Running

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000`.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Express server (`node server.mjs`) on port 3000 |
| `npm run build` | Builds the React student dashboard (`/student/dashboard`) into `frontend/static/student-app/` |
| `npm start` | Starts Express server (`node server.mjs`) |
| `npm test` | Runs unit & 3D logic tests (`node --test server/logic.test.mjs server/sim3d.test.mjs`) |
| `npm run lint` | Validates `firestore.rules` with `@firebase/eslint-plugin-security-rules` |

Students can sign in from the homepage and are taken to the React dashboard at `/student/dashboard` (static preview available at `/static/student-dashboard-preview.html`). Published instructor activities appear there; selecting one opens the 3D simulator with that scenario loaded.

## Default Accounts (Development Seed)

- **Student**: Student ID `2024-0001` / Password `student123`
- **Instructor**: Email `instructor@lnu.edu.ph` / Password `instructor123`
- **Admin**: Username `admin` / Password `admin123` (via `/admin/login` or `Shift+A+D`)

Change default credentials and set `ADMIN_SECRET` before deploying to production.
