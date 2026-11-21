# Assembly PC Simulator

A web-based educational PC assembly simulator built with FastAPI and PostgreSQL. Learn computer hardware compatibility, component selection, and system building through an interactive interface.

## Features

- **3D Three.js PC Assembly & Wires Workstation (`/simulator`)**: Interactive 3D PC assembly, snap-to-mount alignment, fastener locking, 3D cable routing, POST/BIOS monitor diagnostics, and pre-built Troubleshooting Fault Labs
- **Instructor Dashboard (`/instructor`)**: React 19 + Vite dashboard for classroom creation, student invitations/roster, dropdown activity scheduling (`Fault Lab 1`, `Fault Lab 2`, `AM5 DDR5 Workstation Build`, `Entry LGA1700 Lab PC`), activity lock controls, and gradebook tracking
- **Student Dashboard (`/student/dashboard`) & Direct 3D Lab Launch**: React 18 + Vite dashboard where students view assigned activities, join classrooms by code, accept/decline instructor invitations, track completion & grades, and launch assigned 3D labs (`/simulator?activity=<id>`) directly into the classroom gradebook (with classroom management also accessible via `/profile` -> Classrooms)
- **Admin Dashboard (`/admin`)**: Manage PC components, user accounts, and platform metrics
- **Compatibility Checker**: Real-time validation of physical clearance, socket, memory, power, and cabling compatibility
- **Database Schema Sync**: Automatic synchronization between SQL files and PostgreSQL

## Project Structure

```
AssemblyProj/
├── backend/                          # FastAPI application
│   ├── config/                       # Configuration modules
│   ├── core/                         # Auth, validators & security middleware
│   ├── api/routes/                   # Classroom, instructor & student REST routes
│   ├── schemas/                      # Database schema files (22 tables)
│   ├── scripts/                      # Setup, demo seeder, sync & Docker entrypoint scripts
│   ├── tests/                        # Unit & integration tests
│   ├── app.py                        # Main FastAPI application (.mjs MIME + /vendor/three mounts)
│   ├── database.py                   # Database connection utilities
│   ├── .env                          # Environment variables (local)
│   └── requirements.txt              # Python dependencies
│
├── frontend/                         # Frontend assets
│   ├── instructor-dashboard/         # React 19 + Vite Instructor Dashboard SPA + Three.js package
│   │   ├── src/                      # Dashboard views, modals, state & API adapters
│   │   ├── dist/                     # Built SPA bundle served at /instructor
│   │   └── package.json              # React, Vite, and three@^0.187.0 dependencies
│   ├── student-dashboard/            # React 18 + Vite Student Dashboard SPA
│   │   ├── src/                      # Dashboard overview, activities, classrooms & invite actions
│   │   ├── dist/                     # Built SPA bundle served at /student/dashboard
│   │   └── package.json              # React 18 and Vite dependencies
│   ├── templates/                    # HTML templates
│   │   ├── homepage.html             # Home page
│   │   ├── simulation.html           # 3D PC simulator interface
│   │   ├── admin-dashboard.html      # Admin panel
│   │   ├── gallery.html              # Build gallery
│   │   ├── profile.html              # User profile & Student Classrooms tab
│   │   └── search.html               # Search interface
│   └── static/                       # Static files
│       ├── js/sim3d/                 # 11 modular Three.js 3D simulator ES modules (*.mjs)
│       ├── js/                       # Additional JavaScript files
│       ├── css/                      # Stylesheets
│       └── assets/                   # Images and other assets
│
├── docs/                             # Documentation
│   ├── SETUP_INSTRUCTIONS.md         # Quick setup guide
│   ├── SCHEMA_SYNC_GUIDE.md          # Database schema sync documentation
│   ├── QUICK_REFERENCE.md            # Command quick reference
│   ├── IMPLEMENTATION_SUMMARY.md     # Technical details
│   └── FILE_INDEX.md                 # File organization
│
├── scripts/                          # Utility scripts
│   ├── sync_schema.bat               # Windows schema sync helper
│   └── sync_schema.sh                # Linux/Mac schema sync helper
│
├── Dockerfile                        # Multi-stage container build (Instructor & Student SPAs + Three.js + FastAPI)
├── docker-compose.yml                # One-command App + PostgreSQL setup
├── .dockerignore                     # Excludes local .venv / node_modules from image
├── progress.md                       # Branch progress & diff summary
├── README.md                         # This file
├── .gitignore                        # Git ignore file
└── .git/                             # Git repository
```

## How to Run the Project

You can run Assembly PC in **two ways**:
- **Option A (Docker):** Best for colleagues who just want to test right away—no Python, Node.js, or PostgreSQL installation needed (just Docker Desktop).
- **Option B (Local Dependencies):** Best if you already have Python, Node.js, and PostgreSQL/pgAdmin installed locally and want to develop directly on your machine.

---

### Option A: Run with Docker (Recommended for Testing)

**Prerequisites:** Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. **Clone the repository and switch to the `Assembly-PC-(Student/Instructor/Assembly)` branch:**
   ```bash
   git clone https://github.com/Zary-bot/AssemblyProj.git
   cd AssemblyProj
   git checkout "Assembly-PC-(Student/Instructor/Assembly)"
   ```

2. **Build and start the entire stack (PostgreSQL + Instructor & Student Dashboards + 3D Simulator + FastAPI):**
   ```bash
   docker compose up --build
   ```
   On first startup, Docker automatically:
   - Starts PostgreSQL 16 (`assemblypc-db`) and creates the `pc_builder_simulation` database
   - Builds both the React Instructor Dashboard (`frontend/instructor-dashboard/dist`) and React Student Dashboard (`frontend/student-dashboard/dist`) SPAs, and vendors the Three.js 3D engine under `/vendor/three/`
   - Loads all 22 tables + sample PC hardware components
   - Seeds the ready-to-use demo accounts (Instructor, 2 Students, Admin) and all 4 3D workstation scenarios (`Fault Lab 1`, `Fault Lab 2`, `AM5 DDR5 Workstation Build`, `Entry LGA1700 Lab PC`)
   - Starts the web server (`assemblypc-app`) on port `5000` (with `.mjs` ES module MIME types registered for `/simulator`)

3. **Open the app in your browser:**
   - Homepage: `http://localhost:5000/`
   - Admin Login: `http://localhost:5000/admin/login`
   - API Docs: `http://localhost:5000/docs`

4. **Helpful Docker commands:**
   - **Stop containers (keeps your saved data):**
     ```bash
     docker compose down
     ```
   - **Stop and wipe database completely (fresh reset):**
     ```bash
     docker compose down -v
     ```
   - **If port `5000` or `5432` is already in use on your PC:**
     - Mac/Linux:
       ```bash
       APP_PORT=5001 DB_EXTERNAL_PORT=5433 docker compose up --build
       ```
     - Windows PowerShell:
       ```powershell
       $env:APP_PORT="5001"; $env:DB_EXTERNAL_PORT="5433"; docker compose up --build
       ```

---

### Option B: Run Manually Using Local Dependencies

**Prerequisites:**
- Python 3.10+
- Node.js 18+ (and `npm`)
- PostgreSQL 12+ running locally (default port `5432`)

1. **Clone and checkout the branch:**
   ```bash
   git clone https://github.com/Zary-bot/AssemblyProj.git
   cd AssemblyProj
   git checkout "Assembly-PC-(Student/Instructor/Assembly)"
   ```

2. **Create and activate a Python virtual environment, then install backend packages:**
   ```bash
   cd backend
   python -m venv .venv
   # On Windows PowerShell:
   .\.venv\Scripts\Activate.ps1
   # On Mac/Linux:
   # source .venv/bin/activate

   pip install -r requirements.txt
   ```

3. **Configure environment variables:**
   Copy `backend/.env.example` to `backend/.env` and make sure your local PostgreSQL credentials match:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=pc_builder_simulation
   DB_USER=postgres
   DB_PASSWORD=database
   APP_HOST=0.0.0.0
   APP_PORT=5000
   ENVIRONMENT=development
   ```

4. **Initialize PostgreSQL tables and seed demo accounts:**
   From inside `backend/` (with `.venv` activated):
   ```bash
   python scripts/setup_database.py
   python scripts/seed_demo_accounts.py
   ```

5. **Build the Instructor & Student Dashboard frontends (and install Three.js for `/simulator`):**
   From `backend/`, build both SPAs:
   ```bash
   cd ../frontend/instructor-dashboard
   npm install
   npm run build

   cd ../student-dashboard
   npm install
   npm run build
   ```
   > Note: Running `npm install` inside `frontend/instructor-dashboard` also installs `three` (`node_modules/three`), which FastAPI serves at `/vendor/three/` for the 3D simulator on `/simulator`.
   > Tip: During frontend UI development, you can run `npm run dev` in `frontend/instructor-dashboard` (port `5173`) or `npm run dev -- --port 5174` in `frontend/student-dashboard` (port `5174`) — requests to `/api/*` in both SPAs automatically proxy to `http://127.0.0.1:5000` (or set `VITE_API_TARGET=http://127.0.0.1:5001` if your backend uses another port).

6. **Start the FastAPI backend server:**
   ```bash
   cd ../../backend
   python app.py
   ```
   Open `http://127.0.0.1:5000/` in your browser.

---

## Existing Accounts (Email, ID & Password for Testing)

These accounts are created automatically in Docker (and via `python scripts/seed_demo_accounts.py` for local installs):

| Role | Login Field on `/` or `/admin/login` | Email | Password | Landing Page & Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Instructor** | Email: `prof.maria@lnu.edu.ph` | `prof.maria@lnu.edu.ph` | `Instructor123!` | Lands on `/instructor` — create classrooms, invite students, schedule & grade activities |
| **Student 1** | Student ID: `2024-1001` | `ana.reyes@lnu.edu.ph` | `Student123!` | Lands on `/student/dashboard` — view assigned activities, join classrooms or accept invites, and launch 3D labs via `/simulator?activity=<id>` |
| **Student 2** | Student ID: `2024-1002` | `carlos.mendoza@lnu.edu.ph` | `Student123!` | Lands on `/student/dashboard` — extra student for multi-student classroom, capacity, and grading tests |
| **Admin** | Username: `admin` (`/admin/login`) | — | `admin123` | Lands on `/admin` — manage PC parts catalog, compatibility tests, and user accounts |

> **Important notes when testing:**
> - **Students sign in using their Student ID** (e.g. `2024-1001`), not their email.
> - **Instructors can invite students** using either their Student ID (`2024-1001`) **or** their email (`ana.reyes@lnu.edu.ph`).
> - If you register a **brand-new Instructor account** on `/`, the email must end with `@lnu.edu.ph`.

### Quick Testing Scenarios (Use Cases)

1. **Instructor creates classrooms & invites a student:**
   - Open `http://localhost:5000/`, click **Login / Sign Up** → **Instructor**, and sign in with `prof.maria@lnu.edu.ph` / `Instructor123!`.
   - You land on `/instructor`. Click **+ New Classroom** to create **PC Assembly Lab A** (note its generated `APC-XXXX` join code).
   - Create a second classroom (**Hardware Diagnostics B**), open its **Students List** tab, click **+ Invite Student**, and invite `2024-1001` (or `ana.reyes@lnu.edu.ph`).
   - Open the bottom-left `...` menu in the sidebar and click **Log out**.

2. **Student joins via Join Code AND Invitation:**
   - Click **Login / Sign Up** → **Student**, and sign in with Student ID `2024-1001` / `Student123!`.
   - You land on `/student/dashboard`. Open the **Classrooms** tab in the dashboard sidebar (or visit `/profile` → **Classrooms**).
   - Click **Accept** on the pending invitation for **Hardware Diagnostics B**.
   - Enter the `APC-XXXX` code for **PC Assembly Lab A** and click **Join Classroom**—both classrooms and their assigned activities appear immediately.

3. **Instructor schedules a 3D Workstation activity & student launches + submits it in `/simulator`:**
   - Log back in as `prof.maria@lnu.edu.ph` / `Instructor123!`, open **PC Assembly Lab A** -> **Schedule Activity**, and pick **Fault Lab 1: No-POST & Inverted Airflow Rig** (or **AM5 DDR5 Workstation Build**) from the **Activity Name** dropdown.
   - Sign in as Student `2024-1001` / `Student123!`. On `/student/dashboard` (under **Dashboard** or **My Activities**), locate the scheduled activity for **PC Assembly Lab A**, and click the activity card to launch `/simulator?activity=<id>`.
   - The 3D workstation opens with the assigned rig/objectives loaded. Diagnose or assemble the build in 3D, click **Validate & Submit** -> **Save & Submit Classroom Activity**—your score (`0–100`) updates on `/student/dashboard` (and `/profile` → **Classrooms**) and automatically syncs into the classroom gradebook on `/instructor`.

4. **Instructor verifies enrollment, grades, and database persistence:**
   - Log back in as `prof.maria@lnu.edu.ph` / `Instructor123!`.
   - Open **PC Assembly Lab A** -> **Students List** to see **Ana Reyes** enrolled.
   - Open the scheduled activity in `/instructor` to see **Ana Reyes**'s submitted 3D score (`0–100`), adjust or clear a score manually when unlocked, and reload the page to confirm everything persists in PostgreSQL.

---

## Database Schema Synchronization

Automatically keep your PostgreSQL database in sync with schema changes:

### Development (Auto-sync on file changes)
```bash
cd backend
python scripts/schema_sync.py --watch
```

### Manual Sync
```bash
cd backend
python scripts/schema_sync.py --sync
```

### Check Sync Status
```bash
cd backend
python scripts/schema_sync.py --status
```

### Windows Users
Double-click `scripts/sync_schema.bat` for interactive menu.

For detailed documentation, see [docs/SCHEMA_SYNC_GUIDE.md](docs/SCHEMA_SYNC_GUIDE.md)

## API Endpoints

### Authentication
- `POST /api/auth/register/student` - Register as student
- `POST /api/auth/register/instructor` - Register as instructor
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Components
- `GET /api/components` - List all components
- `GET /api/components/{category}` - Components by category
- `GET /api/components/{category}/{id}` - Component details

### Builds
- `GET /api/builds` - List user's builds
- `POST /api/builds` - Create new build
- `GET /api/builds/{id}` - Build details
- `PUT /api/builds/{id}` - Update build
- `DELETE /api/builds/{id}` - Delete build

### Scenarios
- `GET /api/scenarios` - List all scenarios
- `GET /api/scenarios/{id}` - Scenario details
- `POST /api/scenarios/{id}/complete` - Mark scenario as complete

## Default Credentials

After initialization, use these credentials to access the admin dashboard:

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change these credentials before deploying to production!

## Environment Variables

See `.env.example` for all available configuration options:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pc_builder_simulation
DB_USER=postgres
DB_PASSWORD=your_password
ADMIN_SECRET=your_secret_key
```

## Development

### Running Tests
```bash
cd backend
pytest
```

### Code Formatting
```bash
cd backend
black *.py
```

### Linting
```bash
cd backend
pylint *.py
```

## Deployment

### Database Migration
```bash
cd backend
python scripts/schema_sync.py --sync
```

### Production Settings
1. Update `.env` with production database credentials
2. Set `ADMIN_SECRET` to a strong random value
3. Change admin password in database
4. Run with production ASGI server (Gunicorn, Uvicorn with workers, etc.)

### Using Gunicorn
```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## Documentation

- [Quick Setup Guide](docs/SETUP_INSTRUCTIONS.md) - 5-minute setup
- [Schema Sync Guide](docs/SCHEMA_SYNC_GUIDE.md) - Database schema management
- [Quick Reference](docs/QUICK_REFERENCE.md) - Command reference
- [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) - Technical details

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check `.env` file credentials
- Run `python scripts/schema_sync.py --status` to diagnose

### Template Not Found
- Ensure templates are in `frontend/templates/`
- Check that template names match exactly (case-sensitive on Linux/Mac)

### Schema Out of Sync
- Run `python scripts/schema_sync.py --sync` to apply pending changes
- Check `schema_versions` table for history

For more troubleshooting, see [docs/SCHEMA_SYNC_GUIDE.md](docs/SCHEMA_SYNC_GUIDE.md#troubleshooting)

## Project Features

### For Students
- Build custom PC configurations
- Learn component compatibility
- Complete instructor-created scenarios
- Track progress and earn badges
- Share builds with community

### For Instructors
- Create custom scenarios and assignments
- Manage component catalog
- Track student progress
- View analytics and completions
- Create troubleshooting scenarios

### For Administrators
- Manage all system components
- User and permission management
- Database administration
- System monitoring

## Technologies Used

- **Backend**: FastAPI, Python 3.8+
- **Database**: PostgreSQL 12+
- **Frontend**: React 18 & 19 (Vite SPAs for Student & Instructor Dashboards), Three.js, HTML5, JavaScript, CSS
- **Server**: Uvicorn / Gunicorn
- **Version Control**: Git

## Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Make your changes
3. Test locally (`python app.py`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

This project is part of an educational initiative. Please check the LICENSE file for details.

## Support

For issues, questions, or suggestions, please:
1. Check the [troubleshooting guide](docs/SCHEMA_SYNC_GUIDE.md#troubleshooting)
2. Review existing documentation in `/docs`
3. Check database schema in `backend/schemas/database_schema.sql`

## Changelog

### Version 2.0.0
- Reorganized project structure for better maintainability
- Added automatic schema synchronization system
- Implemented database version tracking
- Improved frontend/backend separation
- Enhanced documentation

---

**Created**: May 2026  
**Status**: Active Development  
**Last Updated**: May 22, 2026
