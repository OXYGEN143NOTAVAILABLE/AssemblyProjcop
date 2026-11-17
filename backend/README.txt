# AssemblyPC Backend

FastAPI serves the built React application and APIs. PostgreSQL is the only source of component data.

Full system documentation is available at `../SYSTEM_DOCUMENTATION.md`.

## Run

```bash
cd frontend
npm install
npm run build
cd ../backend
pip install -r requirements.txt
python scripts/setup_database.py
python app.py
```

For frontend development, run `npm run dev` from `frontend`; Vite proxies `/api` requests to FastAPI on port 5000.

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
- `../frontend/src/`: React application, built to `../frontend/static/app/`

The files under `../frontend/templates/` and `../frontend/static/js/` are retained as migration references; the application page routes serve the React frontend.

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
