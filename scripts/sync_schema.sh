#!/bin/bash
# Quick Schema Sync Script for Linux/macOS
# Place this file in the backend/ folder and run: bash sync_schema.sh

echo ""
echo "============================================================"
echo "Schema Synchronization Tool"
echo "============================================================"
echo ""

cd "$(dirname "$0")"

# Check if schema_sync.py exists
if [ ! -f schema_sync.py ]; then
    echo "ERROR: schema_sync.py not found in this directory"
    echo "Please make sure this script is in the backend/ folder"
    exit 1
fi

# Menu
echo "What would you like to do?"
echo ""
echo "1. Check sync status (recommended first)"
echo "2. Auto-sync changes (apply pending changes)"
echo "3. Force reload (overwrites all tables - USE WITH CAUTION)"
echo "4. Watch file for changes (development mode)"
echo "5. Exit"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        python schema_sync.py --status
        ;;
    2)
        python schema_sync.py --sync
        ;;
    3)
        echo "WARNING: This will drop and recreate all tables!"
        read -p "Type 'yes' to confirm: " confirm
        if [ "$confirm" = "yes" ]; then
            python schema_sync.py --force
        else
            echo "Cancelled"
        fi
        ;;
    4)
        echo "Starting watcher (press Ctrl+C to stop)..."
        python schema_sync.py --watch
        ;;
    5)
        exit 0
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""
