# AssemblyPC Backend

FastAPI serves the pages and APIs. PostgreSQL is the only source of component data.

Full system documentation is available at `../SYSTEM_DOCUMENTATION.md`.

## Run

```bash
cd backend
pip install -r requirements.txt
python scripts/setup_database.py
python app.py
```

## Pages

- Home: http://127.0.0.1:5000/
- Simulator: http://127.0.0.1:5000/simulator
- Admin: http://127.0.0.1:5000/admin
- API docs: http://127.0.0.1:5000/docs

## Main Files

- `app.py`: FastAPI routes and PostgreSQL API mapping
- `database.py`: PostgreSQL connection
- `schemas/database_schema.sql`: admin component tables and seed data
- `scripts/setup_database.py`: creates database and loads schema
- `../frontend/templates/admin-dashboard.html`: admin CRUD UI
- `../frontend/static/js/simulator.js`: simulator component loader and drag/drop logic

## Database Tables

- `admin_cpu`
- `admin_gpu`
- `admin_psu`
- `admin_ssd`
- `admin_hdd`
- `admin_fan`
- `admin_mobo`
- `admin_ram`
- `saved_builds`
