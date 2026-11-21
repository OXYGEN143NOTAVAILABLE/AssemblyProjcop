"""
setup_database.py
Initializes the PostgreSQL database with schema and sample data.
Run this from backend/ folder:

    python scripts/setup_database.py

Uses schema_sync.py for automatic schema management.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "pc_builder_simulation")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "database")


def create_database_if_not_exists():
    """Create the database if it doesn't exist."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=int(DB_PORT),
            database="postgres",
            user=DB_USER,
            password=DB_PASSWORD,
        )
        conn.autocommit = True
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
        if not cursor.fetchone():
            print(f"Creating database: {DB_NAME}")
            cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DB_NAME)))
            print(f"✓ Database '{DB_NAME}' created successfully")
        else:
            print(f"✓ Database '{DB_NAME}' already exists")

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"✗ Error creating database: {e}")
        return False
    return True


def load_schema():
    """Load database_schema_fixed.sql into the database."""
    try:
        # Import and use schema_sync for intelligent schema loading
        from schema_sync import apply_schema, create_version_table

        if not create_version_table():
            print("✗ Failed to create version tracking table")
            return False

        print("Loading database_schema_fixed.sql (tables + sample data)...")
        success = apply_schema(force=True)

        if success:
            print("✓ Schema loaded successfully")
        else:
            print("✗ Failed to load schema")
            return False

        return success

    except ImportError:
        print("⚠ schema_sync.py not found, using legacy loader...")
        # Fallback to legacy method
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                port=int(DB_PORT),
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
            )
            cursor = conn.cursor()

            schema_file = BACKEND_DIR / "schemas" / "database_schema.sql"
            with open(schema_file, "r") as f:
                schema_sql = f.read()

            print("Loading database_schema_fixed.sql (tables + sample data)...")
            cursor.execute(schema_sql)
            conn.commit()
            print("✓ Schema loaded successfully")

            cursor.close()
            conn.close()
            return True
        except Exception as e:
            print(f"✗ Error loading schema: {e}")
            return False
    except Exception as e:
        print(f"✗ Error loading schema: {e}")
        return False


def verify_data():
    """Quick check that data was inserted."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=int(DB_PORT),
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )
        cursor = conn.cursor()

        tables = [
            "admin_cpu",
            "admin_mobo",
            "admin_ram",
            "admin_gpu",
            "admin_psu",
            "admin_ssd",
            "admin_hdd",
            "admin_fan",
            "compatibility_test_cases",
            "admin_users",
            "student_users",
            "pc_scenarios",
            "saved_builds",
            "build_favorites",
            "build_hearts",
            "user_badges",
            "scenario_completions",
            "classrooms",
            "classroom_enrollments",
            "classroom_invitations",
            "classroom_activities",
            "activity_submissions",
        ]
        print("\nRow counts:")
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"✗ Error verifying data: {e}")


if __name__ == "__main__":
    print("=" * 50)
    print("Setting up pc_builder_simulation database...")
    print("=" * 50)

    if create_database_if_not_exists():
        if load_schema():
            verify_data()
            print("\n✓ Setup complete! Run: python app.py")
        else:
            print("\n✗ Schema loading failed")
    else:
        print("\n✗ Database creation failed")
        print("\nMake sure PostgreSQL is running and your credentials are correct.")
        print(f"  Host: {DB_HOST}:{DB_PORT}")
        print(f"  User: {DB_USER}")
        print(f"  DB:   {DB_NAME}")
