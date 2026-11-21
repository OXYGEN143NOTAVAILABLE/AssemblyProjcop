"""
seed_demo_accounts.py
Idempotently seeds demo instructor and student accounts for testing Assembly PC.

Usage:
    python scripts/seed_demo_accounts.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from psycopg2.extras import Json

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app  # noqa: E402


DEMO_INSTRUCTORS = (
    {
        "firstName": "Maria",
        "lastName": "Santos",
        "email": "prof.maria@lnu.edu.ph",
        "department": "BSIT",
        "password": "Instructor123!",
    },
)

DEMO_STUDENTS = (
    {
        "firstName": "Ana",
        "lastName": "Reyes",
        "email": "ana.reyes@lnu.edu.ph",
        "studentId": "2024-1001",
        "password": "Student123!",
    },
    {
        "firstName": "Carlos",
        "lastName": "Mendoza",
        "email": "carlos.mendoza@lnu.edu.ph",
        "studentId": "2024-1002",
        "password": "Student123!",
    },
)


DEMO_SCENARIOS = (
    {
        "title": "Fault Lab 1: No-POST & Inverted Airflow Rig",
        "description": "Diagnose why this workstation fails POST & thermal checks: inspect CPU orientation, thermal paste, PSU/Case fan orientation, and GPU power cabling.",
        "activity_type": "troubleshoot",
        "tier": "Intermediate",
        "budget": None,
        "time_limit_minutes": 25,
        "objectives": [
            "Re-orient rotated CPU Pin-1 corner, apply thermal paste, and latch ILM lever",
            "Flip upside-down PSU (fan down) and backward rear Case Fan",
            "Connect missing PCIe GPU power and Case Fan cables, then pass POST",
        ],
    },
    {
        "title": "Fault Lab 2: Memory Conflict & Unplugged Rails",
        "description": "This workstation halts at boot with memory and power faults. Swap out incompatible RAM, re-fasten unlatched components, and connect missing motherboard cables.",
        "activity_type": "troubleshoot",
        "tier": "Intermediate",
        "budget": None,
        "time_limit_minutes": 25,
        "objectives": [
            "Replace DDR3 RAM with compatible DDR4 memory and secure DIMM latches",
            "Fasten PSU, connect 8-pin CPU_PWR1, CPU_FAN1, PCIE_PWR, and SATA6G_1 data",
            "Verify clean UEFI BIOS POST & pass Final Assembly Validation",
        ],
    },
    {
        "title": "AM5 DDR5 Workstation Build",
        "description": "Assemble a compatible AM5 DDR5 PC with NVMe storage and an RTX 4070.",
        "activity_type": "build",
        "tier": "High End",
        "budget": 1500,
        "time_limit_minutes": 30,
        "objectives": [
            "Match AM5 CPU and motherboard",
            "Select DDR5 memory",
            "Use an M.2 NVMe SSD",
            "Provide 700W+ PSU capacity",
        ],
    },
    {
        "title": "Entry LGA1700 Lab PC",
        "description": "Configure an entry-level LGA1700 DDR4 system suitable for classroom workstations.",
        "activity_type": "build",
        "tier": "Entry",
        "budget": 600,
        "time_limit_minutes": 20,
        "objectives": [
            "Select Core i5-12400",
            "Pair with DDR4 motherboard and RAM",
            "Verify 450W+ PSU",
        ],
    },
)


def seed_demo_accounts() -> dict[str, list[str]]:
    """Create demo instructor, student accounts, and workstation scenarios idempotently."""
    app.ensure_auth_tables()

    created: list[str] = []
    skipped: list[str] = []
    instructor_id: int | None = None

    for inst in DEMO_INSTRUCTORS:
        existing = app.run_select_one(
            "SELECT admin_id FROM admin_users WHERE lower(username) = lower(%s) LIMIT 1;",
            (inst["email"],),
        )
        if existing:
            skipped.append(f"instructor:{inst['email']}")
            if instructor_id is None:
                instructor_id = int(existing["admin_id"])
        else:
            created_inst = app.create_instructor_user(dict(inst))
            created.append(f"instructor:{inst['email']}")
            if instructor_id is None and created_inst:
                instructor_id = int(created_inst["admin_id"])

    for student in DEMO_STUDENTS:
        existing_student = app.run_select_one(
            """
            SELECT student_id
            FROM student_users
            WHERE lower(school_id) = lower(%s) OR lower(email) = lower(%s)
            LIMIT 1;
            """,
            (student["studentId"], student["email"]),
        )
        if existing_student:
            skipped.append(f"student:{student['studentId']}")
        else:
            app.create_student_user(dict(student))
            created.append(f"student:{student['studentId']}")

    if instructor_id is not None:
        for sc in DEMO_SCENARIOS:
            existing_sc = app.run_select_one(
                "SELECT scenario_id FROM pc_scenarios WHERE lower(title) = lower(%s) LIMIT 1;",
                (sc["title"],),
            )
            if existing_sc:
                skipped.append(f"scenario:{sc['title']}")
            else:
                app.run_write(
                    """
                    INSERT INTO pc_scenarios
                        (instructor_id, title, description, activity_type, tier, budget, time_limit_minutes,
                         objectives, troubleshooting, constraints, is_published)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                    RETURNING scenario_id;
                    """,
                    (
                        instructor_id,
                        sc["title"],
                        sc["description"],
                        sc["activity_type"],
                        sc["tier"],
                        sc["budget"],
                        sc["time_limit_minutes"],
                        Json(sc["objectives"]),
                        Json([]),
                        Json({}),
                    ),
                )
                created.append(f"scenario:{sc['title']}")

    return {"created": created, "skipped": skipped}


if __name__ == "__main__":
    summary = seed_demo_accounts()
    print(f"Demo accounts created: {summary['created']}")
    print(f"Demo accounts already present: {summary['skipped']}")
