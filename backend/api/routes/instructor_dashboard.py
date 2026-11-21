"""
api/routes/instructor_dashboard.py
FastAPI router and PostgreSQL schema bootstrap for the Instructor Classroom Dashboard
and student classroom enrollment/invitation endpoints.
"""

from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone, tzinfo
from typing import Any, Callable
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

try:
    from psycopg2.extras import RealDictCursor
except ImportError:  # pragma: no cover - allows mocked test environments without psycopg2
    RealDictCursor = None  # type: ignore[assignment]

from database import get_db_connection


JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
JOIN_CODE_PATTERN = re.compile(r"^[A-Z0-9_-]{4,32}$")
INT_STR_PATTERN = re.compile(r"^-?\d+$")


INSTRUCTOR_DASHBOARD_DDL_STATEMENTS: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS classrooms (
        classroom_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        instructor_id INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
        display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) > 0),
        join_code TEXT NOT NULL UNIQUE CHECK (char_length(trim(join_code)) >= 4),
        student_capacity INTEGER NULL CHECK (student_capacity IS NULL OR (student_capacity >= 1 AND student_capacity <= 500)),
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """.strip(),
    """
    CREATE TABLE IF NOT EXISTS classroom_enrollments (
        enrollment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        classroom_id BIGINT NOT NULL REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student_users(student_id) ON DELETE CASCADE,
        enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (classroom_id, student_id)
    );
    """.strip(),
    """
    CREATE TABLE IF NOT EXISTS classroom_invitations (
        invitation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        classroom_id BIGINT NOT NULL REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student_users(student_id) ON DELETE CASCADE,
        invited_by INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMPTZ NULL
    );
    """.strip(),
    """
    CREATE TABLE IF NOT EXISTS classroom_activities (
        activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        classroom_id BIGINT NOT NULL REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
        scenario_id INTEGER NULL REFERENCES pc_scenarios(scenario_id) ON DELETE SET NULL,
        activity_name TEXT NOT NULL CHECK (char_length(trim(activity_name)) > 0),
        scheduled_at TIMESTAMPTZ NOT NULL,
        due_at TIMESTAMPTZ NOT NULL,
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        manual_override BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_classroom_activities_due_after_start CHECK (due_at > scheduled_at)
    );
    """.strip(),
    """
    CREATE TABLE IF NOT EXISTS activity_submissions (
        submission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        activity_id BIGINT NOT NULL REFERENCES classroom_activities(activity_id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES student_users(student_id) ON DELETE CASCADE,
        build_id INTEGER NULL REFERENCES saved_builds(build_id) ON DELETE SET NULL,
        score SMALLINT NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        graded_at TIMESTAMPTZ NULL,
        graded_by INTEGER NULL REFERENCES admin_users(admin_id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (activity_id, student_id)
    );
    """.strip(),
    "CREATE INDEX IF NOT EXISTS idx_classrooms_instructor_id ON classrooms (instructor_id);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_classrooms_join_code_upper ON classrooms (UPPER(join_code));",
    "CREATE INDEX IF NOT EXISTS idx_classroom_enrollments_student_id ON classroom_enrollments (student_id);",
    "CREATE INDEX IF NOT EXISTS idx_classroom_invitations_student_status ON classroom_invitations (student_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_classroom_invitations_invited_by ON classroom_invitations (invited_by);",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_invitations_pending_unique ON classroom_invitations (classroom_id, student_id) WHERE status = 'pending';",
    "CREATE INDEX IF NOT EXISTS idx_classroom_activities_classroom_scheduled ON classroom_activities (classroom_id, scheduled_at);",
    "CREATE INDEX IF NOT EXISTS idx_classroom_activities_scenario_id ON classroom_activities (scenario_id) WHERE scenario_id IS NOT NULL;",
    "CREATE INDEX IF NOT EXISTS idx_activity_submissions_student_id ON activity_submissions (student_id);",
    "CREATE INDEX IF NOT EXISTS idx_activity_submissions_build_id ON activity_submissions (build_id) WHERE build_id IS NOT NULL;",
    "CREATE INDEX IF NOT EXISTS idx_activity_submissions_graded_by ON activity_submissions (graded_by) WHERE graded_by IS NOT NULL;",
)


def _open_cursor(conn: Any) -> Any:
    if RealDictCursor is not None:
        return conn.cursor(cursor_factory=RealDictCursor)
    return conn.cursor()


def _default_run_write(query: str, params: tuple[Any, ...] | None = None) -> dict[str, Any] | None:
    conn = get_db_connection()
    try:
        with _open_cursor(conn) as cur:
            cur.execute(query, params or ())
            row = None
            try:
                row = cur.fetchone()
            except Exception:
                row = None
            conn.commit()
            return dict(row) if isinstance(row, dict) else row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _default_run_select(query: str, params: tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
    conn = get_db_connection()
    try:
        with _open_cursor(conn) as cur:
            cur.execute(query, params or ())
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _default_run_select_one(query: str, params: tuple[Any, ...] | None = None) -> dict[str, Any] | None:
    conn = get_db_connection()
    try:
        with _open_cursor(conn) as cur:
            cur.execute(query, params or ())
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def _run_in_transaction(get_conn_fn: Callable[[], Any], callback: Callable[[Any], Any]) -> Any:
    conn = get_conn_fn()
    try:
        with _open_cursor(conn) as cur:
            result = callback(cur)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_instructor_dashboard_tables(
    run_write_fn: Callable[[str, tuple[Any, ...] | None], Any] | None = None,
    ensure_prereqs_fn: Callable[[], None] | None = None,
) -> None:
    """Create the 5 instructor-dashboard tables and 11 indexes idempotently."""
    if ensure_prereqs_fn is not None:
        ensure_prereqs_fn()
    writer = run_write_fn or _default_run_write
    for statement in INSTRUCTOR_DASHBOARD_DDL_STATEMENTS:
        writer(statement, None)


def get_schedule_timezone() -> tzinfo:
    """Return the configured timezone-aware tzinfo for activity wall-clock dates/times."""
    tz_name = os.getenv("APP_TIMEZONE") or os.getenv("SCHEDULE_TIMEZONE")
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    return datetime.now().astimezone().tzinfo or timezone.utc


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


async def _read_json_dict(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON payload"})
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail={"error": "JSON object payload is required"})
    return payload


def _parse_int_id(value: Any, label: str = "ID") -> int:
    if isinstance(value, bool) or value is None:
        raise HTTPException(status_code=400, detail={"error": f"Valid {label} is required"})
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and INT_STR_PATTERN.match(value.strip()):
        parsed = int(value.strip())
    else:
        raise HTTPException(status_code=400, detail={"error": f"Valid {label} is required"})
    if parsed <= 0:
        raise HTTPException(status_code=400, detail={"error": f"Valid {label} is required"})
    return parsed


def _parse_optional_capacity(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail={"error": "Capacity must be an integer between 1 and 500"})
    if isinstance(value, float):
        if not value.is_integer():
            raise HTTPException(status_code=400, detail={"error": "Capacity must be an integer between 1 and 500"})
        cap = int(value)
    elif isinstance(value, int):
        cap = value
    elif isinstance(value, str) and INT_STR_PATTERN.match(value.strip()):
        cap = int(value.strip())
    else:
        raise HTTPException(status_code=400, detail={"error": "Capacity must be an integer between 1 and 500"})

    if cap < 1 or cap > 500:
        raise HTTPException(status_code=400, detail={"error": "Capacity must be between 1 and 500"})
    return cap


def _parse_bool_strict(value: Any, field_name: str = "Value") -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "on"}:
            return True
        if text in {"false", "0", "no", "off"}:
            return False
    raise HTTPException(status_code=400, detail={"error": f"Invalid boolean value for {field_name}"})


def _parse_score(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail={"error": "Score must be an integer between 0 and 100"})
    if isinstance(value, float):
        if not value.is_integer():
            raise HTTPException(status_code=400, detail={"error": "Score must be an integer between 0 and 100"})
        score = int(value)
    elif isinstance(value, int):
        score = value
    elif isinstance(value, str) and INT_STR_PATTERN.match(value.strip()):
        score = int(value.strip())
    else:
        raise HTTPException(status_code=400, detail={"error": "Score must be an integer between 0 and 100"})

    if score < 0 or score > 100:
        raise HTTPException(status_code=400, detail={"error": "Score must be between 0 and 100"})
    return score


def _parse_time_str(time_val: Any, default_time: str, field_label: str) -> Any:
    raw = _clean_str(time_val) or default_time
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail={"error": f"Invalid {field_label} time format; expected HH:MM"})


def _parse_schedule_datetime(
    date_val: Any,
    time_val: Any,
    iso_val: Any,
    default_time: str,
    tz: tzinfo,
    field_label: str,
) -> datetime:
    date_str = _clean_str(date_val)
    if date_str:
        try:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": f"Invalid {field_label} date format; expected YYYY-MM-DD"})
        parsed_time = _parse_time_str(time_val, default_time, field_label)
        return datetime.combine(parsed_date, parsed_time, tzinfo=tz)

    iso_str = _clean_str(iso_val)
    if iso_str:
        try:
            parsed_dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": f"Invalid {field_label} timestamp"})
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=tz)
        return parsed_dt

    raise HTTPException(status_code=400, detail={"error": f"{field_label} date is required"})


def _to_local_datetime(value: Any, tz: tzinfo) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    else:
        raise ValueError(f"Unsupported timestamp value: {value!r}")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def _format_iso_timestamp(value: Any, tz: tzinfo) -> str | None:
    if value is None:
        return None
    return _to_local_datetime(value, tz).isoformat()


def _generate_join_code() -> str:
    return "APC-" + "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(4))


def _is_unique_violation(exc: Exception) -> bool:
    pgcode = getattr(exc, "pgcode", None)
    if pgcode == "23505":
        return True
    msg = str(exc).lower()
    return "duplicate key" in msg or "unique constraint" in msg or "unique" in msg


def _student_display_name(row: dict[str, Any]) -> str:
    display = _clean_str(row.get("display_name"))
    if display:
        return display
    full = f"{_clean_str(row.get('first_name'))} {_clean_str(row.get('last_name'))}".strip()
    if full:
        return full
    return _clean_str(row.get("name")) or _clean_str(row.get("school_id")) or "Student"


def _format_student(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["student_id"]),
        "name": _student_display_name(row),
        "schoolId": row.get("school_id") or "",
        "email": row.get("email") or "",
    }


def _format_invitation(row: dict[str, Any], tz: tzinfo) -> dict[str, Any]:
    return {
        "id": str(row["invitation_id"]),
        "studentId": str(row["student_id"]),
        "name": _student_display_name(row),
        "schoolId": row.get("school_id") or "",
        "email": row.get("email") or "",
        "status": row.get("status") or "pending",
        "createdAt": _format_iso_timestamp(row.get("created_at"), tz),
    }


def _format_classroom(
    row: dict[str, Any],
    students: list[dict[str, Any]] | None = None,
    invitations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    student_list = list(students or [])
    invite_list = list(invitations or [])
    return {
        "id": str(row["classroom_id"]),
        "name": row["name"],
        "displayName": row["display_name"],
        "joinCode": row["join_code"],
        "capacity": row.get("student_capacity"),
        "students": student_list,
        "totalStudents": len(student_list),
        "invitations": invite_list,
    }


def _format_schedule(row: dict[str, Any], scores: dict[str, int], tz: tzinfo) -> dict[str, Any]:
    sched_dt = _to_local_datetime(row["scheduled_at"], tz)
    due_dt = _to_local_datetime(row["due_at"], tz)
    return {
        "id": str(row["activity_id"]),
        "classId": str(row["classroom_id"]),
        "className": row.get("class_name") or row.get("display_name") or row.get("name") or "Classroom",
        "activityName": row["activity_name"],
        "dateValue": sched_dt.strftime("%Y-%m-%d"),
        "timeValue": sched_dt.strftime("%H:%M"),
        "dueDateValue": due_dt.strftime("%Y-%m-%d"),
        "dueTimeValue": due_dt.strftime("%H:%M"),
        "scheduledAt": sched_dt.isoformat(),
        "dueAt": due_dt.isoformat(),
        "isLocked": bool(row.get("is_locked")),
        "manualOverride": bool(row.get("manual_override")),
        "scenarioId": row.get("scenario_id"),
        "scores": dict(scores),
    }


def _detect_workstation_preset(activity_name: str) -> tuple[str | None, str]:
    lowered = _clean_str(activity_name).lower()
    if "fault lab 1" in lowered or "no-post" in lowered:
        return ("fault_no_post_orientation", "troubleshoot")
    if "fault lab 2" in lowered or "memory conflict" in lowered:
        return ("fault_memory_power_mismatch", "troubleshoot")
    return (None, "build")


def _format_student_activity(row: dict[str, Any], tz: tzinfo) -> dict[str, Any]:
    sched_dt = _to_local_datetime(row["scheduled_at"], tz)
    due_dt = _to_local_datetime(row["due_at"], tz)
    fault_lab_id, default_type = _detect_workstation_preset(row.get("activity_name") or "")
    raw_score = row.get("score")
    raw_build_id = row.get("build_id")
    return {
        "id": str(row["activity_id"]),
        "classId": str(row["classroom_id"]),
        "activityName": row["activity_name"],
        "scenarioId": row.get("scenario_id"),
        "faultLabId": fault_lab_id,
        "activityType": row.get("activity_type") or default_type,
        "dateValue": sched_dt.strftime("%Y-%m-%d"),
        "timeValue": sched_dt.strftime("%H:%M"),
        "dueDateValue": due_dt.strftime("%Y-%m-%d"),
        "dueTimeValue": due_dt.strftime("%H:%M"),
        "scheduledAt": sched_dt.isoformat(),
        "dueAt": due_dt.isoformat(),
        "isLocked": bool(row.get("is_locked")),
        "manualOverride": bool(row.get("manual_override")),
        "isSubmitted": row.get("submission_id") is not None or raw_score is not None,
        "score": int(raw_score) if raw_score is not None else None,
        "buildId": int(raw_build_id) if raw_build_id is not None else None,
        "submittedAt": _format_iso_timestamp(row.get("submitted_at"), tz),
    }


def create_instructor_dashboard_router(
    *,
    get_db_connection_fn: Callable[[], Any] | None = None,
    run_select_fn: Callable[[str, tuple[Any, ...] | None], list[dict[str, Any]]] | None = None,
    run_select_one_fn: Callable[[str, tuple[Any, ...] | None], dict[str, Any] | None] | None = None,
    run_write_fn: Callable[[str, tuple[Any, ...] | None], dict[str, Any] | None] | None = None,
    require_instructor_fn: Callable[[Request], dict[str, Any]] | None = None,
    require_student_fn: Callable[[Request], dict[str, Any]] | None = None,
    ensure_tables_fn: Callable[[], None] | None = None,
) -> APIRouter:
    """Build the instructor dashboard and student classroom APIRouter without circular imports."""
    router = APIRouter()

    db_conn = get_db_connection_fn or get_db_connection
    select_all = run_select_fn or _default_run_select
    select_one = run_select_one_fn or _default_run_select_one
    write_one = run_write_fn or _default_run_write

    def _ensure_tables() -> None:
        if ensure_tables_fn is not None:
            ensure_tables_fn()
        else:
            ensure_instructor_dashboard_tables(run_write_fn=write_one)

    def _require_instructor(request: Request) -> dict[str, Any]:
        if require_instructor_fn is None:
            raise HTTPException(status_code=401, detail={"error": "Login required"})
        user = require_instructor_fn(request)
        if not user or user.get("role") != "instructor":
            raise HTTPException(status_code=403, detail={"error": "Instructor access required"})
        return user

    def _require_student(request: Request) -> dict[str, Any]:
        if require_student_fn is None:
            raise HTTPException(status_code=401, detail={"error": "Login required"})
        user = require_student_fn(request)
        if not user or user.get("role") != "student":
            raise HTTPException(status_code=403, detail={"error": "Student access required"})
        return user

    def _fetch_classroom_students(cur: Any, classroom_id: int) -> list[dict[str, Any]]:
        cur.execute(
            """
            SELECT su.student_id, su.school_id, su.email,
                   su.first_name, su.last_name, su.display_name
            FROM classroom_enrollments ce
            JOIN student_users su ON su.student_id = ce.student_id
            WHERE ce.classroom_id = %s
            ORDER BY ce.enrolled_at ASC, su.student_id ASC;
            """,
            (classroom_id,),
        )
        return [_format_student(dict(r)) for r in cur.fetchall()]

    def _fetch_pending_invitations(cur: Any, classroom_id: int, tz: tzinfo) -> list[dict[str, Any]]:
        cur.execute(
            """
            SELECT ci.invitation_id, ci.classroom_id, ci.student_id, ci.status, ci.created_at,
                   su.school_id, su.email, su.first_name, su.last_name, su.display_name
            FROM classroom_invitations ci
            JOIN student_users su ON su.student_id = ci.student_id
            WHERE ci.classroom_id = %s AND ci.status = 'pending'
            ORDER BY ci.created_at DESC, ci.invitation_id DESC;
            """,
            (classroom_id,),
        )
        return [_format_invitation(dict(r), tz) for r in cur.fetchall()]

    # ------------------------------------------------------------
    # INSTRUCTOR DASHBOARD ROUTES
    # ------------------------------------------------------------

    @router.get("/api/instructor/dashboard")
    async def api_instructor_dashboard(request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        instructor_id = int(user["id"])

        instructor_row = select_one(
            """
            SELECT admin_id, username, display_name
            FROM admin_users
            WHERE admin_id = %s AND role = 'instructor' AND is_active = TRUE;
            """,
            (instructor_id,),
        )
        instructor_name = (
            (instructor_row.get("display_name") or instructor_row.get("username"))
            if instructor_row
            else (user.get("displayName") or user.get("email") or "Instructor")
        )

        classroom_rows = select_all(
            """
            SELECT classroom_id, instructor_id, name, display_name, join_code, student_capacity, is_archived, created_at
            FROM classrooms
            WHERE instructor_id = %s AND is_archived = FALSE
            ORDER BY created_at DESC, classroom_id DESC;
            """,
            (instructor_id,),
        )

        enrollment_rows = select_all(
            """
            SELECT ce.classroom_id, su.student_id, su.school_id, su.email,
                   su.first_name, su.last_name, su.display_name
            FROM classroom_enrollments ce
            JOIN classrooms c ON c.classroom_id = ce.classroom_id
            JOIN student_users su ON su.student_id = ce.student_id
            WHERE c.instructor_id = %s AND c.is_archived = FALSE
            ORDER BY ce.enrolled_at ASC, su.student_id ASC;
            """,
            (instructor_id,),
        )
        students_by_class: dict[int, list[dict[str, Any]]] = {}
        for row in enrollment_rows:
            cid = int(row["classroom_id"])
            students_by_class.setdefault(cid, []).append(_format_student(row))

        invitation_rows = select_all(
            """
            SELECT ci.invitation_id, ci.classroom_id, ci.student_id, ci.status, ci.created_at,
                   su.school_id, su.email, su.first_name, su.last_name, su.display_name
            FROM classroom_invitations ci
            JOIN classrooms c ON c.classroom_id = ci.classroom_id
            JOIN student_users su ON su.student_id = ci.student_id
            WHERE c.instructor_id = %s AND c.is_archived = FALSE AND ci.status = 'pending'
            ORDER BY ci.created_at DESC, ci.invitation_id DESC;
            """,
            (instructor_id,),
        )
        invitations_by_class: dict[int, list[dict[str, Any]]] = {}
        for row in invitation_rows:
            cid = int(row["classroom_id"])
            invitations_by_class.setdefault(cid, []).append(_format_invitation(row, tz))

        classes = [
            _format_classroom(
                row,
                students=students_by_class.get(int(row["classroom_id"]), []),
                invitations=invitations_by_class.get(int(row["classroom_id"]), []),
            )
            for row in classroom_rows
        ]

        activity_rows = select_all(
            """
            SELECT ca.activity_id, ca.classroom_id, c.display_name AS class_name,
                   ca.scenario_id, ca.activity_name, ca.scheduled_at, ca.due_at,
                   ca.is_locked, ca.manual_override
            FROM classroom_activities ca
            JOIN classrooms c ON c.classroom_id = ca.classroom_id
            WHERE c.instructor_id = %s AND c.is_archived = FALSE
            ORDER BY ca.scheduled_at ASC, ca.activity_id ASC;
            """,
            (instructor_id,),
        )

        submission_rows = select_all(
            """
            SELECT asub.activity_id, asub.student_id, asub.score
            FROM activity_submissions asub
            JOIN classroom_activities ca ON ca.activity_id = asub.activity_id
            JOIN classrooms c ON c.classroom_id = ca.classroom_id
            WHERE c.instructor_id = %s AND c.is_archived = FALSE AND asub.score IS NOT NULL;
            """,
            (instructor_id,),
        )
        scores_by_activity: dict[int, dict[str, int]] = {}
        for row in submission_rows:
            aid = int(row["activity_id"])
            scores_by_activity.setdefault(aid, {})[str(row["student_id"])] = int(row["score"])

        schedules = [
            _format_schedule(row, scores_by_activity.get(int(row["activity_id"]), {}), tz)
            for row in activity_rows
        ]

        return {
            "ok": True,
            "instructorName": instructor_name,
            "classes": classes,
            "schedules": schedules,
        }

    @router.post("/api/instructor/classrooms")
    async def api_create_classroom(request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        instructor_id = int(user["id"])

        raw_name = _clean_str(payload.get("name"))
        raw_display = _clean_str(payload.get("displayName"))
        name = raw_name or raw_display
        display_name = raw_display or raw_name
        if not name:
            raise HTTPException(status_code=400, detail={"error": "Classroom name is required"})
        if len(name) > 120 or len(display_name) > 120:
            raise HTTPException(status_code=400, detail={"error": "Classroom name must be 120 characters or fewer"})

        capacity = _parse_optional_capacity(payload.get("capacity"))
        raw_join_code = payload.get("joinCode")
        custom_code = _clean_str(raw_join_code).upper() if raw_join_code is not None else ""

        if custom_code:
            if not JOIN_CODE_PATTERN.match(custom_code):
                raise HTTPException(
                    status_code=400,
                    detail={"error": "Join code must be 4-32 characters (letters, numbers, hyphens, or underscores)"},
                )
            existing = select_one(
                "SELECT classroom_id FROM classrooms WHERE UPPER(join_code) = UPPER(%s) LIMIT 1;",
                (custom_code,),
            )
            if existing:
                raise HTTPException(status_code=409, detail={"error": "A classroom with this join code already exists"})
            try:
                created = write_one(
                    """
                    INSERT INTO classrooms (instructor_id, name, display_name, join_code, student_capacity)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING classroom_id, instructor_id, name, display_name, join_code, student_capacity;
                    """,
                    (instructor_id, name, display_name, custom_code, capacity),
                )
            except Exception as exc:
                if _is_unique_violation(exc):
                    raise HTTPException(status_code=409, detail={"error": "A classroom with this join code already exists"})
                raise
        else:
            created = None
            for _ in range(20):
                candidate = _generate_join_code()
                existing = select_one(
                    "SELECT classroom_id FROM classrooms WHERE UPPER(join_code) = UPPER(%s) LIMIT 1;",
                    (candidate,),
                )
                if existing:
                    continue
                try:
                    created = write_one(
                        """
                        INSERT INTO classrooms (instructor_id, name, display_name, join_code, student_capacity)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING classroom_id, instructor_id, name, display_name, join_code, student_capacity;
                        """,
                        (instructor_id, name, display_name, candidate, capacity),
                    )
                    break
                except Exception as exc:
                    if _is_unique_violation(exc):
                        continue
                    raise
            if not created:
                raise HTTPException(status_code=500, detail={"error": "Unable to generate a unique classroom join code"})

        return {
            "ok": True,
            "classroom": _format_classroom(created, students=[], invitations=[]),
        }

    @router.post("/api/instructor/classrooms/{classroom_id}/invitations")
    async def api_invite_student_to_classroom(classroom_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        tz = get_schedule_timezone()
        instructor_id = int(user["id"])

        identifier = _clean_str(
            payload.get("identifier") or payload.get("email") or payload.get("schoolId")
        )
        if not identifier:
            raise HTTPException(status_code=400, detail={"error": "Student ID or email is required"})

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT classroom_id, student_capacity
                FROM classrooms
                WHERE classroom_id = %s AND instructor_id = %s AND is_archived = FALSE;
                """,
                (classroom_id, instructor_id),
            )
            classroom = cur.fetchone()
            if not classroom:
                raise HTTPException(status_code=404, detail={"error": "Classroom not found"})

            cur.execute(
                """
                SELECT student_id, school_id, email, first_name, last_name, display_name
                FROM student_users
                WHERE (lower(school_id) = lower(%s) OR lower(email) = lower(%s))
                  AND is_active = TRUE
                LIMIT 1;
                """,
                (identifier, identifier),
            )
            student = cur.fetchone()
            if not student:
                raise HTTPException(
                    status_code=404,
                    detail={"error": "No active student found matching that Student ID or email"},
                )
            student_dict = dict(student)
            student_id = int(student_dict["student_id"])

            cur.execute(
                """
                SELECT enrollment_id
                FROM classroom_enrollments
                WHERE classroom_id = %s AND student_id = %s
                LIMIT 1;
                """,
                (classroom_id, student_id),
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail={"error": "Student is already enrolled in this classroom"})

            cur.execute(
                """
                SELECT invitation_id
                FROM classroom_invitations
                WHERE classroom_id = %s AND student_id = %s AND status = 'pending'
                LIMIT 1;
                """,
                (classroom_id, student_id),
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail={"error": "A pending invitation already exists for this student"})

            cap = dict(classroom).get("student_capacity")
            if cap is not None:
                cur.execute(
                    "SELECT COUNT(*) AS count FROM classroom_enrollments WHERE classroom_id = %s;",
                    (classroom_id,),
                )
                enrolled_count = int((dict(cur.fetchone() or {}).get("count")) or 0)
                if enrolled_count >= int(cap):
                    raise HTTPException(status_code=400, detail={"error": "Classroom has reached its student capacity"})

            try:
                cur.execute(
                    """
                    INSERT INTO classroom_invitations (classroom_id, student_id, invited_by, status)
                    VALUES (%s, %s, %s, 'pending')
                    RETURNING invitation_id, classroom_id, student_id, status, created_at;
                    """,
                    (classroom_id, student_id, instructor_id),
                )
            except Exception as exc:
                if _is_unique_violation(exc):
                    raise HTTPException(
                        status_code=409,
                        detail={"error": "A pending invitation already exists for this student"},
                    )
                raise

            inv_row = dict(cur.fetchone())
            inv_row.update(
                {
                    "school_id": student_dict.get("school_id"),
                    "email": student_dict.get("email"),
                    "first_name": student_dict.get("first_name"),
                    "last_name": student_dict.get("last_name"),
                    "display_name": student_dict.get("display_name"),
                }
            )
            created_invitation = _format_invitation(inv_row, tz)
            invitations = _fetch_pending_invitations(cur, classroom_id, tz)
            return {
                "ok": True,
                "invitation": created_invitation,
                "invitations": invitations,
            }

        return _run_in_transaction(db_conn, _tx)

    @router.delete("/api/instructor/classrooms/{classroom_id}/invitations/{invitation_id}")
    async def api_cancel_classroom_invitation(classroom_id: int, invitation_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        instructor_id = int(user["id"])

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT classroom_id
                FROM classrooms
                WHERE classroom_id = %s AND instructor_id = %s AND is_archived = FALSE;
                """,
                (classroom_id, instructor_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={"error": "Classroom not found"})

            cur.execute(
                """
                DELETE FROM classroom_invitations
                WHERE invitation_id = %s AND classroom_id = %s AND status = 'pending'
                RETURNING invitation_id;
                """,
                (invitation_id, classroom_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={"error": "Pending invitation not found"})

            invitations = _fetch_pending_invitations(cur, classroom_id, tz)
            return {"ok": True, "invitations": invitations}

        return _run_in_transaction(db_conn, _tx)

    @router.delete("/api/instructor/classrooms/{classroom_id}/students/{student_id}")
    async def api_remove_classroom_student(classroom_id: int, student_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        instructor_id = int(user["id"])

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT classroom_id
                FROM classrooms
                WHERE classroom_id = %s AND instructor_id = %s AND is_archived = FALSE;
                """,
                (classroom_id, instructor_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={"error": "Classroom not found"})

            cur.execute(
                """
                DELETE FROM classroom_enrollments
                WHERE classroom_id = %s AND student_id = %s
                RETURNING enrollment_id;
                """,
                (classroom_id, student_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail={"error": "Student is not enrolled in this classroom"})

            cur.execute(
                """
                DELETE FROM activity_submissions
                WHERE student_id = %s
                  AND activity_id IN (
                      SELECT activity_id FROM classroom_activities WHERE classroom_id = %s
                  );
                """,
                (student_id, classroom_id),
            )

            students = _fetch_classroom_students(cur, classroom_id)
            return {
                "ok": True,
                "students": students,
                "totalStudents": len(students),
            }

        return _run_in_transaction(db_conn, _tx)

    @router.post("/api/instructor/schedules")
    async def api_create_schedule(request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        tz = get_schedule_timezone()
        instructor_id = int(user["id"])

        classroom_id = _parse_int_id(payload.get("classId"), "classId")
        activity_name = _clean_str(payload.get("activityName"))
        if not activity_name:
            raise HTTPException(status_code=400, detail={"error": "Activity name is required"})
        if len(activity_name) > 180:
            raise HTTPException(status_code=400, detail={"error": "Activity name must be 180 characters or fewer"})

        scheduled_at = _parse_schedule_datetime(
            payload.get("dateValue"),
            payload.get("timeValue"),
            payload.get("scheduledAt"),
            "00:00",
            tz,
            "scheduled start",
        )
        due_at = _parse_schedule_datetime(
            payload.get("dueDateValue"),
            payload.get("dueTimeValue"),
            payload.get("dueAt"),
            "23:59",
            tz,
            "due",
        )
        if due_at <= scheduled_at:
            raise HTTPException(
                status_code=400,
                detail={"error": "Due date and time must be after the scheduled start date and time."},
            )

        manual_override = _parse_bool_strict(payload.get("manualOverride", False), "manualOverride")
        is_locked = _parse_bool_strict(payload.get("isLocked", False), "isLocked")

        raw_scenario_id = payload.get("scenarioId")
        scenario_id: int | None = None
        if raw_scenario_id not in (None, ""):
            scenario_id = _parse_int_id(raw_scenario_id, "scenarioId")
            scenario = select_one(
                """
                SELECT scenario_id
                FROM pc_scenarios
                WHERE scenario_id = %s AND (instructor_id = %s OR is_published = TRUE);
                """,
                (scenario_id, instructor_id),
            )
            if not scenario:
                raise HTTPException(status_code=404, detail={"error": "Scenario not found"})

        classroom = select_one(
            """
            SELECT classroom_id, name, display_name
            FROM classrooms
            WHERE classroom_id = %s AND instructor_id = %s AND is_archived = FALSE;
            """,
            (classroom_id, instructor_id),
        )
        if not classroom:
            raise HTTPException(status_code=404, detail={"error": "Classroom not found"})

        row = write_one(
            """
            INSERT INTO classroom_activities
                (classroom_id, scenario_id, activity_name, scheduled_at, due_at, is_locked, manual_override)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING activity_id, classroom_id, scenario_id, activity_name, scheduled_at, due_at, is_locked, manual_override;
            """,
            (classroom_id, scenario_id, activity_name, scheduled_at, due_at, is_locked, manual_override),
        )
        row["class_name"] = classroom.get("display_name") or classroom.get("name")
        return {
            "ok": True,
            "schedule": _format_schedule(row, {}, tz),
        }

    @router.put("/api/instructor/schedules/{activity_id}")
    async def api_update_schedule(activity_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        tz = get_schedule_timezone()
        instructor_id = int(user["id"])

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT ca.activity_id, ca.classroom_id, ca.scenario_id, ca.activity_name,
                       ca.scheduled_at, ca.due_at, ca.is_locked, ca.manual_override
                FROM classroom_activities ca
                JOIN classrooms c ON c.classroom_id = ca.classroom_id
                WHERE ca.activity_id = %s AND c.instructor_id = %s AND c.is_archived = FALSE;
                """,
                (activity_id, instructor_id),
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail={"error": "Scheduled activity not found"})
            existing_dict = dict(existing)
            old_classroom_id = int(existing_dict["classroom_id"])

            new_classroom_id = (
                _parse_int_id(payload["classId"], "classId")
                if "classId" in payload and payload["classId"] not in (None, "")
                else old_classroom_id
            )
            cur.execute(
                """
                SELECT classroom_id, name, display_name
                FROM classrooms
                WHERE classroom_id = %s AND instructor_id = %s AND is_archived = FALSE;
                """,
                (new_classroom_id, instructor_id),
            )
            target_classroom = cur.fetchone()
            if not target_classroom:
                raise HTTPException(status_code=404, detail={"error": "Classroom not found"})
            target_classroom_dict = dict(target_classroom)

            if "activityName" in payload:
                activity_name = _clean_str(payload.get("activityName"))
                if not activity_name:
                    raise HTTPException(status_code=400, detail={"error": "Activity name is required"})
                if len(activity_name) > 180:
                    raise HTTPException(status_code=400, detail={"error": "Activity name must be 180 characters or fewer"})
            else:
                activity_name = existing_dict["activity_name"]

            if any(k in payload for k in ("dateValue", "timeValue", "scheduledAt")):
                scheduled_at = _parse_schedule_datetime(
                    payload.get("dateValue"),
                    payload.get("timeValue"),
                    payload.get("scheduledAt"),
                    "00:00",
                    tz,
                    "scheduled start",
                )
            else:
                scheduled_at = _to_local_datetime(existing_dict["scheduled_at"], tz)

            if any(k in payload for k in ("dueDateValue", "dueTimeValue", "dueAt")):
                due_at = _parse_schedule_datetime(
                    payload.get("dueDateValue"),
                    payload.get("dueTimeValue"),
                    payload.get("dueAt"),
                    "23:59",
                    tz,
                    "due",
                )
            else:
                due_at = _to_local_datetime(existing_dict["due_at"], tz)

            if due_at <= scheduled_at:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "Due date and time must be after the scheduled start date and time."},
                )

            manual_override = (
                _parse_bool_strict(payload["manualOverride"], "manualOverride")
                if "manualOverride" in payload
                else bool(existing_dict.get("manual_override"))
            )
            is_locked = (
                _parse_bool_strict(payload["isLocked"], "isLocked")
                if "isLocked" in payload
                else bool(existing_dict.get("is_locked"))
            )

            scenario_id = existing_dict.get("scenario_id")
            if "scenarioId" in payload:
                raw_scenario = payload.get("scenarioId")
                if raw_scenario in (None, ""):
                    scenario_id = None
                else:
                    scenario_id = _parse_int_id(raw_scenario, "scenarioId")
                    cur.execute(
                        """
                        SELECT scenario_id
                        FROM pc_scenarios
                        WHERE scenario_id = %s AND (instructor_id = %s OR is_published = TRUE);
                        """,
                        (scenario_id, instructor_id),
                    )
                    if not cur.fetchone():
                        raise HTTPException(status_code=404, detail={"error": "Scenario not found"})

            cur.execute(
                """
                UPDATE classroom_activities
                SET classroom_id = %s,
                    scenario_id = %s,
                    activity_name = %s,
                    scheduled_at = %s,
                    due_at = %s,
                    is_locked = %s,
                    manual_override = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE activity_id = %s
                RETURNING activity_id, classroom_id, scenario_id, activity_name,
                          scheduled_at, due_at, is_locked, manual_override;
                """,
                (new_classroom_id, scenario_id, activity_name, scheduled_at, due_at, is_locked, manual_override, activity_id),
            )
            updated = dict(cur.fetchone())
            updated["class_name"] = target_classroom_dict.get("display_name") or target_classroom_dict.get("name")

            scores: dict[str, int] = {}
            if new_classroom_id != old_classroom_id:
                cur.execute("DELETE FROM activity_submissions WHERE activity_id = %s;", (activity_id,))
            else:
                cur.execute(
                    """
                    SELECT student_id, score
                    FROM activity_submissions
                    WHERE activity_id = %s AND score IS NOT NULL;
                    """,
                    (activity_id,),
                )
                for row in cur.fetchall():
                    row_dict = dict(row)
                    scores[str(row_dict["student_id"])] = int(row_dict["score"])

            return {
                "ok": True,
                "schedule": _format_schedule(updated, scores, tz),
            }

        return _run_in_transaction(db_conn, _tx)

    @router.delete("/api/instructor/schedules/{activity_id}")
    async def api_delete_schedule(activity_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        instructor_id = int(user["id"])

        deleted = write_one(
            """
            DELETE FROM classroom_activities ca
            USING classrooms c
            WHERE ca.activity_id = %s
              AND ca.classroom_id = c.classroom_id
              AND c.instructor_id = %s
              AND c.is_archived = FALSE
            RETURNING ca.activity_id;
            """,
            (activity_id, instructor_id),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail={"error": "Scheduled activity not found"})
        return {"ok": True}

    @router.patch("/api/instructor/schedules/{activity_id}/lock")
    async def api_toggle_schedule_lock(activity_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        instructor_id = int(user["id"])

        if "isLocked" not in payload:
            raise HTTPException(status_code=400, detail={"error": "isLocked is required"})
        is_locked = _parse_bool_strict(payload.get("isLocked"), "isLocked")

        updated = write_one(
            """
            UPDATE classroom_activities ca
            SET is_locked = %s,
                manual_override = TRUE,
                updated_at = CURRENT_TIMESTAMP
            FROM classrooms c
            WHERE ca.activity_id = %s
              AND ca.classroom_id = c.classroom_id
              AND c.instructor_id = %s
              AND c.is_archived = FALSE
            RETURNING ca.activity_id, ca.is_locked, ca.manual_override;
            """,
            (is_locked, activity_id, instructor_id),
        )
        if not updated:
            raise HTTPException(status_code=404, detail={"error": "Scheduled activity not found"})

        return {
            "ok": True,
            "isLocked": bool(updated["is_locked"]),
            "manualOverride": True,
        }

    @router.put("/api/instructor/schedules/{activity_id}/scores/{student_id}")
    async def api_update_student_score(activity_id: int, student_id: int, request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        instructor_id = int(user["id"])

        if "score" not in payload:
            raise HTTPException(status_code=400, detail={"error": "Score is required"})
        score_val = _parse_score(payload.get("score"))

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT ca.activity_id, ca.classroom_id, ca.is_locked
                FROM classroom_activities ca
                JOIN classrooms c ON c.classroom_id = ca.classroom_id
                WHERE ca.activity_id = %s AND c.instructor_id = %s AND c.is_archived = FALSE;
                """,
                (activity_id, instructor_id),
            )
            activity = cur.fetchone()
            if not activity:
                raise HTTPException(status_code=404, detail={"error": "Scheduled activity not found"})
            activity_dict = dict(activity)

            cur.execute(
                """
                SELECT enrollment_id
                FROM classroom_enrollments
                WHERE classroom_id = %s AND student_id = %s
                LIMIT 1;
                """,
                (int(activity_dict["classroom_id"]), student_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail={"error": "Student is not enrolled in this activity's classroom"},
                )

            if bool(activity_dict.get("is_locked")):
                raise HTTPException(
                    status_code=409,
                    detail={"error": "Scores cannot be edited while the activity is locked"},
                )

            if score_val is None:
                cur.execute(
                    "DELETE FROM activity_submissions WHERE activity_id = %s AND student_id = %s;",
                    (activity_id, student_id),
                )
                return {"ok": True, "score": None}

            cur.execute(
                """
                INSERT INTO activity_submissions (activity_id, student_id, score, graded_at, graded_by, updated_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (activity_id, student_id)
                DO UPDATE SET
                    score = EXCLUDED.score,
                    graded_at = CURRENT_TIMESTAMP,
                    graded_by = EXCLUDED.graded_by,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING score;
                """,
                (activity_id, student_id, score_val, instructor_id),
            )
            saved = dict(cur.fetchone())
            return {"ok": True, "score": int(saved["score"])}

        return _run_in_transaction(db_conn, _tx)

    @router.patch("/api/instructor/profile")
    async def api_update_instructor_profile(request: Request):
        user = _require_instructor(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        instructor_id = int(user["id"])

        name = _clean_str(payload.get("name"))
        if not name:
            raise HTTPException(status_code=400, detail={"error": "Instructor name is required"})
        if len(name) > 120:
            raise HTTPException(status_code=400, detail={"error": "Instructor name must be 120 characters or fewer"})

        updated = write_one(
            """
            UPDATE admin_users
            SET display_name = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE admin_id = %s AND role = 'instructor' AND is_active = TRUE
            RETURNING display_name;
            """,
            (name, instructor_id),
        )
        if not updated:
            raise HTTPException(status_code=404, detail={"error": "Instructor account not found"})

        return {
            "ok": True,
            "instructorName": updated["display_name"],
        }

    # ------------------------------------------------------------
    # STUDENT CLASSROOM & INVITATION ROUTES
    # ------------------------------------------------------------

    @router.get("/api/student/classrooms")
    async def api_student_list_classrooms(request: Request):
        user = _require_student(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        student_id = int(user["id"])

        rows = select_all(
            """
            SELECT c.classroom_id, c.name, c.display_name, c.join_code, c.student_capacity,
                   ce.enrolled_at,
                   COALESCE(NULLIF(trim(a.display_name), ''), a.username) AS instructor_name,
                   (SELECT COUNT(*) FROM classroom_activities ca WHERE ca.classroom_id = c.classroom_id) AS activities_count
            FROM classroom_enrollments ce
            JOIN classrooms c ON c.classroom_id = ce.classroom_id
            JOIN admin_users a ON a.admin_id = c.instructor_id
            WHERE ce.student_id = %s AND c.is_archived = FALSE
            ORDER BY ce.enrolled_at DESC, c.classroom_id DESC;
            """,
            (student_id,),
        )
        activity_rows = select_all(
            """
            SELECT ca.activity_id, ca.classroom_id, ca.scenario_id, ca.activity_name,
                   ca.scheduled_at, ca.due_at, ca.is_locked, ca.manual_override,
                   ps.activity_type,
                   asub.submission_id, asub.score, asub.build_id, asub.submitted_at
            FROM classroom_activities ca
            JOIN classrooms c ON c.classroom_id = ca.classroom_id
            JOIN classroom_enrollments ce ON ce.classroom_id = c.classroom_id
            LEFT JOIN pc_scenarios ps ON ps.scenario_id = ca.scenario_id
            LEFT JOIN activity_submissions asub
              ON asub.activity_id = ca.activity_id AND asub.student_id = ce.student_id
            WHERE ce.student_id = %s AND c.is_archived = FALSE
            ORDER BY ca.scheduled_at ASC, ca.activity_id ASC;
            """,
            (student_id,),
        )
        activities_by_class: dict[int, list[dict[str, Any]]] = {}
        for act_row in activity_rows:
            cid = int(act_row["classroom_id"])
            activities_by_class.setdefault(cid, []).append(_format_student_activity(act_row, tz))

        classrooms = [
            {
                "id": str(row["classroom_id"]),
                "name": row["name"],
                "displayName": row["display_name"],
                "joinCode": row["join_code"],
                "capacity": row.get("student_capacity"),
                "instructorName": row.get("instructor_name") or "Instructor",
                "enrolledAt": _format_iso_timestamp(row.get("enrolled_at"), tz),
                "activitiesCount": int(row.get("activities_count") or 0),
                "activities": activities_by_class.get(int(row["classroom_id"]), []),
            }
            for row in rows
        ]
        return {"ok": True, "classrooms": classrooms}

    @router.get("/api/student/activities")
    async def api_student_list_activities(request: Request):
        user = _require_student(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        student_id = int(user["id"])

        rows = select_all(
            """
            SELECT ca.activity_id, ca.classroom_id, ca.scenario_id, ca.activity_name,
                   ca.scheduled_at, ca.due_at, ca.is_locked, ca.manual_override,
                   c.name AS class_name, c.display_name AS class_display_name,
                   COALESCE(NULLIF(trim(a.display_name), ''), a.username) AS instructor_name,
                   ps.activity_type, ps.description AS scenario_description,
                   ps.tier AS scenario_tier, ps.time_limit_minutes AS scenario_time_limit_minutes,
                   asub.submission_id, asub.score, asub.build_id, asub.submitted_at
            FROM classroom_activities ca
            JOIN classrooms c ON c.classroom_id = ca.classroom_id
            JOIN admin_users a ON a.admin_id = c.instructor_id
            JOIN classroom_enrollments ce
              ON ce.classroom_id = c.classroom_id AND ce.student_id = %s
            LEFT JOIN pc_scenarios ps ON ps.scenario_id = ca.scenario_id
            LEFT JOIN activity_submissions asub
              ON asub.activity_id = ca.activity_id AND asub.student_id = ce.student_id
            WHERE c.is_archived = FALSE
            ORDER BY ca.scheduled_at ASC, ca.activity_id ASC;
            """,
            (student_id,),
        )

        activities: list[dict[str, Any]] = []
        for row in rows:
            formatted = _format_student_activity(row, tz)
            formatted["title"] = row["activity_name"]
            formatted["className"] = row.get("class_display_name") or row.get("class_name") or "Classroom"
            formatted["instructorName"] = row.get("instructor_name") or "Instructor"
            formatted["description"] = row.get("scenario_description") or ""
            formatted["tier"] = row.get("scenario_tier") or ""
            formatted["timeLimitMinutes"] = row.get("scenario_time_limit_minutes")
            formatted["status"] = (
                "completed"
                if formatted["isSubmitted"]
                else ("locked" if formatted["isLocked"] else "notStarted")
            )
            formatted["completion"] = (
                {"score": formatted["score"], "completedAt": formatted["submittedAt"]}
                if formatted["isSubmitted"]
                else None
            )
            activities.append(formatted)

        return {"ok": True, "activities": activities}

    @router.get("/api/student/activities/{activity_id}")
    async def api_student_get_activity(activity_id: int, request: Request):
        user = _require_student(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        student_id = int(user["id"])

        row = select_one(
            """
            SELECT ca.activity_id, ca.classroom_id, ca.scenario_id, ca.activity_name,
                   ca.scheduled_at, ca.due_at, ca.is_locked, ca.manual_override,
                   c.name AS class_name, c.display_name AS class_display_name,
                   COALESCE(NULLIF(trim(a.display_name), ''), a.username) AS instructor_name,
                   ps.activity_type,
                   asub.submission_id, asub.score, asub.build_id, asub.submitted_at
            FROM classroom_activities ca
            JOIN classrooms c ON c.classroom_id = ca.classroom_id
            JOIN admin_users a ON a.admin_id = c.instructor_id
            JOIN classroom_enrollments ce
              ON ce.classroom_id = c.classroom_id AND ce.student_id = %s
            LEFT JOIN pc_scenarios ps ON ps.scenario_id = ca.scenario_id
            LEFT JOIN activity_submissions asub
              ON asub.activity_id = ca.activity_id AND asub.student_id = ce.student_id
            WHERE ca.activity_id = %s AND c.is_archived = FALSE
            LIMIT 1;
            """,
            (student_id, activity_id),
        )
        if not row:
            raise HTTPException(status_code=404, detail={"error": "Classroom activity not found"})

        formatted = _format_student_activity(row, tz)
        formatted["className"] = row.get("class_display_name") or row.get("class_name") or "Classroom"
        formatted["instructorName"] = row.get("instructor_name") or "Instructor"
        return {"ok": True, "activity": formatted}

    @router.post("/api/student/activities/{activity_id}/submit")
    async def api_student_submit_activity(activity_id: int, request: Request):
        user = _require_student(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        tz = get_schedule_timezone()
        student_id = int(user["id"])

        if "score" not in payload:
            raise HTTPException(status_code=400, detail={"error": "Score between 0 and 100 is required"})
        score_val = _parse_score(payload.get("score"))
        if score_val is None:
            raise HTTPException(status_code=400, detail={"error": "Score between 0 and 100 is required"})

        raw_build_id = payload.get("buildId")
        build_id: int | None = None
        if raw_build_id not in (None, ""):
            build_id = _parse_int_id(raw_build_id, "buildId")

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT ca.activity_id, ca.classroom_id, ca.is_locked
                FROM classroom_activities ca
                JOIN classrooms c ON c.classroom_id = ca.classroom_id
                WHERE ca.activity_id = %s AND c.is_archived = FALSE;
                """,
                (activity_id,),
            )
            activity = cur.fetchone()
            if not activity:
                raise HTTPException(status_code=404, detail={"error": "Classroom activity not found"})
            activity_dict = dict(activity)

            cur.execute(
                """
                SELECT enrollment_id
                FROM classroom_enrollments
                WHERE classroom_id = %s AND student_id = %s
                LIMIT 1;
                """,
                (int(activity_dict["classroom_id"]), student_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail={"error": "You are not enrolled in this activity's classroom"},
                )

            if bool(activity_dict.get("is_locked")):
                raise HTTPException(
                    status_code=409,
                    detail={"error": "This activity is currently locked and cannot accept submissions"},
                )

            cur.execute(
                """
                INSERT INTO activity_submissions (activity_id, student_id, build_id, score, submitted_at, updated_at)
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (activity_id, student_id)
                DO UPDATE SET
                    build_id = COALESCE(EXCLUDED.build_id, activity_submissions.build_id),
                    score = EXCLUDED.score,
                    submitted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING submission_id, activity_id, student_id, build_id, score, submitted_at;
                """,
                (activity_id, student_id, build_id, score_val),
            )
            saved = dict(cur.fetchone())
            return {
                "ok": True,
                "submission": {
                    "id": str(saved["submission_id"]),
                    "activityId": str(saved["activity_id"]),
                    "studentId": str(saved["student_id"]),
                    "buildId": int(saved["build_id"]) if saved.get("build_id") is not None else None,
                    "score": int(saved["score"]),
                    "submittedAt": _format_iso_timestamp(saved.get("submitted_at"), tz),
                },
            }

        return _run_in_transaction(db_conn, _tx)

    @router.post("/api/student/classrooms/join")
    async def api_student_join_classroom(request: Request):
        user = _require_student(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        student_id = int(user["id"])

        join_code = _clean_str(payload.get("joinCode")).upper()
        if not join_code:
            raise HTTPException(status_code=400, detail={"error": "Join code is required"})

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT c.classroom_id, c.name, c.display_name, c.join_code, c.student_capacity,
                       COALESCE(NULLIF(trim(a.display_name), ''), a.username) AS instructor_name
                FROM classrooms c
                JOIN admin_users a ON a.admin_id = c.instructor_id
                WHERE UPPER(c.join_code) = UPPER(%s) AND c.is_archived = FALSE
                LIMIT 1;
                """,
                (join_code,),
            )
            classroom = cur.fetchone()
            if not classroom:
                raise HTTPException(status_code=404, detail={"error": "Invalid classroom join code"})
            classroom_dict = dict(classroom)
            cid = int(classroom_dict["classroom_id"])

            cur.execute(
                """
                SELECT enrollment_id
                FROM classroom_enrollments
                WHERE classroom_id = %s AND student_id = %s
                LIMIT 1;
                """,
                (cid, student_id),
            )
            if cur.fetchone():
                raise HTTPException(status_code=409, detail={"error": "You are already enrolled in this classroom"})

            cap = classroom_dict.get("student_capacity")
            if cap is not None:
                cur.execute(
                    "SELECT COUNT(*) AS count FROM classroom_enrollments WHERE classroom_id = %s;",
                    (cid,),
                )
                enrolled_count = int((dict(cur.fetchone() or {}).get("count")) or 0)
                if enrolled_count >= int(cap):
                    raise HTTPException(status_code=400, detail={"error": "Classroom has reached its student capacity"})

            cur.execute(
                """
                INSERT INTO classroom_enrollments (classroom_id, student_id)
                VALUES (%s, %s)
                RETURNING enrollment_id;
                """,
                (cid, student_id),
            )
            cur.execute(
                """
                UPDATE classroom_invitations
                SET status = 'accepted',
                    responded_at = CURRENT_TIMESTAMP
                WHERE classroom_id = %s AND student_id = %s AND status = 'pending';
                """,
                (cid, student_id),
            )

            return {
                "ok": True,
                "classroom": {
                    "id": str(cid),
                    "name": classroom_dict["name"],
                    "displayName": classroom_dict["display_name"],
                    "joinCode": classroom_dict["join_code"],
                    "capacity": cap,
                    "instructorName": classroom_dict.get("instructor_name") or "Instructor",
                },
            }

        return _run_in_transaction(db_conn, _tx)

    @router.get("/api/student/invitations")
    async def api_student_list_invitations(request: Request):
        user = _require_student(request)
        _ensure_tables()
        tz = get_schedule_timezone()
        student_id = int(user["id"])

        rows = select_all(
            """
            SELECT ci.invitation_id, ci.classroom_id, ci.status, ci.created_at,
                   c.name AS classroom_name, c.display_name AS classroom_display_name, c.join_code,
                   a.admin_id AS instructor_id,
                   COALESCE(NULLIF(trim(a.display_name), ''), a.username) AS instructor_name
            FROM classroom_invitations ci
            JOIN classrooms c ON c.classroom_id = ci.classroom_id
            JOIN admin_users a ON a.admin_id = c.instructor_id
            WHERE ci.student_id = %s AND ci.status = 'pending' AND c.is_archived = FALSE
            ORDER BY ci.created_at DESC, ci.invitation_id DESC;
            """,
            (student_id,),
        )
        invitations = [
            {
                "id": str(row["invitation_id"]),
                "classroomId": str(row["classroom_id"]),
                "classroomName": row["classroom_name"],
                "classroomDisplayName": row["classroom_display_name"],
                "joinCode": row["join_code"],
                "instructorId": str(row["instructor_id"]),
                "instructorName": row["instructor_name"],
                "status": row["status"],
                "createdAt": _format_iso_timestamp(row.get("created_at"), tz),
            }
            for row in rows
        ]
        return {"ok": True, "invitations": invitations}

    @router.post("/api/student/invitations/{invitation_id}/respond")
    async def api_student_respond_invitation(invitation_id: int, request: Request):
        user = _require_student(request)
        _ensure_tables()
        payload = await _read_json_dict(request)
        student_id = int(user["id"])

        action = _clean_str(payload.get("action")).lower()
        if action not in {"accept", "decline"}:
            raise HTTPException(status_code=400, detail={"error": "Action must be 'accept' or 'decline'"})

        def _tx(cur: Any) -> dict[str, Any]:
            cur.execute(
                """
                SELECT ci.invitation_id, ci.classroom_id, ci.status,
                       c.student_capacity, c.is_archived
                FROM classroom_invitations ci
                JOIN classrooms c ON c.classroom_id = ci.classroom_id
                WHERE ci.invitation_id = %s AND ci.student_id = %s
                LIMIT 1;
                """,
                (invitation_id, student_id),
            )
            inv = cur.fetchone()
            if not inv:
                raise HTTPException(status_code=404, detail={"error": "Invitation not found"})
            inv_dict = dict(inv)
            if inv_dict.get("status") != "pending":
                raise HTTPException(status_code=409, detail={"error": "Invitation has already been responded to"})

            if action == "accept":
                if inv_dict.get("is_archived"):
                    raise HTTPException(status_code=404, detail={"error": "Classroom is no longer active"})
                cid = int(inv_dict["classroom_id"])
                cur.execute(
                    """
                    SELECT enrollment_id
                    FROM classroom_enrollments
                    WHERE classroom_id = %s AND student_id = %s
                    LIMIT 1;
                    """,
                    (cid, student_id),
                )
                already_enrolled = cur.fetchone()
                if not already_enrolled:
                    cap = inv_dict.get("student_capacity")
                    if cap is not None:
                        cur.execute(
                            "SELECT COUNT(*) AS count FROM classroom_enrollments WHERE classroom_id = %s;",
                            (cid,),
                        )
                        enrolled_count = int((dict(cur.fetchone() or {}).get("count")) or 0)
                        if enrolled_count >= int(cap):
                            raise HTTPException(status_code=400, detail={"error": "Classroom has reached its student capacity"})
                    cur.execute(
                        "INSERT INTO classroom_enrollments (classroom_id, student_id) VALUES (%s, %s);",
                        (cid, student_id),
                    )
                cur.execute(
                    """
                    UPDATE classroom_invitations
                    SET status = 'accepted',
                        responded_at = CURRENT_TIMESTAMP
                    WHERE invitation_id = %s;
                    """,
                    (invitation_id,),
                )
                return {"ok": True, "status": "accepted"}

            cur.execute(
                """
                UPDATE classroom_invitations
                SET status = 'declined',
                    responded_at = CURRENT_TIMESTAMP
                WHERE invitation_id = %s;
                """,
                (invitation_id,),
            )
            return {"ok": True, "status": "declined"}

        return _run_in_transaction(db_conn, _tx)

    return router
