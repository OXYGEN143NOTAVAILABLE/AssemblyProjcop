@echo off
REM Quick Schema Sync Script for Windows
REM Place this file in the backend/ folder and double-click to sync

echo.
echo ============================================================
echo Schema Synchronization Tool
echo ============================================================
echo.

cd /d "%~dp0"

REM Check if schema_sync.py exists
if not exist schema_sync.py (
    echo ERROR: schema_sync.py not found in this directory
    echo Please make sure this script is in the backend/ folder
    pause
    exit /b 1
)

REM Menu
echo What would you like to do?
echo.
echo 1. Check sync status (recommended first)
echo 2. Auto-sync changes (apply pending changes)
echo 3. Force reload (overwrites all tables - USE WITH CAUTION)
echo 4. Watch file for changes (development mode)
echo 5. Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    python schema_sync.py --status
) else if "%choice%"=="2" (
    python schema_sync.py --sync
) else if "%choice%"=="3" (
    echo WARNING: This will drop and recreate all tables!
    set /p confirm="Type 'yes' to confirm: "
    if "!confirm!"=="yes" (
        python schema_sync.py --force
    ) else (
        echo Cancelled
    )
) else if "%choice%"=="4" (
    echo Starting watcher (press Ctrl+C to stop)...
    python schema_sync.py --watch
) else if "%choice%"=="5" (
    exit /b 0
) else (
    echo Invalid choice
)

echo.
pause
