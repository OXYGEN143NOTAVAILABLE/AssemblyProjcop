"""
docker_entrypoint.py
Container startup entrypoint:
1. Waits until PostgreSQL is reachable.
2. Initializes the database and base schema once (preserving existing data across restarts).
3. Ensures auth and instructor dashboard tables exist.
4. Optionally seeds demo accounts when SEED_DEMO_ACCOUNTS=true.
5. Starts Uvicorn in-place as the main process.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import psycopg2

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent

for path in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)


def wait_for_postgres(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    db_host = os.getenv("DB_HOST", "db")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "database")

    for attempt in range(1, max_attempts + 1):
        try:
            conn = psycopg2.connect(
                host=db_host,
                port=db_port,
                database="postgres",
                user=db_user,
                password=db_password,
            )
            conn.close()
            print(f"[entrypoint] PostgreSQL is ready at {db_host}:{db_port}")
            return
        except Exception as exc:
            print(
                f"[entrypoint] Waiting for PostgreSQL ({attempt}/{max_attempts}): {exc}"
            )
            time.sleep(delay_seconds)

    raise RuntimeError(f"PostgreSQL did not become ready at {db_host}:{db_port}")


def initialize_database_if_needed() -> None:
    from setup_database import create_database_if_not_exists, load_schema

    if not create_database_if_not_exists():
        raise RuntimeError("Failed to create or verify target PostgreSQL database")

    db_host = os.getenv("DB_HOST", "db")
    db_port = int(os.getenv("DB_PORT", "5432"))
    db_name = os.getenv("DB_NAME", "pc_builder_simulation")
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "database")

    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_password,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.admin_cpu');")
            row = cur.fetchone()
            already_initialized = bool(row and row[0])
    finally:
        conn.close()

    if already_initialized:
        print("[entrypoint] Base schema already present; keeping existing data.")
    else:
        print("[entrypoint] Fresh database detected; loading base schema...")
        if not load_schema():
            raise RuntimeError("Failed to load database schema")


def main() -> None:
    wait_for_postgres()
    initialize_database_if_needed()

    import app
    from seed_demo_accounts import seed_demo_accounts

    app.ensure_auth_tables()

    if os.getenv("SEED_DEMO_ACCOUNTS", "true").strip().lower() in {"1", "true", "yes"}:
        result = seed_demo_accounts()
        print(f"[entrypoint] Demo accounts ready: {result}")

    host = os.getenv("APP_HOST", "0.0.0.0")
    port = os.getenv("APP_PORT", "5000")
    print(f"[entrypoint] Starting Uvicorn on {host}:{port}")
    os.execvp(
        sys.executable,
        [sys.executable, "-m", "uvicorn", "app:app", "--host", host, "--port", str(port)],
    )


if __name__ == "__main__":
    main()
