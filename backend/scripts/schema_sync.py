"""
schema_sync.py
Automatic schema synchronization system for pgAdmin 4.
Tracks schema versions and applies pending migrations.

Usage:
    python schema_sync.py --sync           # Auto-detect and apply changes
    python schema_sync.py --force          # Force full schema reload
    python schema_sync.py --status         # Check sync status
    python schema_sync.py --watch          # Watch file for changes (dev mode)
"""

import os
import sys
import json
import hashlib
import argparse
import time
from pathlib import Path
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

import psycopg2
from psycopg2 import sql

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "pc_builder_simulation")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "database")

SCHEMA_FILE = BACKEND_DIR / "schemas" / "database_schema.sql"
VERSION_FILE = BACKEND_DIR / ".schema_version"


def get_file_hash(file_path: Path) -> str:
    """Calculate SHA256 hash of the SQL file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def get_db_connection():
    """Return a new PostgreSQL connection."""
    return psycopg2.connect(
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


def create_version_table():
    """Create schema_versions table if it doesn't exist."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_versions (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                file_hash VARCHAR(64) NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'applied'
            );
        """)
        conn.commit()
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"✗ Error creating version table: {e}")
        return False


def get_current_file_hash() -> str:
    """Get hash of the current schema file."""
    if not SCHEMA_FILE.exists():
        print(f"✗ Schema file not found: {SCHEMA_FILE}")
        sys.exit(1)
    return get_file_hash(SCHEMA_FILE)


def get_latest_db_version() -> Optional[dict]:
    """Get the latest applied schema version from database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, version, file_hash, applied_at, status 
            FROM schema_versions 
            WHERE status = 'applied'
            ORDER BY applied_at DESC 
            LIMIT 1;
        """)
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            return {
                "id": row[0],
                "version": row[1],
                "file_hash": row[2],
                "applied_at": row[3],
                "status": row[4],
            }
        return None
    except Exception as e:
        print(f"✗ Error querying version: {e}")
        return None


def check_sync_status():
    """Check if schema is in sync with file."""
    print("\n" + "=" * 60)
    print("SCHEMA SYNC STATUS")
    print("=" * 60)

    current_hash = get_current_file_hash()
    db_version = get_latest_db_version()

    print(f"\nSchema file: {SCHEMA_FILE}")
    print(f"Current file hash: {current_hash[:16]}...")

    if db_version:
        print(f"\nDatabase version: {db_version['version']}")
        print(f"Database hash: {db_version['file_hash'][:16]}...")
        print(f"Applied at: {db_version['applied_at']}")

        if db_version['file_hash'] == current_hash:
            print("\n✓ Schema is IN SYNC with database")
            return True
        else:
            print("\n⚠ Schema is OUT OF SYNC - Changes detected")
            return False
    else:
        print("\n⚠ No version recorded in database")
        print("  Run 'python schema_sync.py --sync' to initialize")
        return False


def apply_schema(force: bool = False):
    """Apply or update schema to database."""
    print("\n" + "=" * 60)
    print("SCHEMA SYNCHRONIZATION")
    print("=" * 60)

    if not SCHEMA_FILE.exists():
        print(f"✗ Schema file not found: {SCHEMA_FILE}")
        return False

    current_hash = get_current_file_hash()
    db_version = get_latest_db_version()

    # Check if already in sync
    if not force and db_version and db_version['file_hash'] == current_hash:
        print("\n✓ Schema is already in sync with the database")
        return True

    if db_version and not force:
        print("\n⚠ Schema changes detected!")
        print(f"Current version: {db_version['version']}")
        print("Use '--force' to reload schema")
        return False

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print(f"\nLoading schema from: {SCHEMA_FILE.name}")
        with open(SCHEMA_FILE, "r") as f:
            schema_sql = f.read()

        # Execute schema
        cursor.execute(schema_sql)

        # Record version
        version_name = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        cursor.execute("""
            INSERT INTO schema_versions (version, file_hash, status)
            VALUES (%s, %s, 'applied')
        """, (version_name, current_hash))

        conn.commit()
        cursor.close()
        conn.close()

        print(f"✓ Schema applied successfully (version: {version_name})")
        print(f"✓ File hash recorded: {current_hash[:16]}...")
        return True

    except Exception as e:
        print(f"✗ Error applying schema: {e}")
        try:
            conn.rollback()
        except:
            pass
        return False


def watch_for_changes():
    """Watch schema file for changes and auto-sync (dev mode)."""
    print("\n" + "=" * 60)
    print("SCHEMA WATCHER (DEV MODE)")
    print("=" * 60)
    print(f"Watching: {SCHEMA_FILE}")
    print("Press Ctrl+C to stop\n")

    last_hash = get_current_file_hash()

    try:
        while True:
            time.sleep(2)  # Check every 2 seconds
            current_hash = get_current_file_hash()

            if current_hash != last_hash:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] ✓ Schema file changed - Syncing...")
                if apply_schema(force=True):
                    print("✓ Auto-sync completed")
                    last_hash = current_hash
                else:
                    print("✗ Auto-sync failed - retrying on next change")
    except KeyboardInterrupt:
        print("\n\n✓ Watcher stopped")


def main():
    parser = argparse.ArgumentParser(
        description="Schema synchronization for pgAdmin 4",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python schema_sync.py --sync      Auto-detect and apply changes
  python schema_sync.py --force     Force full schema reload
  python schema_sync.py --status    Check if in sync
  python schema_sync.py --watch     Watch file for changes (dev mode)
        """
    )

    parser.add_argument(
        "--sync",
        action="store_true",
        help="Auto-detect and apply schema changes"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force reload entire schema (overwrites all tables)"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check sync status between file and database"
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Watch file for changes and auto-sync (development mode)"
    )

    args = parser.parse_args()

    # Initialize version table
    if not create_version_table():
        print("✗ Failed to initialize version tracking")
        return False

    # Handle commands
    if args.sync:
        return apply_schema(force=False)
    elif args.force:
        print("\n⚠ WARNING: This will reload the entire schema!")
        confirm = input("Are you sure? (type 'yes' to confirm): ")
        if confirm.lower() == "yes":
            return apply_schema(force=True)
        else:
            print("✗ Cancelled")
            return False
    elif args.status:
        return check_sync_status()
    elif args.watch:
        watch_for_changes()
    else:
        # Default: show status
        check_sync_status()


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
