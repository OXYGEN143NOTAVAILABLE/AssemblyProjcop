# Assembly PC Simulator

A web-based educational PC assembly simulator built with FastAPI and PostgreSQL. Learn computer hardware compatibility, component selection, and system building through an interactive interface.

## Features

- **Interactive PC Builder**: Drag-and-drop interface to assemble virtual PCs
- **Admin Dashboard**: Manage PC components, set requirements, and track student progress
- **Student Profiles**: Track builds, badges, and completed scenarios
- **Compatibility Checker**: Real-time validation of component compatibility
- **Instructor Tools**: Create custom scenarios and assignments
- **Database Schema Sync**: Automatic synchronization between SQL files and database

## Project Structure

```
AssemblyProjTest4/
├── backend/                          # FastAPI application
│   ├── config/                       # Configuration modules
│   ├── core/                         # Core database connection
│   ├── api/                          # API routes
│   ├── schemas/                      # Database schema files
│   ├── scripts/                      # Database and sync scripts
│   ├── app.py                        # Main FastAPI application
│   ├── database.py                   # Database connection utilities
│   ├── .env                          # Environment variables (local)
│   └── requirements.txt              # Python dependencies
│
├── frontend/                         # React + Vite application
│   ├── index.html
│   ├── src/                           # React pages, components, and API client
│   ├── templates/                    # Retained legacy templates (not served)
│   ├── static/                       # Built React assets and static files
│   ├── package.json
│   └── vite.config.js
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
├── README.md                         # This file
├── requirements.txt                  # Python dependencies
├── .env.example                      # Example environment variables
├── .gitignore                        # Git ignore file
└── .git/                             # Git repository
```

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+ and npm
- PostgreSQL 12+
- Virtual environment (venv, conda, etc.)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AssemblyProjTest4
   ```

2. **Set up Python environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Initialize database**
   ```bash
   python scripts/setup_database.py
   ```

5. **Run the application**
   ```bash
   cd ../frontend
   npm install
   npm run build
   cd ../backend
   python app.py
   ```

   Application will be available locally at: `http://127.0.0.1:5000`

   To open it from another device on the same Wi-Fi/LAN, use the LAN URL printed in the terminal, for example:
   ```text
   http://192.168.1.23:5000
   ```

   If another device cannot open it, allow Python/Uvicorn through Windows Firewall for private networks.

### Frontend development

Run the React dev server in one terminal; it proxies API requests to FastAPI on port 5000:

```bash
cd frontend
npm install
npm run dev
```

For production or to use the frontend through FastAPI, build the React app with `npm run build`. FastAPI serves the built app for user-facing pages and keeps the existing `/api/*` endpoints as the backend.

Students can sign in from the homepage and are taken to the React dashboard at `/student/dashboard`. Published instructor activities appear there; selecting one opens the existing simulator with that scenario loaded. Build the dashboard with `npm run build` before starting the server.

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
- **Frontend**: HTML5, JavaScript, CSS
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
