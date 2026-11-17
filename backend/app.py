from __future__ import annotations
import hashlib
import html
import hmac
import json
import logging
import os
import re
import secrets
import socket
import time
import urllib.parse
from decimal import Decimal
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor, Json
from database import get_db_connection
from core.security import (
    password_hash_bcrypt, verify_password_bcrypt, sign_admin_session, sign_app_session,
    verify_admin_session, verify_app_session, revoke_admin_session, check_account_lockout,
    record_login_attempt, secure_random_token, generate_csrf_token, verify_csrf_token,
    get_client_ip, create_safe_error_response, is_safe_redirect_url,
    ADMIN_COOKIE_NAME, APP_COOKIE_NAME, CSRF_COOKIE_NAME, ADMIN_SESSION_SECONDS, APP_SESSION_SECONDS
)
from core.validators import (
    clean_text, validate_email, validate_password, validate_username, validate_name,
    validate_title, validate_description, validate_integer, validate_list, validate_dict,
    validate_boolean
)
from core.middleware import RateLimitMiddleware, SecurityHeadersMiddleware, RequestValidationMiddleware, AuditLoggingMiddleware

# Configure audit logger
audit_logger = logging.getLogger("security_audit")

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
TEMPLATES_DIR = PROJECT_ROOT / "frontend" / "templates"
STATIC_DIR = PROJECT_ROOT / "frontend" / "static"
REACT_INDEX = STATIC_DIR / "app" / "index.html"

def detect_lan_ip() -> str | None:
    """Best-effort LAN IP detection for development URLs."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except Exception:
        return None


def cors_origins_from_env() -> list[str]:
    """Return explicit CORS origins, including LAN defaults for local development."""
    configured = os.getenv("ALLOWED_CORS_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    port = os.getenv("APP_PORT", "5000")
    origins = {
        "http://localhost:3000",
        f"http://localhost:{port}",
        f"http://127.0.0.1:{port}",
    }
    lan_ip = detect_lan_ip()
    if lan_ip:
        origins.add(f"http://{lan_ip}:{port}")
    return sorted(origins)


ALLOWED_CORS_ORIGINS = cors_origins_from_env()
ALLOW_DEV_LAN_CORS = os.getenv("ENVIRONMENT", "development").lower() != "production"
DEV_LAN_CORS_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
)

app = FastAPI(
    title="ASSEMBLY PC",
    description="Educational PC Assembly Simulator with FastAPI",
    version="2.0.0"
)

# ============================================================
# MIDDLEWARE & SECURITY
# ============================================================

# Add security middleware in order (order matters!)
app.add_middleware(AuditLoggingMiddleware)
app.add_middleware(RequestValidationMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

# Configure CORS - restrict to specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_origin_regex=DEV_LAN_CORS_REGEX if ALLOW_DEV_LAN_CORS else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)


# ============================================================
# SERVE STATIC FILES
# ============================================================

try:
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
except Exception as e:
    print(f"Warning: Could not mount static directory: {e}")


# ============================================================
# SMALL JSON HELPERS
# ============================================================

def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    return value


# ============================================================
# DATABASE HELPERS
# ============================================================

def run_select(query: str, params: tuple | None = None) -> list[dict[str, Any]]:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            return to_jsonable(cur.fetchall())
    finally:
        conn.close()


def run_select_one(query: str, params: tuple | None = None) -> dict[str, Any] | None:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            row = cur.fetchone()
            return to_jsonable(row) if row else None
    finally:
        conn.close()


def run_write(query: str, params: tuple | None = None) -> dict[str, Any] | None:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            row = None
            try:
                row = cur.fetchone()
            except Exception:
                row = None
            conn.commit()
            return to_jsonable(row) if row else None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ============================================================
# ADMIN AUTH & SECURITY CONFIGURATION
# ============================================================

ADMIN_ALLOWED_BACK_PATHS = {"/", "/simulator"}
INSTRUCTOR_EMAIL_DOMAINS = {"lnu.edu.ph"}


def is_bcrypt_hash(value: str | None) -> bool:
    return bool(value and value.startswith(("$2a$", "$2b$", "$2y$")))


def ensure_admin_users_table() -> None:
    run_write("""
        CREATE TABLE IF NOT EXISTS admin_users (
            admin_id SERIAL PRIMARY KEY,
            username VARCHAR(80) NOT NULL UNIQUE,
            password_hash VARCHAR(256) NOT NULL,
            display_name VARCHAR(120),
            role VARCHAR(20) NOT NULL DEFAULT 'admin',
            is_active BOOLEAN DEFAULT TRUE,
            last_login_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    run_write("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin';")
    run_write("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;")
    run_write("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")
    run_write("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);")
    run_write("ALTER TABLE admin_users DROP COLUMN IF EXISTS password_salt;")
    run_write("UPDATE admin_users SET role = 'instructor' WHERE username LIKE '%%@%%' AND role = 'admin';")
    run_write("UPDATE admin_users SET role = 'admin' WHERE username = 'admin';")
    existing = run_select_one("SELECT COUNT(*) AS count FROM admin_users;")
    if int(existing.get("count") or 0) == 0:
        try:
            _, pw_hash = password_hash_bcrypt("admin123")
            run_write(
                """
                INSERT INTO admin_users (username, password_hash, display_name, role)
                VALUES (%s, %s, %s, %s);
                """,
                ("admin", pw_hash, "Administrator", "admin"),
            )
            audit_logger.info("Default admin user created. CHANGE THE PASSWORD IMMEDIATELY!")
        except Exception as e:
            audit_logger.error(f"Failed to create default admin user: {e}")
        return

    default_admin = run_select_one(
        "SELECT username, password_hash, role FROM admin_users WHERE username = %s;",
        ("admin",),
    )
    if default_admin and not is_bcrypt_hash(default_admin.get("password_hash")):
        try:
            _, pw_hash = password_hash_bcrypt("admin123")
            run_write(
                """
                UPDATE admin_users
                SET password_hash = %s,
                    role = 'admin',
                    is_active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE username = %s;
                """,
                (pw_hash, "admin"),
            )
            audit_logger.warning("Default admin password hash migrated to bcrypt. CHANGE THE PASSWORD IMMEDIATELY!")
        except Exception as e:
            audit_logger.error(f"Failed to migrate default admin password hash: {e}")


def ensure_student_users_table() -> None:
    run_write("""
        CREATE TABLE IF NOT EXISTS student_users (
            student_id SERIAL PRIMARY KEY,
            school_id VARCHAR(80) NOT NULL UNIQUE,
            email VARCHAR(180) NOT NULL UNIQUE,
            password_hash VARCHAR(256) NOT NULL,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            display_name VARCHAR(180),
            is_active BOOLEAN DEFAULT TRUE,
            last_login_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    run_write("ALTER TABLE student_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;")
    run_write("ALTER TABLE student_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")
    run_write("ALTER TABLE student_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);")
    run_write("ALTER TABLE student_users DROP COLUMN IF EXISTS password_salt;")



def ensure_auth_tables() -> None:
    ensure_admin_users_table()
    ensure_student_users_table()
    ensure_scenarios_table()
    ensure_social_tables()


def ensure_scenarios_table() -> None:
    ensure_admin_users_table()
    run_write("""
        CREATE TABLE IF NOT EXISTS pc_scenarios (
            scenario_id SERIAL PRIMARY KEY,
            instructor_id INTEGER REFERENCES admin_users(admin_id) ON DELETE CASCADE,
            title VARCHAR(180) NOT NULL,
            description TEXT,
            activity_type VARCHAR(60) DEFAULT 'build',
            tier VARCHAR(60),
            budget NUMERIC(12, 2),
            time_limit_minutes INTEGER,
            objectives JSONB DEFAULT '[]'::jsonb,
            troubleshooting JSONB DEFAULT '[]'::jsonb,
            constraints JSONB DEFAULT '{}'::jsonb,
            is_published BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def ensure_social_tables() -> None:
    ensure_saved_builds_table()
    run_write("""
        CREATE TABLE IF NOT EXISTS build_favorites (
            favorite_id SERIAL PRIMARY KEY,
            build_id INTEGER REFERENCES saved_builds(build_id) ON DELETE CASCADE,
            user_role VARCHAR(20) NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(build_id, user_role, user_id)
        );
    """)
    run_write("""
        CREATE TABLE IF NOT EXISTS build_hearts (
            heart_id SERIAL PRIMARY KEY,
            build_id INTEGER REFERENCES saved_builds(build_id) ON DELETE CASCADE,
            user_role VARCHAR(20) NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(build_id, user_role, user_id)
        );
    """)
    run_write("""
        CREATE TABLE IF NOT EXISTS user_badges (
            badge_id SERIAL PRIMARY KEY,
            user_role VARCHAR(20) NOT NULL,
            user_id INTEGER NOT NULL,
            badge_key VARCHAR(80) NOT NULL,
            badge_name VARCHAR(120) NOT NULL,
            badge_description TEXT,
            earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_role, user_id, badge_key)
        );
    """)
    run_write("""
        CREATE TABLE IF NOT EXISTS scenario_completions (
            completion_id SERIAL PRIMARY KEY,
            scenario_id INTEGER REFERENCES pc_scenarios(scenario_id) ON DELETE CASCADE,
            user_role VARCHAR(20) NOT NULL,
            user_id INTEGER NOT NULL,
            score INTEGER,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(scenario_id, user_role, user_id)
        );
    """)


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def search_terms(value: Any) -> list[str]:
    terms: list[str] = []
    for term in re.split(r"\s+", clean_text(value).lower()):
        term = term.strip()
        if len(term) >= 2 and term not in terms:
            terms.append(term)
    return terms[:6]


def token_search_clause(columns: list[str], terms: list[str]) -> tuple[str, tuple[str, ...]]:
    """Build an AND-of-terms / OR-of-columns ILIKE clause for natural name search."""
    if not terms or not columns:
        return "FALSE", ()
    per_term = "(" + " OR ".join(f"{column} ILIKE %s" for column in columns) + ")"
    clause = " AND ".join(per_term for _ in terms)
    params = tuple(f"%{term}%" for term in terms for _ in columns)
    return clause, params


def normalize_email(value: Any) -> str:
    return clean_text(value).lower()


def is_valid_email(email_value: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_value))


def is_institutional_email(email_value: str) -> bool:
    domain = email_value.rsplit("@", 1)[-1].lower() if "@" in email_value else ""
    return domain in INSTRUCTOR_EMAIL_DOMAINS


def public_student_user(user: dict[str, Any]) -> dict[str, Any]:
    public = {
        "id": user.get("student_id"),
        "role": "student",
        "studentId": user.get("school_id"),
        "email": user.get("email"),
        "displayName": user.get("display_name") or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
    }
    public["profileUrl"] = public_profile_url(public) if public.get("id") else "/profile"
    return public


def public_instructor_user(user: dict[str, Any]) -> dict[str, Any]:
    public = {
        "id": user.get("admin_id"),
        "role": user.get("role") or "instructor",
        "email": user.get("username"),
        "displayName": user.get("display_name") or user.get("username"),
    }
    public["profileUrl"] = public_profile_url(public) if public.get("id") else "/profile"
    return public


def get_admin_user_by_username(username: str) -> dict[str, Any] | None:
    ensure_admin_users_table()
    return run_select_one(
        """
        SELECT admin_id, username, display_name, role, is_active
        FROM admin_users
        WHERE username = %s AND is_active = TRUE;
        """,
        (username,),
    )


def get_student_user_by_school_id(school_id: str) -> dict[str, Any] | None:
    ensure_student_users_table()
    return run_select_one(
        """
        SELECT student_id, school_id, email, first_name, last_name, display_name, is_active
        FROM student_users
        WHERE lower(school_id) = lower(%s) AND is_active = TRUE;
        """,
        (school_id,),
    )


def verify_admin_credentials(username: str, password: str) -> dict[str, Any] | None:
    ensure_admin_users_table()
    user = run_select_one(
        """
        SELECT admin_id, username, password_hash, display_name, role, is_active
        FROM admin_users
        WHERE username = %s;
        """,
        (username,),
    )
    if not user or not user.get("is_active"):
        record_login_attempt(username, success=False)
        return None
    
    if not verify_password_bcrypt(password, user["password_hash"]):
        record_login_attempt(username, success=False)
        return None
    
    record_login_attempt(username, success=True)
    return user


def verify_student_credentials(school_id: str, password: str) -> dict[str, Any] | None:
    ensure_student_users_table()
    user = run_select_one(
        """
        SELECT student_id, school_id, email, password_hash,
               first_name, last_name, display_name, is_active
        FROM student_users
        WHERE lower(school_id) = lower(%s);
        """,
        (school_id,),
    )
    if not user or not user.get("is_active"):
        record_login_attempt(school_id, success=False)
        return None
    
    if not verify_password_bcrypt(password, user["password_hash"]):
        record_login_attempt(school_id, success=False)
        return None
    
    record_login_attempt(school_id, success=True)
    return user


def create_student_user(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_student_users_table()
    first_name = clean_text(payload.get("firstName") or payload.get("first_name"))
    last_name = clean_text(payload.get("lastName") or payload.get("last_name"))
    email_value = normalize_email(payload.get("email"))
    school_id = clean_text(payload.get("studentId") or payload.get("student_id") or payload.get("school_id"))
    password = str(payload.get("password") or "")

    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail={"error": "First name and last name are required"})
    if not school_id:
        raise HTTPException(status_code=400, detail={"error": "Student ID is required"})
    if not is_valid_email(email_value):
        raise HTTPException(status_code=400, detail={"error": "A valid email address is required"})
    if len(password) < 8:
        raise HTTPException(status_code=400, detail={"error": "Password must be at least 8 characters"})
    if len(school_id) > 80:
        raise HTTPException(status_code=400, detail={"error": "Student account could not be created because the Student ID is too long"})
    if len(email_value) > 180:
        raise HTTPException(status_code=400, detail={"error": "Student account could not be created because the email address is too long"})
    if len(first_name) > 100 or len(last_name) > 100:
        raise HTTPException(status_code=400, detail={"error": "Student account could not be created because the first or last name is too long"})

    existing = run_select_one(
        """
        SELECT school_id, email
        FROM student_users
        WHERE lower(school_id) = lower(%s) OR lower(email) = lower(%s)
        LIMIT 1;
        """,
        (school_id, email_value),
    )
    if existing:
        if str(existing.get("school_id") or "").lower() == school_id.lower():
            raise HTTPException(status_code=409, detail={"error": "Account is already registered."})
        if str(existing.get("email") or "").lower() == email_value.lower():
            raise HTTPException(status_code=409, detail={"error": "Account is already registered."})

def create_student_user(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_student_users_table()
    try:
        first_name = validate_name(clean_text(payload.get("firstName") or payload.get("first_name") or ""), "First name")
        last_name = validate_name(clean_text(payload.get("lastName") or payload.get("last_name") or ""), "Last name")
        email_value = validate_email(payload.get("email"))
        school_id = validate_username(clean_text(payload.get("studentId") or payload.get("student_id") or payload.get("school_id") or ""))
        password = validate_password(str(payload.get("password") or ""))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": f"Invalid input: {str(e)}"})

    existing = run_select_one(
        """
        SELECT school_id, email
        FROM student_users
        WHERE lower(school_id) = lower(%s) OR lower(email) = lower(%s)
        LIMIT 1;
        """,
        (school_id, email_value),
    )
    if existing:
        if str(existing.get("school_id") or "").lower() == school_id.lower():
            raise HTTPException(status_code=409, detail={"error": "Account with this Student ID already exists"})
        if str(existing.get("email") or "").lower() == email_value.lower():
            raise HTTPException(status_code=409, detail={"error": "Account with this email address already exists"})

    try:
        _, pw_hash = password_hash_bcrypt(password)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": "Password hashing failed"})
    
    display_name = f"{first_name} {last_name}".strip()
    try:
        user = run_write(
            """
            INSERT INTO student_users
                (school_id, email, password_hash, first_name, last_name, display_name)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING student_id, school_id, email, first_name, last_name, display_name, created_at::text AS created_at;
            """,
            (school_id, email_value, pw_hash, first_name, last_name, display_name),
        )
    except Exception as exc:
        audit_logger.error(f"Student registration failed: {str(exc)}")
        if "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail={"error": "Account already exists"})
        raise HTTPException(status_code=400, detail={"error": "Account creation failed. Please try again."})
    
    audit_logger.info(f"New student account created: {school_id}")
    return user


def create_instructor_user(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_admin_users_table()
    try:
        first_name = validate_name(clean_text(payload.get("firstName") or payload.get("first_name") or ""), "First name")
        last_name = validate_name(clean_text(payload.get("lastName") or payload.get("last_name") or ""), "Last name")
        email_value = validate_email(payload.get("email"))
        department = clean_text(payload.get("department") or "")
        password = validate_password(str(payload.get("password") or ""))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": f"Invalid input: {str(e)}"})

    if not is_institutional_email(email_value):
        raise HTTPException(status_code=400, detail={"error": "Please use an approved institutional email address"})

    existing = run_select_one(
        """
        SELECT username
        FROM admin_users
        WHERE lower(username) = lower(%s)
        LIMIT 1;
        """,
        (email_value,),
    )
    if existing:
        raise HTTPException(status_code=409, detail={"error": "Account with this email address already exists"})

    try:
        _, pw_hash = password_hash_bcrypt(password)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": "Password hashing failed"})
    
    display_name = f"{first_name} {last_name}".strip()
    if department:
        display_name = f"{display_name} ({department})"
    try:
        user = run_write(
            """
            INSERT INTO admin_users (username, password_hash, display_name, role)
            VALUES (%s, %s, %s, %s)
            RETURNING admin_id, username, display_name, role, is_active, created_at::text AS created_at;
            """,
            (email_value, pw_hash, display_name, "instructor"),
        )
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail={"error": "Account is already registered."})
        raise HTTPException(status_code=400, detail={"error": "Instructor account could not be created", "details": str(exc)})
    return user


def delete_user_account(user_type: str, user_id: int) -> dict[str, Any]:
    """Delete a student or instructor and all data owned by that account."""
    if user_type not in {"students", "instructors"}:
        raise HTTPException(status_code=400, detail={"error": "Invalid user type"})

    ensure_auth_tables()
    ensure_saved_builds_table()
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if user_type == "students":
                cur.execute(
                    "SELECT student_id, school_id, display_name FROM student_users WHERE student_id = %s;",
                    (user_id,),
                )
                user = cur.fetchone()
                if not user:
                    raise HTTPException(status_code=404, detail={"error": "Student account not found"})
                owner_role = "student"
                delete_user_sql = "DELETE FROM student_users WHERE student_id = %s RETURNING student_id AS id;"
            else:
                cur.execute(
                    """
                    SELECT admin_id, username, display_name, role
                    FROM admin_users
                    WHERE admin_id = %s AND role = 'instructor';
                    """,
                    (user_id,),
                )
                user = cur.fetchone()
                if not user:
                    raise HTTPException(status_code=404, detail={"error": "Instructor account not found"})
                owner_role = "instructor"
                delete_user_sql = "DELETE FROM admin_users WHERE admin_id = %s AND role = 'instructor' RETURNING admin_id AS id;"

                cur.execute(
                    """
                    DELETE FROM scenario_completions
                    WHERE scenario_id IN (
                        SELECT scenario_id FROM pc_scenarios WHERE instructor_id = %s
                    );
                    """,
                    (user_id,),
                )
                cur.execute("DELETE FROM pc_scenarios WHERE instructor_id = %s;", (user_id,))

            cur.execute(
                """
                DELETE FROM build_favorites
                WHERE build_id IN (
                    SELECT build_id FROM saved_builds
                    WHERE owner_role = %s AND owner_id = %s
                );
                """,
                (owner_role, user_id),
            )
            cur.execute(
                """
                DELETE FROM build_hearts
                WHERE build_id IN (
                    SELECT build_id FROM saved_builds
                    WHERE owner_role = %s AND owner_id = %s
                );
                """,
                (owner_role, user_id),
            )
            cur.execute(
                "DELETE FROM build_favorites WHERE user_role = %s AND user_id = %s;",
                (owner_role, user_id),
            )
            cur.execute(
                "DELETE FROM build_hearts WHERE user_role = %s AND user_id = %s;",
                (owner_role, user_id),
            )
            cur.execute(
                "DELETE FROM user_badges WHERE user_role = %s AND user_id = %s;",
                (owner_role, user_id),
            )
            cur.execute(
                "DELETE FROM scenario_completions WHERE user_role = %s AND user_id = %s;",
                (owner_role, user_id),
            )
            cur.execute(
                "DELETE FROM saved_builds WHERE owner_role = %s AND owner_id = %s;",
                (owner_role, user_id),
            )
            cur.execute(delete_user_sql, (user_id,))
            deleted = cur.fetchone()
            conn.commit()
            return {
                "ok": True,
                "deleted": bool(deleted),
                "userType": user_type,
                "id": user_id,
            }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        audit_logger.error(f"Failed to delete {user_type} user {user_id}: {exc}")
        raise HTTPException(status_code=400, detail={"error": "User account could not be deleted", "details": str(exc)})
    finally:
        conn.close()


def set_app_session_cookie(response: JSONResponse | RedirectResponse, role: str, subject: str, remember: bool = True) -> None:
    """Set application session cookie with secure settings."""
    token = sign_app_session(role, subject)
    is_secure = os.getenv("ENVIRONMENT", "development").lower() == "production"
    response.set_cookie(
        APP_COOKIE_NAME,
        token,
        max_age=APP_SESSION_SECONDS if remember else None,
        httponly=True,
        samesite="lax",
        secure=is_secure,
    )


def set_admin_session_cookie(response: JSONResponse | RedirectResponse, username: str) -> None:
    """Set admin session cookie with secure settings."""
    token = sign_admin_session(username)
    is_secure = os.getenv("ENVIRONMENT", "development").lower() == "production"
    response.set_cookie(
        ADMIN_COOKIE_NAME,
        token,
        max_age=ADMIN_SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=is_secure,
    )


def clear_auth_cookies(response: JSONResponse | RedirectResponse) -> None:
    response.delete_cookie(APP_COOKIE_NAME)
    response.delete_cookie(ADMIN_COOKIE_NAME)


def require_admin(request: Request) -> str:
    username = verify_admin_session(request.cookies.get(ADMIN_COOKIE_NAME))
    if not username:
        raise HTTPException(status_code=401, detail={"error": "Admin login required"})
    return username


def current_auth_user(request: Request) -> dict[str, Any] | None:
    app_session = verify_app_session(request.cookies.get(APP_COOKIE_NAME))
    if app_session:
        role, subject = app_session
        if role == "student":
            user = get_student_user_by_school_id(subject)
            return public_student_user(user) if user else None
        if role == "instructor":
            user = get_admin_user_by_username(subject)
            return public_instructor_user(user) if user else None
        if role == "admin":
            user = get_admin_user_by_username(subject)
            return public_instructor_user(user) if user and user.get("role") == "admin" else None

    admin_username = verify_admin_session(request.cookies.get(ADMIN_COOKIE_NAME))
    if admin_username:
        user = get_admin_user_by_username(admin_username)
        return public_instructor_user(user) if user else None

    return None


def require_logged_in(request: Request) -> dict[str, Any]:
    user = current_auth_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"error": "Login required"})
    return user


def require_instructor(request: Request) -> dict[str, Any]:
    user = require_logged_in(request)
    if user.get("role") != "instructor":
        raise HTTPException(status_code=403, detail={"error": "Instructor access required"})
    return user


def mark_user_logged_in(role: str, user_id: int | None = None, username: str | None = None, school_id: str | None = None) -> None:
    if role == "student" and school_id:
        run_write("UPDATE student_users SET last_login_at = CURRENT_TIMESTAMP WHERE lower(school_id) = lower(%s);", (school_id,))
    elif role in {"instructor", "admin"} and username:
        run_write("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE username = %s;", (username,))


def award_badge(user_role: str, user_id: int, key: str, name: str, description: str) -> None:
    ensure_social_tables()
    run_write(
        """
        INSERT INTO user_badges (user_role, user_id, badge_key, badge_name, badge_description)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (user_role, user_id, badge_key) DO NOTHING;
        """,
        (user_role, user_id, key, name, description),
    )


def sync_user_badges(user: dict[str, Any]) -> list[dict[str, Any]]:
    ensure_saved_builds_table()
    ensure_social_tables()
    role = user.get("role")
    user_id = int(user.get("id") or 0)
    if not role or not user_id:
        return []
    build_count = int((run_select_one(
        "SELECT COUNT(*) AS count FROM saved_builds WHERE owner_role = %s AND owner_id = %s;",
        (role, user_id),
    ) or {}).get("count") or 0)
    completion_count = int((run_select_one(
        "SELECT COUNT(*) AS count FROM scenario_completions WHERE user_role = %s AND user_id = %s;",
        (role, user_id),
    ) or {}).get("count") or 0)
    for milestone in (1, 10, 100):
        if build_count >= milestone:
            award_badge(role, user_id, f"build_{milestone}", f"{milestone} Build{'s' if milestone > 1 else ''}", f"Created {milestone} published build{'s' if milestone > 1 else ''}.")
    for milestone in (1, 10, 50, 100):
        if completion_count >= milestone:
            award_badge(role, user_id, f"scenario_{milestone}", f"{milestone} Scenario{'s' if milestone > 1 else ''}", f"Completed {milestone} instructor scenario{'s' if milestone > 1 else ''}.")
    return run_select(
        """
        SELECT badge_key AS key, badge_name AS name, badge_description AS description, earned_at::text AS earnedAt
        FROM user_badges
        WHERE user_role = %s AND user_id = %s
        ORDER BY earned_at DESC;
        """,
        (role, user_id),
    )


def public_profile_url(user: dict[str, Any]) -> str:
    role = user.get("role")
    profile_id = user.get("id")
    if role == "admin":
        return "/admin"
    return f"/profiles/{role}/{profile_id}" if role and profile_id else "/profile"


def get_public_profile(role: str, profile_id: int) -> dict[str, Any] | None:
    role = clean_text(role).lower()
    if role == "student":
        ensure_student_users_table()
        row = run_select_one(
            """
            SELECT student_id, school_id, email, display_name, first_name, last_name, created_at::text AS created_at
            FROM student_users
            WHERE student_id = %s AND is_active = TRUE;
            """,
            (profile_id,),
        )
        if not row:
            return None
        user = public_student_user(row)
        user["profileUrl"] = public_profile_url(user)
        user["joinedAt"] = row.get("created_at")
        return user
    if role in {"instructor", "admin", "teacher"}:
        ensure_admin_users_table()
        row = run_select_one(
            """
            SELECT admin_id, username, display_name, role, created_at::text AS created_at
            FROM admin_users
            WHERE admin_id = %s AND role = 'instructor' AND is_active = TRUE;
            """,
            (profile_id,),
        )
        if not row:
            return None
        user = public_instructor_user(row)
        user["profileUrl"] = public_profile_url(user)
        user["joinedAt"] = row.get("created_at")
        return user
    return None


def scenario_row_to_public(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("scenario_id"),
        "title": row.get("title"),
        "description": row.get("description") or "",
        "activityType": row.get("activity_type") or "build",
        "tier": row.get("tier") or "",
        "budget": float(row["budget"]) if row.get("budget") is not None else None,
        "timeLimitMinutes": row.get("time_limit_minutes"),
        "objectives": row.get("objectives") or [],
        "troubleshooting": row.get("troubleshooting") or [],
        "constraints": row.get("constraints") or {},
        "isPublished": bool(row.get("is_published")),
        "instructor": {
            "id": row.get("instructor_id"),
            "displayName": row.get("instructor_name") or row.get("instructor_email"),
            "email": row.get("instructor_email"),
            "profileUrl": f"/profiles/instructor/{row.get('instructor_id')}" if row.get("instructor_id") else None,
        },
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def safe_admin_back_url(raw_url: str | None, request: Request | None = None) -> str:
    if not raw_url:
        return "/"
    parsed = urllib.parse.urlparse(raw_url)
    if parsed.scheme or parsed.netloc:
        if not request or parsed.netloc != request.url.netloc:
            return "/"
    path = parsed.path or "/"
    if path not in ADMIN_ALLOWED_BACK_PATHS or path.startswith("/admin"):
        return "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{path}{query}"


def admin_login_url(back_url: str = "/") -> str:
    safe_back = safe_admin_back_url(back_url)
    return f"/admin/login?back={urllib.parse.quote(safe_back, safe='')}"


def admin_back_from_request(request: Request) -> str:
    requested_back = request.query_params.get("back") or request.query_params.get("next")
    referrer_back = request.headers.get("referer")
    return safe_admin_back_url(requested_back or referrer_back, request)


def render_admin_login(error: str = "", back_url: str = "/") -> str:
    error_html = f'<div class="error">{error}</div>' if error else ""
    safe_back = safe_admin_back_url(back_url)
    safe_back_attr = html.escape(safe_back, quote=True)
    login_action = html.escape(admin_login_url(safe_back), quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AssemblyPC Admin Login</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1b2e;font-family:Inter,sans-serif;color:#0f172a;padding:24px}}
.login{{width:min(380px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.28)}}
.brand{{font-family:Sora,sans-serif;font-size:22px;font-weight:800;color:#0d1b2e;margin-bottom:4px}}
.brand span{{color:#3ecf5e}}
.sub{{font-size:13px;color:#64748b;margin-bottom:22px}}
label{{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#334155;margin:12px 0 5px}}
input{{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;font-size:14px;font-family:Inter,sans-serif;outline:none}}
input:focus{{border-color:#3ecf5e;box-shadow:0 0 0 3px rgba(62,207,94,.14)}}
button{{width:100%;margin-top:18px;border:none;border-radius:8px;padding:11px 14px;background:#3ecf5e;color:#fff;font-weight:800;font-family:Sora,sans-serif;cursor:pointer}}
button:hover{{background:#28a745}}
.back{{display:inline-flex;align-items:center;gap:6px;color:#334155;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:18px}}
.back:hover{{color:#3ecf5e}}
.error{{padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;font-size:12px;margin-bottom:12px}}
.hint{{font-size:11px;color:#94a3b8;margin-top:14px;line-height:1.5}}
</style>
</head>
<body>
<form class="login" method="post" action="{login_action}">
  <a class="back" href="{safe_back_attr}">&larr; Back</a>
  <div class="brand">Assembly<span>PC</span></div>
  <div class="sub">Admin access required</div>
  {error_html}
  <label for="username">Username</label>
  <input id="username" name="username" autocomplete="username" required/>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required/>
  <button type="submit">Log In</button>
</form>
</body>
</html>"""


# ============================================================
# TEMPLATE RENDERING
# ============================================================

def read_and_process_template(template_name: str) -> str:
    """Read template file and process Jinja2-like placeholders."""
    template_path = TEMPLATES_DIR / template_name
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_name}")
    with open(template_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace Flask url_for calls with static paths
    import re
    # Replace {{ url_for('static', filename='...') }} with /static/...
    content = re.sub(
        r"{{\s*url_for\('static',\s*filename='([^']+)'\)\s*}}",
        r"/static/\1",
        content
    )
    content = re.sub(
        r'{{\s*url_for\("static",\s*filename="([^"]+)"\)\s*}}',
        r"/static/\1",
        content
    )
    if "</head>" in content and "rel=\"icon\"" not in content and "rel='icon'" not in content:
        favicon_link = '<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>'
        content = content.replace("</head>", f"{favicon_link}\n</head>", 1)
    return content


# ============================================================
# PAGE ROUTES
# ============================================================

def serve_react_app() -> FileResponse:
    if not REACT_INDEX.is_file():
        raise HTTPException(
            status_code=503,
            detail="React frontend is not built. Run npm install and npm run build in frontend.",
        )
    return FileResponse(REACT_INDEX)


@app.get("/", response_class=HTMLResponse)
async def home():
    """Serve the React application."""
    return serve_react_app()


@app.get("/simulator", response_class=HTMLResponse)
async def simulator():
    """Serve the React PC simulator."""
    return serve_react_app()


@app.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    """Serve the React admin login page."""
    if verify_admin_session(request.cookies.get(ADMIN_COOKIE_NAME)):
        return RedirectResponse("/admin", status_code=303)
    return serve_react_app()


@app.post("/admin/login")
async def admin_login(request: Request):
    """Authenticate an admin user with account lockout protection."""
    back_url = admin_back_from_request(request)
    try:
        form = urllib.parse.parse_qs((await request.body()).decode("utf-8"))
        username = (form.get("username", [""])[0] or "").strip()
        password = form.get("password", [""])[0] or ""
    except Exception:
        return HTMLResponse(render_admin_login("Invalid request format.", back_url), status_code=400)
    
    # Check account lockout
    if check_account_lockout(username):
        audit_logger.warning(f"Locked account login attempt: {username} from {get_client_ip(request)}")
        return HTMLResponse(
            render_admin_login("Account locked due to too many failed login attempts. Try again later.", back_url),
            status_code=429
        )
    
    user = verify_admin_credentials(username, password)
    if not user or user.get("role") != "admin":
        audit_logger.warning(f"Failed admin login: {username} from {get_client_ip(request)}")
        return HTMLResponse(render_admin_login("Invalid username or password.", back_url), status_code=401)
    
    response = RedirectResponse("/admin", status_code=303)
    mark_user_logged_in("admin", username=user["username"])
    set_app_session_cookie(response, "admin", user["username"])
    set_admin_session_cookie(response, user["username"])
    audit_logger.info(f"Admin login successful: {username} from {get_client_ip(request)}")
    return response


@app.get("/admin/logout")
async def admin_logout(request: Request):
    """Log out the current admin user."""
    revoke_admin_session(request.cookies.get(ADMIN_COOKIE_NAME))
    response = RedirectResponse("/", status_code=303)
    clear_auth_cookies(response)
    return response


@app.post("/admin/logout")
async def admin_logout_background(request: Request):
    """Clear admin cookies from page-exit background requests."""
    revoke_admin_session(request.cookies.get(ADMIN_COOKIE_NAME))
    response = JSONResponse({"ok": True})
    clear_auth_cookies(response)
    return response


@app.get("/admin", response_class=HTMLResponse)
async def admin(request: Request):
    """Serve the React admin dashboard."""
    if not verify_admin_session(request.cookies.get(ADMIN_COOKIE_NAME)):
        return RedirectResponse(admin_login_url(admin_back_from_request(request)), status_code=303)
    return serve_react_app()


@app.get("/gallery", response_class=HTMLResponse)
async def gallery():
    """Serve the React build gallery."""
    return serve_react_app()


@app.get("/profile", response_class=HTMLResponse)
async def profile(request: Request):
    """Serve the React user profile."""
    user = current_auth_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    if user.get("role") == "admin":
        return RedirectResponse("/admin", status_code=303)
    return serve_react_app()


@app.get("/profiles/{role}/{profile_id}", response_class=HTMLResponse)
async def visited_profile(role: str, profile_id: int):
    """Serve the React public profile view."""
    target = get_public_profile(role, profile_id)
    if not target:
        raise HTTPException(status_code=404, detail={"error": "Profile not found"})
    return serve_react_app()


@app.get("/search", response_class=HTMLResponse)
async def search_page():
    """Serve React search results."""
    return serve_react_app()


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """Serve the React account login and registration page."""
    return serve_react_app()


# ============================================================
# HEALTH & DB CHECK ROUTES
# ============================================================

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "message": "FastAPI backend is running",
        "framework": "FastAPI 2.0"
    }


@app.get("/api/db-check")
async def db_check():
    """Database connectivity check."""
    try:
        result = run_select_one("""
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                inet_server_port() AS server_port;
        """)
        return {"status": "connected", **result}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "details": str(e)}
        )


# ============================================================
# HOMEPAGE AUTH ROUTES
# ============================================================

@app.post("/api/auth/register")
async def api_auth_register(request: Request):
    """Register a student account or an instructor/admin account."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON payload"})

    role = clean_text(payload.get("role")).lower()
    remember = validate_boolean(payload.get("rememberMe", True))
    if role == "student":
        user = create_student_user(payload)
        public_user = public_student_user(user)
        response = JSONResponse({"ok": True, "user": public_user, "redirectUrl": "/simulator"})
        mark_user_logged_in("student", school_id=user["school_id"])
        set_app_session_cookie(response, "student", user["school_id"], remember)
        return response

    if role in {"instructor", "teacher", "admin"}:
        user = create_instructor_user(payload)
        response = JSONResponse({"ok": True, "user": public_instructor_user(user), "redirectUrl": "/simulator"})
        mark_user_logged_in("instructor", username=user["username"])
        set_app_session_cookie(response, "instructor", user["username"], remember)
        return response

    raise HTTPException(status_code=400, detail={"error": "Role must be student, instructor, or admin"})


@app.post("/api/auth/login")
async def api_auth_login(request: Request):
    """Log in a student by student ID or an instructor/admin by username with account lockout protection."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON request"})

    role = clean_text(payload.get("role") or "").lower()
    password = str(payload.get("password") or "")
    remember = validate_boolean(payload.get("rememberMe", False))
    if not password:
        raise HTTPException(status_code=400, detail={"error": "Password is required"})

    if role == "student":
        school_id = clean_text(payload.get("studentId") or payload.get("student_id") or payload.get("school_id") or "")
        if not school_id:
            raise HTTPException(status_code=400, detail={"error": "Student ID is required"})
        
        # Check account lockout
        if check_account_lockout(school_id):
            audit_logger.warning(f"Locked student account attempt: {school_id} from {get_client_ip(request)}")
            raise HTTPException(
                status_code=429,
                detail={"error": "Account locked due to too many failed attempts. Please try again later."}
            )
        
        user = verify_student_credentials(school_id, password)
        if not user:
            audit_logger.warning(f"Failed student login: {school_id} from {get_client_ip(request)}")
            raise HTTPException(status_code=401, detail={"error": "Invalid student ID or password"})
        
        public_user = public_student_user(user)
        response = JSONResponse({"ok": True, "user": public_user, "redirectUrl": "/simulator"})
        mark_user_logged_in("student", school_id=user["school_id"])
        set_app_session_cookie(response, "student", user["school_id"], remember)
        audit_logger.info(f"Student login successful: {school_id} from {get_client_ip(request)}")
        return response

    if role == "admin":
        username = clean_text(payload.get("email") or payload.get("username") or "")
        if not username:
            raise HTTPException(status_code=400, detail={"error": "Username is required"})
        if check_account_lockout(username):
            audit_logger.warning(f"Locked admin account attempt: {username} from {get_client_ip(request)}")
            raise HTTPException(status_code=429, detail={"error": "Account locked due to too many failed attempts. Please try again later."})
        user = verify_admin_credentials(username, password)
        if not user or user.get("role") != "admin":
            audit_logger.warning(f"Failed admin login: {username} from {get_client_ip(request)}")
            raise HTTPException(status_code=401, detail={"error": "Invalid administrator credentials"})
        response = JSONResponse({"ok": True, "user": public_instructor_user(user), "redirectUrl": "/admin"})
        mark_user_logged_in("admin", username=user["username"])
        set_app_session_cookie(response, "admin", user["username"], remember)
        set_admin_session_cookie(response, user["username"])
        audit_logger.info(f"Admin login successful: {username} from {get_client_ip(request)}")
        return response

    if role in {"instructor", "teacher"}:
        email = normalize_email(payload.get("email") or payload.get("username") or "")
        if not email:
            raise HTTPException(status_code=400, detail={"error": "Email is required"})
        
        # Check account lockout
        if check_account_lockout(email):
            audit_logger.warning(f"Locked instructor account attempt: {email} from {get_client_ip(request)}")
            raise HTTPException(
                status_code=429,
                detail={"error": "Account locked due to too many failed attempts. Please try again later."}
            )
        
        user = verify_admin_credentials(email, password)
        if not user or user.get("role") != "instructor":
            audit_logger.warning(f"Failed instructor login: {email} from {get_client_ip(request)}")
            raise HTTPException(status_code=401, detail={"error": "Invalid instructor credentials"})
        
        response = JSONResponse({"ok": True, "user": public_instructor_user(user), "redirectUrl": "/simulator"})
        mark_user_logged_in("instructor", username=user["username"])
        set_app_session_cookie(response, "instructor", user["username"], remember)
        audit_logger.info(f"Instructor login successful: {email} from {get_client_ip(request)}")
        return response

    raise HTTPException(status_code=400, detail={"error": "Role must be student, instructor, or admin"})


@app.post("/api/auth/forgot-password")
async def api_auth_forgot_password(request: Request):
    """Reset a student or instructor password after matching account details."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON request"})

    role = clean_text(payload.get("role") or "").lower()
    password = validate_password(str(payload.get("password") or ""))
    _, pw_hash = password_hash_bcrypt(password)

    if role == "student":
        school_id = clean_text(payload.get("studentId") or payload.get("student_id") or payload.get("school_id") or "")
        email_value = normalize_email(payload.get("email") or "")
        if not school_id or not email_value:
            raise HTTPException(status_code=400, detail={"error": "Student ID and email are required"})
        ensure_student_users_table()
        row = run_write(
            """
            UPDATE student_users
            SET password_hash = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE lower(school_id) = lower(%s)
              AND lower(email) = lower(%s)
              AND is_active = TRUE
            RETURNING student_id;
            """,
            (pw_hash, school_id, email_value),
        )
        if not row:
            raise HTTPException(status_code=404, detail={"error": "No active student account matched those details"})
        return {"ok": True, "message": "Password updated. You can sign in now."}

    if role in {"instructor", "teacher"}:
        email_value = normalize_email(payload.get("email") or payload.get("username") or "")
        if not email_value:
            raise HTTPException(status_code=400, detail={"error": "Instructor email is required"})
        ensure_admin_users_table()
        row = run_write(
            """
            UPDATE admin_users
            SET password_hash = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE lower(username) = lower(%s)
              AND role = 'instructor'
              AND is_active = TRUE
            RETURNING admin_id;
            """,
            (pw_hash, email_value),
        )
        if not row:
            raise HTTPException(status_code=404, detail={"error": "No active instructor account matched that email"})
        return {"ok": True, "message": "Password updated. You can sign in now."}

    raise HTTPException(status_code=400, detail={"error": "Role must be student or instructor"})


@app.get("/api/auth/me")
async def api_auth_me(request: Request):
    """Return the current signed-in user, if any."""
    user = current_auth_user(request)
    return {"ok": bool(user), "user": user}


@app.post("/api/auth/logout")
async def api_auth_logout(request: Request):
    """Clear application and admin login sessions."""
    revoke_admin_session(request.cookies.get(ADMIN_COOKIE_NAME))
    response = JSONResponse({"ok": True})
    clear_auth_cookies(response)
    return response


@app.get("/api/profile")
async def api_profile(request: Request):
    """Return basic profile data for the logged-in user."""
    user = require_logged_in(request)
    ensure_saved_builds_table()
    builds = run_select("""
        SELECT
            build_id AS id,
            build_name AS name,
            build_data,
            owner_role,
            owner_id,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        FROM saved_builds
        WHERE owner_role = %s AND owner_id = %s
        ORDER BY build_id DESC;
    """, (user.get("role"), user.get("id")))
    builds = dedupe_saved_build_rows(builds)
    favorites = run_select(
        """
        SELECT
            b.build_id AS id,
            b.build_name AS name,
            b.build_data,
            b.created_at::text AS created_at,
            f.created_at::text AS favorited_at
        FROM build_favorites f
        JOIN saved_builds b ON b.build_id = f.build_id
        WHERE f.user_role = %s AND f.user_id = %s
        ORDER BY f.created_at DESC;
        """,
        (user.get("role"), user.get("id")),
    )
    scenarios: list[dict[str, Any]] = []
    if user.get("role") == "instructor":
        ensure_scenarios_table()
        scenarios = [
            scenario_row_to_public(row)
            for row in run_select(
                """
                SELECT s.*, a.display_name AS instructor_name, a.username AS instructor_email
                FROM pc_scenarios s
                JOIN admin_users a ON a.admin_id = s.instructor_id
                WHERE s.instructor_id = %s
                ORDER BY s.created_at DESC;
                """,
                (user.get("id"),),
            )
        ]
    badges = sync_user_badges(user)
    scenario_completion_count = int((run_select_one(
        "SELECT COUNT(*) AS count FROM scenario_completions WHERE user_role = %s AND user_id = %s;",
        (user.get("role"), user.get("id")),
    ) or {}).get("count") or 0)
    return {
        "user": {
            "name": user.get("displayName") or user.get("email") or user.get("studentId") or "User",
            "role": user.get("role"),
            "email": user.get("email"),
            "studentId": user.get("studentId"),
            "profileUrl": public_profile_url(user),
            "avatar": "U",
        },
        "stats": {
            "buildsPublished": len(builds),
            "favoritesSaved": len(favorites),
            "badgesEarned": len(badges),
            "scenariosCompleted": scenario_completion_count,
            "scenariosPublished": len([s for s in scenarios if s.get("isPublished")]),
        },
        "builds": builds,
        "favorites": favorites,
        "badges": badges,
        "scenarios": scenarios,
        "isOwnProfile": True,
    }


@app.get("/api/profiles/{role}/{profile_id}")
async def api_public_profile(role: str, profile_id: int):
    """Return public profile data for visited profiles."""
    user = get_public_profile(role, profile_id)
    if not user:
        raise HTTPException(status_code=404, detail={"error": "Profile not found"})
    ensure_saved_builds_table()
    builds = run_select("""
        SELECT
            build_id AS id,
            build_name AS name,
            build_data,
            owner_role,
            owner_id,
            is_published,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        FROM saved_builds
        WHERE lower(COALESCE(owner_role, '')) = %s
          AND owner_id = %s
          AND COALESCE(is_published, TRUE) = TRUE
        ORDER BY build_id DESC;
    """, (str(user.get("role") or "").lower(), user.get("id")))
    builds = dedupe_saved_build_rows(builds)
    scenarios: list[dict[str, Any]] = []
    if user.get("role") == "instructor":
        ensure_scenarios_table()
        scenarios = [
            scenario_row_to_public(row)
            for row in run_select(
                """
                SELECT s.*, a.display_name AS instructor_name, a.username AS instructor_email
                FROM pc_scenarios s
                JOIN admin_users a ON a.admin_id = s.instructor_id
                WHERE s.instructor_id = %s AND s.is_published = TRUE
                ORDER BY s.created_at DESC;
                """,
                (user.get("id"),),
            )
        ]
    return {
        "user": {
            "name": user.get("displayName") or user.get("email") or user.get("studentId") or "User",
            "role": user.get("role"),
            "email": user.get("email"),
            "studentId": user.get("studentId"),
            "profileUrl": public_profile_url(user),
            "avatar": "U",
        },
        "stats": {
            "buildsPublished": len(builds),
            "favoritesSaved": 0,
            "badgesEarned": 0,
            "scenariosPublished": len(scenarios),
        },
        "builds": builds,
        "scenarios": scenarios,
        "isOwnProfile": False,
    }


@app.get("/api/scenarios")
async def api_get_scenarios(instructor_id: int | None = None):
    """Fetch published scenarios."""
    ensure_scenarios_table()
    params: tuple[Any, ...] = ()
    where = "WHERE s.is_published = TRUE"
    if instructor_id is not None:
        where += " AND s.instructor_id = %s"
        params = (instructor_id,)
    rows = run_select(
        f"""
        SELECT s.*, a.display_name AS instructor_name, a.username AS instructor_email
        FROM pc_scenarios s
        JOIN admin_users a ON a.admin_id = s.instructor_id
        {where}
        ORDER BY s.created_at DESC;
        """,
        params,
    )
    return [scenario_row_to_public(row) for row in rows]


@app.get("/api/scenarios/{scenario_id}")
async def api_get_scenario(scenario_id: int):
    """Fetch one published scenario."""
    ensure_scenarios_table()
    row = run_select_one(
        """
        SELECT s.*, a.display_name AS instructor_name, a.username AS instructor_email
        FROM pc_scenarios s
        JOIN admin_users a ON a.admin_id = s.instructor_id
        WHERE s.scenario_id = %s AND s.is_published = TRUE;
        """,
        (scenario_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail={"error": "Scenario not found"})
    return scenario_row_to_public(row)


@app.post("/api/scenarios")
async def api_create_scenario(request: Request):
    """Create and publish an instructor scenario."""
    user = require_instructor(request)
    payload = await request.json()
    title = clean_text(payload.get("title") or payload.get("name"))
    if not title:
        raise HTTPException(status_code=400, detail={"error": "Scenario title is required"})
    activity_type = clean_text(payload.get("activityType") or payload.get("activity_type") or payload.get("type")) or "build"
    tier = clean_text(payload.get("tier"))
    description = clean_text(payload.get("description") or payload.get("desc"))
    raw_budget = payload.get("budget")
    budget = None
    if raw_budget not in (None, ""):
        try:
            budget = float(raw_budget)
        except Exception:
            raise HTTPException(status_code=400, detail={"error": "Budget must be a number"})
    raw_time = payload.get("timeLimitMinutes") or payload.get("time_limit_minutes")
    time_limit = int(raw_time) if raw_time not in (None, "") else None
    objectives = payload.get("objectives") if isinstance(payload.get("objectives"), list) else []
    troubleshooting = payload.get("troubleshooting") if isinstance(payload.get("troubleshooting"), list) else []
    constraints = payload.get("constraints") if isinstance(payload.get("constraints"), dict) else {}
    is_published = bool(payload.get("isPublished", True))

    ensure_scenarios_table()
    row = run_write(
        """
        INSERT INTO pc_scenarios
            (instructor_id, title, description, activity_type, tier, budget, time_limit_minutes,
             objectives, troubleshooting, constraints, is_published)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING scenario_id;
        """,
        (
            user["id"],
            title,
            description,
            activity_type,
            tier,
            budget,
            time_limit,
            Json(objectives),
            Json(troubleshooting),
            Json(constraints),
            is_published,
        ),
    )
    scenario = run_select_one(
        """
        SELECT s.*, a.display_name AS instructor_name, a.username AS instructor_email
        FROM pc_scenarios s
        JOIN admin_users a ON a.admin_id = s.instructor_id
        WHERE s.scenario_id = %s;
        """,
        (row["scenario_id"],),
    )
    return {"ok": True, "scenario": scenario_row_to_public(scenario)}


@app.post("/api/scenarios/{scenario_id}/complete")
async def api_complete_scenario(scenario_id: int, request: Request):
    user = require_logged_in(request)
    payload = await request.json()
    score = payload.get("score")
    score_value = int(score) if score not in (None, "") else None
    ensure_social_tables()
    run_write(
        """
        INSERT INTO scenario_completions (scenario_id, user_role, user_id, score)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (scenario_id, user_role, user_id)
        DO UPDATE SET score = EXCLUDED.score, completed_at = CURRENT_TIMESTAMP
        RETURNING completion_id;
        """,
        (scenario_id, user["role"], user["id"], score_value),
    )
    badges = sync_user_badges(user)
    return {"ok": True, "badges": badges}


@app.get("/api/search")
async def api_search(q: str = ""):
    """Search published builds, scenarios, and public profiles."""
    query = clean_text(q)
    if len(query) < 2:
        return {"query": query, "results": []}
    like = f"%{query}%"
    terms = search_terms(query)
    results: list[dict[str, Any]] = []

    ensure_saved_builds_table()
    build_token_clause, build_token_params = token_search_clause(["build_name"], terms)
    for row in run_select(
        f"""
        SELECT build_id AS id, build_name AS title, created_at::text AS created_at
        FROM saved_builds
        WHERE is_published = TRUE
          AND (build_name ILIKE %s OR ({build_token_clause}))
        ORDER BY build_id DESC
        LIMIT 8;
        """,
        (like, *build_token_params),
    ):
        results.append({"type": "build", "title": row["title"], "subtitle": "Published PC build", "url": f"/gallery#build-{row['id']}"})

    ensure_scenarios_table()
    scenario_token_clause, scenario_token_params = token_search_clause(
        ["s.title", "COALESCE(s.description, '')", "COALESCE(a.display_name, '')"],
        terms,
    )
    for row in run_select(
        f"""
        SELECT s.scenario_id, s.title, a.display_name AS instructor_name, a.admin_id
        FROM pc_scenarios s
        JOIN admin_users a ON a.admin_id = s.instructor_id
        WHERE s.is_published = TRUE
          AND (s.title ILIKE %s OR COALESCE(s.description, '') ILIKE %s OR COALESCE(a.display_name, '') ILIKE %s OR ({scenario_token_clause}))
        ORDER BY s.created_at DESC
        LIMIT 8;
        """,
        (like, like, like, *scenario_token_params),
    ):
        results.append({"type": "scenario", "title": row["title"], "subtitle": f"Scenario by {row.get('instructor_name') or 'Instructor'}", "url": f"/profiles/instructor/{row['admin_id']}#scenario-{row['scenario_id']}"})

    ensure_admin_users_table()
    instructor_token_clause, instructor_token_params = token_search_clause(
        ["username", "split_part(username, '@', 1)", "COALESCE(display_name, '')"],
        terms,
    )
    for row in run_select(
        f"""
        SELECT admin_id AS id, username, display_name
        FROM admin_users
        WHERE role = 'instructor'
          AND is_active = TRUE
          AND (username ILIKE %s OR COALESCE(display_name, '') ILIKE %s OR ({instructor_token_clause}))
        ORDER BY admin_id DESC
        LIMIT 8;
        """,
        (like, like, *instructor_token_params),
    ):
        results.append({"type": "profile", "title": row.get("display_name") or row.get("username"), "subtitle": "Instructor profile", "url": f"/profiles/instructor/{row['id']}"})

    ensure_student_users_table()
    student_token_clause, student_token_params = token_search_clause(
        [
            "school_id",
            "email",
            "COALESCE(display_name, '')",
            "first_name",
            "last_name",
            "first_name || ' ' || last_name",
            "last_name || ' ' || first_name",
        ],
        terms,
    )
    for row in run_select(
        f"""
        SELECT student_id AS id, school_id, email, display_name
        FROM student_users
        WHERE is_active = TRUE
          AND (
            school_id ILIKE %s
            OR email ILIKE %s
            OR COALESCE(display_name, '') ILIKE %s
            OR first_name ILIKE %s
            OR last_name ILIKE %s
            OR first_name || ' ' || last_name ILIKE %s
            OR last_name || ' ' || first_name ILIKE %s
            OR ({student_token_clause})
          )
        ORDER BY student_id DESC
        LIMIT 8;
        """,
        (like, like, like, like, like, like, like, *student_token_params),
    ):
        results.append({"type": "profile", "title": row.get("display_name") or row.get("school_id"), "subtitle": "Student profile", "url": f"/profiles/student/{row['id']}"})

    return {"query": query, "results": results[:20]}


@app.get("/logout")
async def auth_logout_page():
    """Log out and return to the public homepage."""
    response = RedirectResponse("/", status_code=303)
    clear_auth_cookies(response)
    return response


# ============================================================
# CATEGORY HELPERS
# ============================================================

def normalize_category(category: str | None) -> str | None:
    c = str(category or "").lower().strip()
    aliases = {
        "all": "all",
        "cpu": "cpu", "cpus": "cpu",
        "mb": "mb", "mobo": "mb", "motherboard": "mb", "motherboards": "mb",
        "ram": "ram", "rams": "ram", "memory": "ram", "ram_modules": "ram",
        "gpu": "gpu", "gpus": "gpu",
        "storage": "storage", "ssd": "storage", "hdd": "storage", "storage_drives": "storage",
        "psu": "psu", "psus": "psu",
        "case": "case", "cases": "case", "pc_case": "case", "pc_cases": "case",
        "cooler": "cooler", "coolers": "cooler", "fan": "cooler", "fans": "cooler",
    }
    return aliases.get(c)


def extract_numeric_id(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, dict):
        value = (
            value.get("dbId") or value.get("db_id") or value.get("id") or
            value.get("cpu_id") or value.get("motherboard_id") or value.get("ram_id") or
            value.get("gpu_id") or value.get("psu_id") or value.get("storage_id") or value.get("case_id")
        )
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    match = re.search(r"(\d+)$", text)
    return int(match.group(1)) if match else None


def get_selected_id(data: dict[str, Any], *keys: str) -> int | None:
    sources = [data]
    if isinstance(data.get("components"), dict):
        sources.append(data["components"])
    if isinstance(data.get("selectedComponents"), dict):
        sources.append(data["selectedComponents"])
    for source in sources:
        for key in keys:
            selected_id = extract_numeric_id(source.get(key))
            if selected_id:
                return selected_id
    return None


ADMIN_TABLES = {
    "cpu": "admin_cpu",
    "gpu": "admin_gpu",
    "psu": "admin_psu",
    "ssd": "admin_ssd",
    "hdd": "admin_hdd",
    "fan": "admin_fan",
    "mobo": "admin_mobo",
    "ram": "admin_ram",
}


ADMIN_SCHEMAS: dict[str, dict[str, Any]] = {
    "cpu": {"fields": ["brand", "model", "family", "cores", "baseClock", "turboClock", "cache", "igpu", "tdp", "memSupport", "socket", "released"], "labels": ["Brand", "Model", "CPU Family", "Cores (P/E)", "Base Clock", "Turbo Clock", "Cache", "Integrated GPU", "TDP", "Memory Support", "Socket", "Date Released"], "brandKey": "brand", "modelKey": "model"},
    "gpu": {"fields": ["brand", "model", "memType", "memCapacity", "busWidth", "coreClock", "cudaCores", "tdp", "psu", "formFactor", "release"], "labels": ["Brand", "Model", "Memory Type", "Memory Capacity", "Bus Width", "Core Clock", "CUDA/Shader Cores", "TDP", "PSU Req.", "Form Factor", "Release Year"], "brandKey": "brand", "modelKey": "model"},
    "psu": {"fields": ["brand", "model", "powerOutput", "psuType", "efficiency", "inputVoltage", "frequency", "cooling", "modular", "mainPower", "cpuPower", "pcieConn", "sataConn", "warranty", "released"], "labels": ["Brand", "Model", "Power Output", "PSU Type", "Efficiency", "Input Voltage", "Frequency", "Cooling", "Modular Type", "Main Power", "CPU Power", "PCIe Connectors", "SATA Connectors", "Warranty", "Released"], "brandKey": "brand", "modelKey": "model"},
    "ssd": {"fields": ["brand", "model", "storageType", "interface", "formFactor", "capacity", "nand", "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", "cache", "endurance", "power", "encryption", "released"], "labels": ["Brand", "Model", "Storage Type", "Interface", "Form Factor", "Capacity", "NAND Type", "Read Speed", "Write Speed", "Read IOPS", "Write IOPS", "Cache", "Endurance", "Power", "Encryption", "Released"], "brandKey": "brand", "modelKey": "model"},
    "hdd": {"fields": ["brand", "model", "storageType", "interface", "formFactor", "capacity", "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", "cache", "power", "encryption", "released"], "labels": ["Brand", "Model", "Storage Type", "Interface", "Form Factor", "Capacity", "Read Speed", "Write Speed", "Read IOPS", "Write IOPS", "Cache", "Power", "Encryption", "Released"], "brandKey": "brand", "modelKey": "model"},
    "fan": {"fields": ["brand", "model", "dimensions", "speed", "airflow", "connector", "voltage", "released"], "labels": ["Brand", "Model", "Fan Dimensions", "Fan Speed", "Airflow (CFM)", "Connector Type", "Voltage", "Released"], "brandKey": "brand", "modelKey": "model"},
    "mobo": {"fields": ["brand", "model", "formFactor", "chipset", "socket", "memType", "dimms", "maxMem", "memSpeed", "pciSlots", "m2Slots", "usb", "tier", "released"], "labels": ["Brand", "Model", "Form Factor", "Chipset", "Socket", "Memory Type", "DIMM Slots", "Max Memory", "Memory Speed", "PCIe Slots", "M.2 Slots", "USB Ports", "Tier", "Released"], "brandKey": "brand", "modelKey": "model"},
    "ram": {"fields": ["brand", "model", "memType", "capacity", "config", "formFactor", "speed", "cas", "voltage", "pins", "ecc", "buffered", "xmp", "released"], "labels": ["Brand", "Model", "Memory Type", "Capacity", "Config", "Form Factor", "Speed", "CAS Latency", "Voltage", "Pins", "ECC Support", "Buffered", "XMP Support", "Released"], "brandKey": "brand", "modelKey": "model"},
}


def normalize_admin_category(category: str | None) -> str | None:
    c = str(category or "").lower().strip()
    aliases = {
        "cpu": "cpu", "processor": "cpu", "processors": "cpu",
        "gpu": "gpu", "graphics": "gpu", "graphics_card": "gpu",
        "psu": "psu", "power": "psu", "power_supply": "psu",
        "ssd": "ssd",
        "hdd": "hdd", "hard_drive": "hdd",
        "fan": "fan", "fans": "fan", "cooler": "fan", "coolers": "fan", "cooling": "fan",
        "mobo": "mobo", "mb": "mobo", "motherboard": "mobo", "motherboards": "mobo",
        "ram": "ram", "memory": "ram",
    }
    return aliases.get(c)


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def admin_fields(category: str) -> list[str]:
    return list(ADMIN_SCHEMAS[category]["fields"])


def admin_table_has_column(category: str, column: str) -> bool:
    table = ADMIN_TABLES.get(category)
    if not table:
        return False
    row = run_select_one(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = %s
              AND column_name = %s
        ) AS exists;
        """,
        (table, column),
    )
    return bool(row and row.get("exists"))


def fetch_admin_components(category: str) -> list[dict[str, Any]]:
    category = normalize_admin_category(category) or category
    if category not in ADMIN_TABLES:
        return []
    fields = ["id", *admin_fields(category)]
    select_list = ", ".join(quote_ident(field) for field in fields)
    return run_select(f"SELECT {select_list} FROM {ADMIN_TABLES[category]} ORDER BY id;")


def fetch_all_admin_components_grouped() -> dict[str, list[dict[str, Any]]]:
    return {category: fetch_admin_components(category) for category in ADMIN_TABLES}


def validate_admin_payload(category: str, payload: dict[str, Any]) -> dict[str, Any]:
    if category not in ADMIN_TABLES:
        raise HTTPException(status_code=400, detail={"error": "Invalid admin category"})
    cleaned = {field: str(payload.get(field) or "").strip() for field in admin_fields(category)}
    if not cleaned.get("brand") or not cleaned.get("model"):
        raise HTTPException(status_code=400, detail={"error": "Brand and Model are required"})
    return cleaned


def insert_admin_component(category: str, payload: dict[str, Any]) -> dict[str, Any]:
    category = normalize_admin_category(category) or category
    data = validate_admin_payload(category, payload)
    fields = [*admin_fields(category)]
    columns = ", ".join(quote_ident(field) for field in fields)
    placeholders = ", ".join(["%s"] * len(fields))
    return_fields = ["id", *admin_fields(category)]
    returning = ", ".join(quote_ident(field) for field in return_fields)
    values = tuple(data.get(field, "") for field in fields)
    return run_write(f"INSERT INTO {ADMIN_TABLES[category]} ({columns}) VALUES ({placeholders}) RETURNING {returning};", values) or {}


def update_admin_component(category: str, component_id: Any, payload: dict[str, Any]) -> dict[str, Any]:
    category = normalize_admin_category(category) or category
    component_id = extract_numeric_id(component_id)
    if not component_id:
        raise HTTPException(status_code=400, detail={"error": "Invalid component id"})
    data = validate_admin_payload(category, payload)
    fields = [*admin_fields(category)]
    assignments = ", ".join(f"{quote_ident(field)} = %s" for field in fields)
    return_fields = ["id", *admin_fields(category)]
    returning = ", ".join(quote_ident(field) for field in return_fields)
    values = tuple(data.get(field, "") for field in fields) + (component_id,)
    row = run_write(f"UPDATE {ADMIN_TABLES[category]} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING {returning};", values)
    if not row:
        raise HTTPException(status_code=404, detail={"error": "Component not found"})
    return row


def delete_admin_component(category: str, component_id: Any) -> dict[str, Any]:
    category = normalize_admin_category(category) or category
    if category not in ADMIN_TABLES:
        raise HTTPException(status_code=400, detail={"error": "Invalid admin category"})
    component_id = extract_numeric_id(component_id)
    if not component_id:
        raise HTTPException(status_code=400, detail={"error": "Invalid component id"})
    row = run_write(f"DELETE FROM {ADMIN_TABLES[category]} WHERE id = %s RETURNING id;", (component_id,))
    if not row:
        raise HTTPException(status_code=404, detail={"error": "Component not found"})
    return {"success": True, "id": row["id"]}


def first_number(value: Any, default: int = 0) -> int:
    match = re.search(r"(\d+(?:\.\d+)?)", str(value or ""))
    return int(float(match.group(1))) if match else default


def capacity_to_gb(value: Any) -> int:
    text = str(value or "").lower()
    number = first_number(text, 0)
    return number * 1000 if "tb" in text else number


def parse_boolish(value: Any) -> bool:
    return str(value or "").lower().strip() in {"1", "true", "yes", "y", "supported", "full", "semi", "modular", "fully modular", "semi-modular"}


def parse_ram_sticks(config: Any) -> int:
    match = re.search(r"(\d+)\s*x", str(config or "").lower())
    return int(match.group(1)) if match else 1


def max_number(value: Any, default: int = 0) -> int:
    numbers = [int(float(match)) for match in re.findall(r"(\d+(?:\.\d+)?)", str(value or ""))]
    return max(numbers) if numbers else default


def field_value(component: dict[str, Any] | None, *keys: str, default: Any = "") -> Any:
    if not component:
        return default
    for key in keys:
        value = component.get(key)
        if value not in (None, ""):
            return value
    return default


def memory_types_from(*values: Any) -> set[str]:
    types: set[str] = set()
    fallback_types: set[str] = set()
    for value in values:
        text = str(value or "").upper()
        types.update(f"DDR{match}" for match in re.findall(r"\bDDR\s*([2-6])\w*", text))
        cleaned = re.sub(r"[^A-Z0-9]+", "", text)
        if cleaned:
            fallback_types.add(cleaned)
    return types or fallback_types


def component_memory_types(component: dict[str, Any] | None) -> set[str]:
    if not component:
        return set()
    return memory_types_from(
        component.get("ram_type"),
        component.get("memType"),
        component.get("memoryType"),
        component.get("type"),
        component.get("Memory Type"),
    )


def memory_type_label(component: dict[str, Any] | None) -> str:
    return str(field_value(component, "ram_type", "memType", "memoryType", "type", "Memory Type", default="unknown"))


def normalize_form_factor(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "", str(value or "").lower())
    if not text:
        return ""
    if "sodimm" in text:
        return "so-dimm"
    if "udimm" in text or "dimm" in text:
        return "dimm"
    if "microatx" in text or text in {"matx", "uatx"}:
        return "micro-atx"
    if "miniitx" in text or text == "itx":
        return "mini-itx"
    if text == "atx":
        return "atx"
    if "eatx" in text:
        return "e-atx"
    if "m2" in text or "2280" in text:
        return "m.2"
    if "25inch" in text:
        return "2.5 inch"
    if "35inch" in text:
        return "3.5 inch"
    return text


def ram_slot_form_factor(component: dict[str, Any] | None) -> str:
    explicit = normalize_form_factor(field_value(component, "ram_form_factor", "ramSlotFormFactor", "memoryFormFactor", "slotFormFactor"))
    if explicit:
        return explicit
    dimm_text = str(field_value(component, "dimms", "dimmSlots", "memorySlots", default="")).lower()
    if "so-dimm" in dimm_text or "sodimm" in dimm_text:
        return "so-dimm"
    if "udimm" in dimm_text or "dimm" in dimm_text:
        return "dimm"
    board_form = normalize_form_factor(field_value(component, "form_factor", "formFactor"))
    if dimm_text and board_form in {"atx", "micro-atx", "e-atx"}:
        return "dimm"
    return ""


def component_ram_form_factor(component: dict[str, Any] | None) -> str:
    return normalize_form_factor(field_value(component, "ram_form_factor", "form_factor", "formFactor", "memoryFormFactor"))


def pcie_power_capacity_watts(value: Any) -> int:
    text = str(value or "").lower()
    if not text or "none" in text or "n/a" in text:
        return 0
    capacity = 0
    for count, pin_text in re.findall(r"(\d+)\s*x?\s*([0-9+]+)\s*-?\s*pin", text):
        pins = pin_text.replace("+", "")
        if "62" in pins or "8" in pins:
            capacity += int(count) * 150
        elif "6" in pins:
            capacity += int(count) * 75
    if capacity:
        return capacity
    if "6+2" in text or "8-pin" in text or "8 pin" in text:
        return 150
    if "6-pin" in text or "6 pin" in text:
        return 75
    return 0


def pcie_x16_slot_count(value: Any) -> int:
    text = str(value or "").lower()
    if "none" in text or "x16" not in text:
        return 0
    total = 0
    for count in re.findall(r"(\d+)\s*x\s*pcie[^,;]*x16", text):
        total += int(count)
    if total:
        return total
    return text.count("x16") or 1


def storage_interface_kind(storage: dict[str, Any] | None) -> str:
    text = str(field_value(storage, "interface", "storageInterface", "storage_type", "storageType")).lower()
    if "nvme" in text:
        return "nvme"
    if "m.2" in text or "m2" in text:
        return "m.2"
    if "sata" in text:
        return "sata"
    if "ide" in text or "pata" in text:
        return "ide"
    return text.strip()


def admin_cpu_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    cores = first_number(row.get("cores"))
    threads_match = re.search(r"/\s*(\d+)", str(row.get("cores") or ""))
    threads = int(threads_match.group(1)) if threads_match else cores
    return {**row, "dbId": row["id"], "cat": "cpu", "category": "cpu", "name": row.get("model") or "CPU", "cpu_name": row.get("model") or "CPU", "sub": f"{row.get('cores') or 'N/A'} · {row.get('socket') or 'N/A'}", "cores": cores, "threads": threads, "base_clock": first_number(row.get("baseClock")), "boost_clock": first_number(row.get("turboClock")), "tdp_watts": first_number(row.get("tdp")), "integrated_graphics": bool(row.get("igpu") and str(row.get("igpu")).lower() not in {"none", "no", "false"})}


def admin_mobo_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "dbId": row["id"], "cat": "mb", "category": "mb", "name": row.get("model") or "Motherboard", "motherboard_name": row.get("model") or "Motherboard", "sub": f"{row.get('chipset') or 'N/A'} · {row.get('socket') or 'N/A'} · {row.get('memType') or 'N/A'}", "ram_type": row.get("memType") or "", "dimm_slots": first_number(row.get("dimms")), "ram_slot_form_factor": ram_slot_form_factor(row), "max_ram_gb": capacity_to_gb(row.get("maxMem")), "max_ram_speed_mhz": max_number(row.get("memSpeed")), "form_factor": row.get("formFactor") or "", "pcie_x16_slots": pcie_x16_slot_count(row.get("pciSlots")), "m2_slots": first_number(row.get("m2Slots"))}


def admin_ram_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "dbId": row["id"], "cat": "ram", "category": "ram", "name": row.get("model") or "RAM", "ram_name": row.get("model") or "RAM", "sub": f"{row.get('capacity') or 'N/A'} · {row.get('memType') or 'N/A'} · {row.get('speed') or 'N/A'}", "ram_type": row.get("memType") or "", "capacity_gb": capacity_to_gb(row.get("capacity")), "speed_mhz": first_number(row.get("speed")), "sticks": parse_ram_sticks(row.get("config")), "ram_form_factor": component_ram_form_factor(row)}


def admin_gpu_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "dbId": row["id"], "cat": "gpu", "category": "gpu", "name": row.get("model") or "GPU", "gpu_name": row.get("model") or "GPU", "sub": f"{row.get('memCapacity') or 'N/A'} VRAM · {row.get('busWidth') or 'N/A'}", "vram_gb": capacity_to_gb(row.get("memCapacity")), "interface": "PCIe x16", "recommended_psu_watts": first_number(row.get("psu")), "length_mm": 0, "tdp_watts": first_number(row.get("tdp"))}


def admin_storage_to_sim(row: dict[str, Any], storage_kind: str) -> dict[str, Any]:
    sim_id = int(row["id"]) + (100000 if storage_kind == "hdd" else 0)
    return {**row, "id": sim_id, "dbId": sim_id, "sourceDbId": row["id"], "cat": "storage", "category": "storage", "sourceCategory": storage_kind, "name": row.get("model") or storage_kind.upper(), "storage_name": row.get("model") or storage_kind.upper(), "sub": f"{row.get('capacity') or 'N/A'} · {row.get('interface') or 'N/A'}", "storage_type": row.get("storageType") or storage_kind.upper(), "capacity_gb": capacity_to_gb(row.get("capacity")), "interface": row.get("interface") or ""}


def admin_psu_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "dbId": row["id"], "cat": "psu", "category": "psu", "name": row.get("model") or "PSU", "psu_name": row.get("model") or "PSU", "sub": f"{row.get('powerOutput') or 'N/A'} · {row.get('efficiency') or 'N/A'}", "wattage": first_number(row.get("powerOutput")), "efficiency_rating": row.get("efficiency") or "", "modular": parse_boolish(row.get("modular")), "pcie_power_capacity_watts": pcie_power_capacity_watts(row.get("pcieConn"))}


def admin_fan_to_sim(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "dbId": row["id"], "cat": "cooler", "category": "cooler", "name": row.get("model") or "Cooling Fan", "sub": f"{row.get('dimensions') or 'N/A'} · {row.get('airflow') or 'N/A'} CFM"}


# ============================================================
# COMPONENT QUERIES — matches your exact schema
# ============================================================

def get_cpus():
    return [admin_cpu_to_sim(row) for row in fetch_admin_components("cpu")]
    return run_select("""
        SELECT
            c.cpu_id AS id,
            c.cpu_id,
            c.cpu_id AS "dbId",
            'cpu' AS cat,
            'cpu' AS category,
            b.brand_name AS brand,
            b.brand_name,
            c.cpu_name AS name,
            c.cpu_name,
            c.socket,
            c.cores,
            c.threads,
            c.base_clock::float AS base_clock,
            c.boost_clock::float AS boost_clock,
            c.tdp_watts,
            c.integrated_graphics,
            CONCAT(c.cores, 'C/', c.threads, 'T · ', c.socket) AS sub
        FROM cpus c
        LEFT JOIN brands b ON b.brand_id = c.brand_id
        ORDER BY c.cpu_id;
    """)


def get_motherboards():
    return [admin_mobo_to_sim(row) for row in fetch_admin_components("mobo")]
    return run_select("""
        SELECT
            m.motherboard_id AS id,
            m.motherboard_id,
            m.motherboard_id AS "dbId",
            'mb' AS cat,
            'mb' AS category,
            b.brand_name AS brand,
            b.brand_name,
            m.motherboard_name AS name,
            m.motherboard_name,
            m.socket,
            m.chipset,
            m.ram_type,
            m.max_ram_gb,
            m.form_factor,
            m.pcie_x16_slots,
            m.m2_slots,
            CONCAT(COALESCE(m.chipset, 'N/A'), ' · ', m.socket, ' · ', m.ram_type) AS sub
        FROM motherboards m
        LEFT JOIN brands b ON b.brand_id = m.brand_id
        ORDER BY m.motherboard_id;
    """)


def get_rams():
    return [admin_ram_to_sim(row) for row in fetch_admin_components("ram")]
    return run_select("""
        SELECT
            r.ram_id AS id,
            r.ram_id,
            r.ram_id AS "dbId",
            'ram' AS cat,
            'ram' AS category,
            b.brand_name AS brand,
            b.brand_name,
            r.ram_name AS name,
            r.ram_name,
            r.ram_type,
            r.capacity_gb,
            r.speed_mhz,
            r.sticks,
            CONCAT(r.capacity_gb, 'GB · ', r.ram_type, ' · ', r.speed_mhz, 'MHz') AS sub
        FROM ram_modules r
        LEFT JOIN brands b ON b.brand_id = r.brand_id
        ORDER BY r.ram_id;
    """)


def get_gpus():
    return [admin_gpu_to_sim(row) for row in fetch_admin_components("gpu")]
    return run_select("""
        SELECT
            g.gpu_id AS id,
            g.gpu_id,
            g.gpu_id AS "dbId",
            'gpu' AS cat,
            'gpu' AS category,
            b.brand_name AS brand,
            b.brand_name,
            g.gpu_name AS name,
            g.gpu_name,
            g.vram_gb,
            g.interface,
            g.recommended_psu_watts,
            g.length_mm,
            CONCAT(g.vram_gb, 'GB VRAM · ', COALESCE(g.interface, 'N/A')) AS sub
        FROM gpus g
        LEFT JOIN brands b ON b.brand_id = g.brand_id
        ORDER BY g.gpu_id;
    """)


def get_psus():
    return [admin_psu_to_sim(row) for row in fetch_admin_components("psu")]
    return run_select("""
        SELECT
            p.psu_id AS id,
            p.psu_id,
            p.psu_id AS "dbId",
            'psu' AS cat,
            'psu' AS category,
            b.brand_name AS brand,
            b.brand_name,
            p.psu_name AS name,
            p.psu_name,
            p.wattage,
            p.efficiency_rating,
            p.modular,
            CONCAT(p.wattage, 'W · ', COALESCE(p.efficiency_rating, 'N/A')) AS sub
        FROM psus p
        LEFT JOIN brands b ON b.brand_id = p.brand_id
        ORDER BY p.psu_id;
    """)


def get_storage_drives():
    return [
        *[admin_storage_to_sim(row, "ssd") for row in fetch_admin_components("ssd")],
        *[admin_storage_to_sim(row, "hdd") for row in fetch_admin_components("hdd")],
    ]
    return run_select("""
        SELECT
            s.storage_id AS id,
            s.storage_id,
            s.storage_id AS "dbId",
            'storage' AS cat,
            'storage' AS category,
            b.brand_name AS brand,
            b.brand_name,
            s.storage_name AS name,
            s.storage_name,
            s.storage_type,
            s.capacity_gb,
            s.interface,
            CONCAT(s.capacity_gb, 'GB · ', COALESCE(s.interface, 'N/A')) AS sub
        FROM storage_drives s
        LEFT JOIN brands b ON b.brand_id = s.brand_id
        ORDER BY s.storage_id;
    """)


def get_cases():
    return []
    return run_select("""
        SELECT
            pc.case_id AS id,
            pc.case_id,
            pc.case_id AS "dbId",
            'case' AS cat,
            'case' AS category,
            b.brand_name AS brand,
            b.brand_name,
            pc.case_name AS name,
            pc.case_name,
            pc.form_factor_support,
            pc.max_gpu_length_mm,
            CONCAT('Supports: ', COALESCE(pc.form_factor_support, 'N/A')) AS sub
        FROM pc_cases pc
        LEFT JOIN brands b ON b.brand_id = pc.brand_id
        ORDER BY pc.case_id;
    """)


def get_coolers():
    return [admin_fan_to_sim(row) for row in fetch_admin_components("fan")]


def fetch_all_components_grouped():
    return {
        "cpu": get_cpus(),
        "mb": get_motherboards(),
        "ram": get_rams(),
        "gpu": get_gpus(),
        "storage": get_storage_drives(),
        "psu": get_psus(),
        "case": get_cases(),
        "cooler": get_coolers(),
    }


def fetch_all_components_by_category(category: str):
    category = normalize_category(category)
    if category == "cpu": return get_cpus()
    if category == "mb": return get_motherboards()
    if category == "ram": return get_rams()
    if category == "gpu": return get_gpus()
    if category == "storage": return get_storage_drives()
    if category == "psu": return get_psus()
    if category == "case": return get_cases()
    if category == "cooler": return get_coolers()
    return []


def fetch_component(category: str, component_id: Any):
    category = normalize_category(category)
    component_id = extract_numeric_id(component_id)
    if not category or not component_id:
        return None
    for component in fetch_all_components_by_category(category):
        if int(component["id"]) == int(component_id):
            return component
    return None


# ============================================================
# COMPONENT API ROUTES
# ============================================================

@app.get("/api/components")
async def api_get_components():
    """Fetch all components grouped by category."""
    try:
        return fetch_all_components_grouped()
    except Exception as e:
        print("ERROR LOADING COMPONENTS FROM POSTGRESQL:", repr(e))
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to load components from PostgreSQL",
                "details": str(e),
            }
        )


@app.get("/api/components/{category}")
async def api_get_components_by_category(category: str):
    """Fetch components by category."""
    normalized = normalize_category(category)
    if normalized == "all":
        return fetch_all_components_grouped()
    if not normalized:
        raise HTTPException(status_code=400, detail={"error": "Invalid category"})
    return fetch_all_components_by_category(normalized)


@app.get("/api/components/{category}/{component_id}")
async def api_get_component(category: str, component_id: str):
    """Fetch a specific component."""
    component = fetch_component(category, component_id)
    if not component:
        raise HTTPException(status_code=404, detail={"error": "Component not found"})
    return component


# ============================================================
# COMPATIBILITY AND STATS
# ============================================================

def compatibility_issues(selected: dict[str, Any]) -> list[str]:
    cpu = selected.get("cpu")
    mb = selected.get("mb")
    ram = selected.get("ram")
    gpu = selected.get("gpu")
    storage = selected.get("storage")
    psu = selected.get("psu")
    pc_case = selected.get("case")

    issues: list[str] = []

    if cpu and mb:
        cpu_socket = str(field_value(cpu, "socket")).strip()
        mb_socket = str(field_value(mb, "socket")).strip()
        if cpu_socket and mb_socket and cpu_socket.lower() != mb_socket.lower():
            issues.append(f"CPU socket {cpu_socket} is not compatible with motherboard socket {mb_socket}.")

    if cpu and ram:
        cpu_ram_types = memory_types_from(field_value(cpu, "memSupport", "memorySupport", "ramSupport"))
        ram_types = component_memory_types(ram)
        if cpu_ram_types and ram_types and cpu_ram_types.isdisjoint(ram_types):
            issues.append(f"RAM type {memory_type_label(ram)} is not supported by CPU memory support {field_value(cpu, 'memSupport', 'memorySupport', 'ramSupport')}.")

    if mb and ram:
        board_ram_types = component_memory_types(mb)
        ram_types = component_memory_types(ram)
        if board_ram_types and ram_types and board_ram_types.isdisjoint(ram_types):
            issues.append(f"RAM type {memory_type_label(ram)} is not compatible with motherboard RAM type {memory_type_label(mb)}.")

        ram_capacity = int(field_value(ram, "capacity_gb", default=0) or 0)
        board_capacity = int(field_value(mb, "max_ram_gb", default=0) or 0)
        if ram_capacity and board_capacity and ram_capacity > board_capacity:
            issues.append(f"RAM capacity {ram_capacity}GB exceeds motherboard maximum of {board_capacity}GB.")

        ram_sticks = int(field_value(ram, "sticks", default=0) or 0)
        dimm_slots = int(field_value(mb, "dimm_slots", "dimms", default=0) or 0)
        if ram_sticks and dimm_slots and ram_sticks > dimm_slots:
            issues.append(f"RAM kit uses {ram_sticks} stick(s), but motherboard has only {dimm_slots} memory slot(s).")

        ram_speed = int(field_value(ram, "speed_mhz", default=0) or 0)
        board_speed = int(field_value(mb, "max_ram_speed_mhz", default=0) or 0)
        if ram_speed and board_speed and ram_speed > board_speed:
            issues.append(f"RAM speed {ram_speed}MHz exceeds motherboard supported memory speed {board_speed}MHz.")

        ram_form = component_ram_form_factor(ram)
        slot_form = ram_slot_form_factor(mb)
        if ram_form and slot_form and ram_form != slot_form:
            issues.append(f"RAM form factor {ram_form} is not compatible with motherboard memory slot form factor {slot_form}.")

    if mb and gpu:
        if int(field_value(mb, "pcie_x16_slots", default=0) or 0) < 1:
            issues.append("Motherboard does not have a PCIe x16 slot for the GPU.")

    if gpu and psu:
        psu_watts = int(field_value(psu, "wattage", default=0) or 0)
        gpu_recommended = int(field_value(gpu, "recommended_psu_watts", default=0) or 0)
        if psu_watts and gpu_recommended and psu_watts < gpu_recommended:
            issues.append(f"PSU wattage {psu_watts}W is lower than GPU recommended {gpu_recommended}W.")

        gpu_tdp = int(field_value(gpu, "tdp_watts", "tdp", default=0) or 0)
        external_gpu_power = max(gpu_tdp - 75, 0)
        pcie_capacity = int(field_value(psu, "pcie_power_capacity_watts", default=0) or 0)
        if external_gpu_power and pcie_capacity and pcie_capacity < external_gpu_power:
            issues.append(f"PSU PCIe power connectors provide about {pcie_capacity}W, but GPU may need about {external_gpu_power}W from PCIe power cables.")
        elif external_gpu_power and not pcie_capacity:
            issues.append("GPU requires PCIe power connectors, but the PSU does not list any PCIe connectors.")

    if gpu and pc_case:
        gpu_length = int(field_value(gpu, "length_mm", default=0) or 0)
        case_gpu_length = int(field_value(pc_case, "max_gpu_length_mm", default=0) or 0)
        if gpu_length and case_gpu_length and gpu_length > case_gpu_length:
            issues.append(f"GPU length {gpu_length}mm exceeds case maximum of {case_gpu_length}mm.")

    if mb and storage:
        storage_kind = storage_interface_kind(storage)
        if storage_kind in {"nvme", "m.2"} and int(field_value(mb, "m2_slots", default=0) or 0) < 1:
            issues.append("M.2/NVMe storage requires at least one M.2 slot on the motherboard.")
        if storage_kind == "ide":
            issues.append("IDE/PATA storage is not supported by this motherboard catalog.")

    if mb and pc_case:
        motherboard_form = normalize_form_factor(field_value(mb, "form_factor", "formFactor"))
        case_support = str(field_value(pc_case, "form_factor_support", "formFactorSupport")).lower()
        if motherboard_form and case_support and motherboard_form not in normalize_form_factor(case_support) and motherboard_form not in case_support:
            issues.append(f"Motherboard form factor {field_value(mb, 'form_factor', 'formFactor')} is not supported by the selected case.")

    return issues


def build_report(data: dict[str, Any]) -> dict[str, Any]:
    cpu_id = get_selected_id(data, "cpu", "cpu_id", "cpuId")
    mb_id = get_selected_id(data, "mb", "motherboard", "motherboard_id", "motherboardId", "mb_id")
    ram_id = get_selected_id(data, "ram", "ram_id", "ramId")
    gpu_id = get_selected_id(data, "gpu", "gpu_id", "gpuId")
    storage_id = get_selected_id(data, "storage", "storage_id", "storageId")
    psu_id = get_selected_id(data, "psu", "psu_id", "psuId")
    case_id = get_selected_id(data, "case", "case_id", "caseId")

    selected = {
        "cpu": fetch_component("cpu", cpu_id) if cpu_id else None,
        "mb": fetch_component("mb", mb_id) if mb_id else None,
        "ram": fetch_component("ram", ram_id) if ram_id else None,
        "gpu": fetch_component("gpu", gpu_id) if gpu_id else None,
        "storage": fetch_component("storage", storage_id) if storage_id else None,
        "psu": fetch_component("psu", psu_id) if psu_id else None,
        "case": fetch_component("case", case_id) if case_id else None,
        "cooler": None,
    }

    cpu = selected["cpu"]
    mb = selected["mb"]
    ram = selected["ram"]
    gpu = selected["gpu"]
    storage = selected["storage"]
    psu = selected["psu"]
    pc_case = selected["case"]

    issues = compatibility_issues(selected)

    unique_parts = [cpu, mb, ram, gpu, storage, psu, pc_case]
    component_count = sum(1 for part in unique_parts if part)

    total_power = 0
    total_memory = 0
    gpu_memory = 0

    if cpu:
        total_power += int(cpu.get("tdp_watts") or 0)
    if mb:
        total_power += 50
    if ram:
        total_power += 5
        total_memory = int(ram.get("capacity_gb") or 0)
    if storage:
        total_power += 5
    if gpu:
        total_power += max(int(gpu.get("recommended_psu_watts") or 0) - 250, 75)
        gpu_memory = int(gpu.get("vram_gb") or 0)

    recommended_psu = total_power + 150
    if gpu:
        recommended_psu = max(recommended_psu, int(gpu.get("recommended_psu_watts") or 0))

    return {
        "compatible": len(issues) == 0,
        "issues": issues,
        "selectedParts": selected,
        "totalPower": total_power,
        "recommendedPsu": recommended_psu,
        "totalMemory": total_memory,
        "gpuMemory": gpu_memory,
        "componentCount": component_count,
    }


@app.post("/api/compatibility")
async def api_compatibility(request: Request):
    """Check build compatibility."""
    data = await request.json()
    report = build_report(data)
    return {
        "compatible": report["compatible"],
        "issues": report["issues"],
        "totalPower": report["totalPower"],
        "recommendedPsu": report["recommendedPsu"],
    }


@app.post("/api/stats")
async def api_stats(request: Request):
    """Get build statistics."""
    data = await request.json()
    return build_report(data)


# ============================================================
# SAVED BUILDS — PostgreSQL only
# ============================================================

def ensure_saved_builds_table():
    run_write("""
        CREATE TABLE IF NOT EXISTS saved_builds (
            build_id SERIAL PRIMARY KEY,
            build_name VARCHAR(150) NOT NULL,
            build_data JSONB NOT NULL,
            owner_role VARCHAR(20),
            owner_id INTEGER,
            is_published BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    run_write("ALTER TABLE saved_builds ADD COLUMN IF NOT EXISTS owner_role VARCHAR(20);")
    run_write("ALTER TABLE saved_builds ADD COLUMN IF NOT EXISTS owner_id INTEGER;")
    run_write("ALTER TABLE saved_builds ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE;")


def saved_build_duplicate_key(row: dict[str, Any]) -> tuple[Any, ...]:
    build_data = row.get("build_data") or {}
    return (
        row.get("owner_role"),
        row.get("owner_id"),
        json.dumps(build_data.get("components") or {}, sort_keys=True, default=str),
        json.dumps(build_data.get("connectedCables") or {}, sort_keys=True, default=str),
    )


def dedupe_saved_build_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    unique_rows: list[dict[str, Any]] = []
    for row in rows:
        key = saved_build_duplicate_key(row)
        if key in seen:
            continue
        seen.add(key)
        unique_rows.append(row)
    return unique_rows


@app.get("/api/builds")
async def api_get_builds(request: Request):
    """Fetch public saved builds or only the current user's saved builds."""
    ensure_saved_builds_table()
    ensure_student_users_table()
    ensure_admin_users_table()
    ensure_social_tables()
    user = current_auth_user(request)
    scope = clean_text(request.query_params.get("scope") or "").lower()
    where_clause = "WHERE COALESCE(b.is_published, TRUE) = TRUE"
    params: tuple[Any, ...] = ()
    if scope in {"mine", "my", "owned"}:
        user = require_logged_in(request)
        where_clause = "WHERE b.owner_role = %s AND b.owner_id = %s"
        params = (user["role"], user["id"])
    rows = run_select(f"""
        SELECT
            b.build_id AS id,
            b.build_id,
            b.build_name AS name,
            b.build_name,
            b.build_data,
            b.owner_role,
            b.owner_id,
            COALESCE(s.display_name, a.display_name, a.username, 'Unknown creator') AS creator_name,
            CASE
                WHEN b.owner_role = 'student' THEN s.email
                WHEN b.owner_role IN ('instructor', 'admin') THEN a.username
                ELSE NULL
            END AS creator_email,
            b.is_published,
            b.created_at::text AS created_at,
            b.updated_at::text AS updated_at
        FROM saved_builds b
        LEFT JOIN student_users s
            ON b.owner_role = 'student' AND b.owner_id = s.student_id
        LEFT JOIN admin_users a
            ON b.owner_role IN ('instructor', 'admin') AND b.owner_id = a.admin_id
        {where_clause}
        ORDER BY b.build_id DESC;
    """, params)
    rows = dedupe_saved_build_rows(rows)
    for row in rows:
        build_id = row["id"]
        row["heartCount"] = int((run_select_one("SELECT COUNT(*) AS count FROM build_hearts WHERE build_id = %s;", (build_id,)) or {}).get("count") or 0)
        row["favoriteCount"] = int((run_select_one("SELECT COUNT(*) AS count FROM build_favorites WHERE build_id = %s;", (build_id,)) or {}).get("count") or 0)
        row["hearted"] = False
        row["favorited"] = False
        if user:
            params = (build_id, user["role"], user["id"])
            row["hearted"] = bool(run_select_one("SELECT 1 FROM build_hearts WHERE build_id = %s AND user_role = %s AND user_id = %s;", params))
            row["favorited"] = bool(run_select_one("SELECT 1 FROM build_favorites WHERE build_id = %s AND user_role = %s AND user_id = %s;", params))
    return rows


@app.post("/api/builds")
async def api_save_build(request: Request):
    """Save a new build."""
    ensure_saved_builds_table()
    data = await request.json()
    user = require_logged_in(request)
    build_name = data.get("buildName") or data.get("build_name") or data.get("name") or "Untitled Build"
    data_to_save = dict(data)
    data_to_save["stats"] = build_report(data)
    components_json = data_to_save.get("components") or {}
    cables_json = data_to_save.get("connectedCables") or {}

    existing = run_select_one("""
        SELECT build_id
        FROM saved_builds
        WHERE owner_role = %s
          AND owner_id = %s
          AND build_data->'components' = %s::jsonb
          AND COALESCE(build_data->'connectedCables', '{}'::jsonb) = %s::jsonb
        ORDER BY build_id DESC
        LIMIT 1;
    """, (user.get("role"), user.get("id"), Json(components_json), Json(cables_json)))

    if existing:
        run_write("""
            UPDATE saved_builds
            SET build_name = %s,
                build_data = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE build_id = %s
            RETURNING build_id;
        """, (build_name, Json(data_to_save), existing["build_id"]))
        sync_user_badges(user)
        return {"success": True, "id": existing["build_id"], "deduped": True}

    result = run_write("""
        INSERT INTO saved_builds (build_name, build_data, owner_role, owner_id, is_published)
        VALUES (%s, %s, %s, %s, TRUE)
        RETURNING build_id;
    """, (build_name, Json(data_to_save), user.get("role"), user.get("id")))
    sync_user_badges(user)

    return {"success": True, "id": result["build_id"] if result else None}


@app.get("/api/builds/{build_id}")
async def api_get_build(build_id: int):
    """Fetch a specific saved build."""
    ensure_saved_builds_table()
    ensure_student_users_table()
    ensure_admin_users_table()
    build = run_select_one("""
        SELECT
            b.build_id AS id,
            b.build_id,
            b.build_name AS name,
            b.build_name,
            b.build_data,
            b.owner_role,
            b.owner_id,
            COALESCE(s.display_name, a.display_name, a.username, 'Unknown creator') AS creator_name,
            CASE
                WHEN b.owner_role = 'student' THEN s.email
                WHEN b.owner_role IN ('instructor', 'admin') THEN a.username
                ELSE NULL
            END AS creator_email,
            b.is_published,
            b.created_at::text AS created_at,
            b.updated_at::text AS updated_at
        FROM saved_builds b
        LEFT JOIN student_users s
            ON b.owner_role = 'student' AND b.owner_id = s.student_id
        LEFT JOIN admin_users a
            ON b.owner_role IN ('instructor', 'admin') AND b.owner_id = a.admin_id
        WHERE b.build_id = %s AND COALESCE(b.is_published, TRUE) = TRUE;
    """, (build_id,))

    if not build:
        raise HTTPException(status_code=404, detail={"error": "Build not found"})

    build_data = build.get("build_data") or {}
    build["components"] = build_data.get("components", {})
    build["stats"] = build_data.get("stats", {})
    return build


@app.post("/api/builds/{build_id}/heart")
async def api_toggle_build_heart(build_id: int, request: Request):
    user = require_logged_in(request)
    ensure_social_tables()
    existing = run_select_one(
        "SELECT heart_id FROM build_hearts WHERE build_id = %s AND user_role = %s AND user_id = %s;",
        (build_id, user["role"], user["id"]),
    )
    if existing:
        run_write("DELETE FROM build_hearts WHERE heart_id = %s RETURNING heart_id;", (existing["heart_id"],))
        hearted = False
    else:
        run_write(
            "INSERT INTO build_hearts (build_id, user_role, user_id) VALUES (%s, %s, %s) RETURNING heart_id;",
            (build_id, user["role"], user["id"]),
        )
        hearted = True
    count = int((run_select_one("SELECT COUNT(*) AS count FROM build_hearts WHERE build_id = %s;", (build_id,)) or {}).get("count") or 0)
    return {"ok": True, "hearted": hearted, "heartCount": count}


@app.post("/api/builds/{build_id}/favorite")
async def api_toggle_build_favorite(build_id: int, request: Request):
    user = require_logged_in(request)
    ensure_social_tables()
    existing = run_select_one(
        "SELECT favorite_id FROM build_favorites WHERE build_id = %s AND user_role = %s AND user_id = %s;",
        (build_id, user["role"], user["id"]),
    )
    if existing:
        run_write("DELETE FROM build_favorites WHERE favorite_id = %s RETURNING favorite_id;", (existing["favorite_id"],))
        favorited = False
    else:
        run_write(
            "INSERT INTO build_favorites (build_id, user_role, user_id) VALUES (%s, %s, %s) RETURNING favorite_id;",
            (build_id, user["role"], user["id"]),
        )
        favorited = True
    count = int((run_select_one("SELECT COUNT(*) AS count FROM build_favorites WHERE build_id = %s;", (build_id,)) or {}).get("count") or 0)
    return {"ok": True, "favorited": favorited, "favoriteCount": count}


@app.delete("/api/builds/{build_id}")
async def api_delete_build(build_id: int, request: Request):
    """Delete a saved build."""
    user = require_logged_in(request)
    ensure_saved_builds_table()
    deleted = run_write("""
        DELETE FROM saved_builds
        WHERE build_id = %s
          AND ((owner_role = %s AND owner_id = %s) OR %s = 'admin')
        RETURNING build_id;
    """, (build_id, user.get("role"), user.get("id"), user.get("role")))
    
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Build not found"})
    
    return {"success": True}


# ============================================================
# ADMIN DASHBOARD SCHEMA & METADATA
# ============================================================

def get_schemas_metadata() -> dict[str, Any]:
    """Return schema metadata for admin dashboard."""
    return ADMIN_SCHEMAS
    return {
        "cpu": {
            "fields": ["brand", "model", "family", "cores", "baseClock", "turboClock", "cache", "igpu", "tdp", "memSupport", "socket", "released"],
            "labels": ["Brand", "Model", "CPU Family", "Cores (P/E)", "Base Clock", "Turbo Clock", "Cache", "Integrated GPU", "TDP", "Memory Support", "Socket", "Date Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "gpu": {
            "fields": ["brand", "model", "memType", "memCapacity", "busWidth", "coreClock", "cudaCores", "tdp", "psu", "formFactor", "release"],
            "labels": ["Brand", "Model", "Memory Type", "Memory Capacity", "Bus Width", "Core Clock", "CUDA/Shader Cores", "TDP", "PSU Req.", "Form Factor", "Release Year"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "psu": {
            "fields": ["brand", "model", "powerOutput", "psuType", "efficiency", "inputVoltage", "frequency", "cooling", "modular", "mainPower", "cpuPower", "pcieConn", "sataConn", "warranty", "released"],
            "labels": ["Brand", "Model", "Power Output", "PSU Type", "Efficiency", "Input Voltage", "Frequency", "Cooling", "Modular Type", "Main Power", "CPU Power", "PCIe Connectors", "SATA Connectors", "Warranty", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "ssd": {
            "fields": ["brand", "model", "storageType", "interface", "formFactor", "capacity", "nand", "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", "cache", "endurance", "power", "encryption", "released"],
            "labels": ["Brand", "Model", "Storage Type", "Interface", "Form Factor", "Capacity", "NAND Type", "Read Speed", "Write Speed", "Read IOPS", "Write IOPS", "Cache", "Endurance", "Power", "Encryption", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "hdd": {
            "fields": ["brand", "model", "storageType", "interface", "formFactor", "capacity", "readSpeed", "writeSpeed", "readIOPS", "writeIOPS", "cache", "power", "encryption", "released"],
            "labels": ["Brand", "Model", "Storage Type", "Interface", "Form Factor", "Capacity", "Read Speed", "Write Speed", "Read IOPS", "Write IOPS", "Cache", "Power", "Encryption", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "fan": {
            "fields": ["brand", "model", "dimensions", "speed", "airflow", "connector", "voltage", "released"],
            "labels": ["Brand", "Model", "Fan Dimensions", "Fan Speed", "Airflow (CFM)", "Connector Type", "Voltage", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "mobo": {
            "fields": ["brand", "model", "formFactor", "chipset", "socket", "memType", "dimms", "maxMem", "memSpeed", "pciSlots", "m2Slots", "usb", "tier", "released"],
            "labels": ["Brand", "Model", "Form Factor", "Chipset", "Socket", "Memory Type", "DIMM Slots", "Max Memory", "Memory Speed", "PCIe Slots", "M.2 Slots", "USB Ports", "Tier", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
        "ram": {
            "fields": ["brand", "model", "memType", "capacity", "config", "formFactor", "speed", "cas", "voltage", "pins", "ecc", "buffered", "xmp", "released"],
            "labels": ["Brand", "Model", "Memory Type", "Capacity", "Config", "Form Factor", "Speed", "CAS Latency", "Voltage", "Pins", "ECC Support", "Buffered", "XMP Support", "Released"],
            "brandKey": "brand",
            "modelKey": "model",
        },
    }


def get_category_info() -> dict[str, Any]:
    """Return category metadata for admin dashboard."""
    return {
        "cpu": {"name": "Processor (CPU)", "subtitle": "Manage CPU specifications and details", "pill": "pill-cpu", "icon": "cat-cpu"},
        "gpu": {"name": "Graphics Card (GPU)", "subtitle": "Manage GPU specifications and details", "pill": "pill-gpu", "icon": "cat-gpu"},
        "psu": {"name": "Power Supply (PSU)", "subtitle": "Manage PSU specifications and details", "pill": "pill-psu", "icon": "cat-psu"},
        "ssd": {"name": "Storage (SSD)", "subtitle": "Manage SSD specifications and details", "pill": "pill-ssd", "icon": "cat-ssd"},
        "hdd": {"name": "Storage (HDD)", "subtitle": "Manage HDD specifications and details", "pill": "pill-hdd", "icon": "cat-hdd"},
        "fan": {"name": "Cooling Fans", "subtitle": "Manage cooling fan specifications", "pill": "pill-fan", "icon": "cat-fan"},
        "mobo": {"name": "Motherboard", "subtitle": "Manage motherboard specifications", "pill": "pill-mobo", "icon": "cat-mobo"},
        "ram": {"name": "Memory (RAM)", "subtitle": "Manage RAM specifications and details", "pill": "pill-ram", "icon": "cat-ram"},
    }


@app.get("/api/admin/schemas")
async def api_get_schemas(request: Request):
    """Fetch admin dashboard schemas."""
    require_admin(request)
    return get_schemas_metadata()


@app.get("/api/admin/categories")
async def api_get_categories(request: Request):
    """Fetch admin dashboard category info."""
    require_admin(request)
    return get_category_info()


@app.get("/api/admin/metrics")
async def api_admin_metrics(request: Request):
    """Return dashboard-level usage metrics for admins."""
    require_admin(request)
    ensure_auth_tables()
    ensure_saved_builds_table()
    student_count = int((run_select_one("SELECT COUNT(*) AS count FROM student_users;") or {}).get("count") or 0)
    instructor_count = int((run_select_one("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'instructor';") or {}).get("count") or 0)
    admin_count = int((run_select_one("SELECT COUNT(*) AS count FROM admin_users WHERE role = 'admin';") or {}).get("count") or 0)
    recent_students = int((run_select_one("SELECT COUNT(*) AS count FROM student_users WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days';") or {}).get("count") or 0)
    recent_staff = int((run_select_one("SELECT COUNT(*) AS count FROM admin_users WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days';") or {}).get("count") or 0)
    published_builds = int((run_select_one("SELECT COUNT(*) AS count FROM saved_builds WHERE is_published = TRUE;") or {}).get("count") or 0)
    published_scenarios = int((run_select_one("SELECT COUNT(*) AS count FROM pc_scenarios WHERE is_published = TRUE;") or {}).get("count") or 0)
    return {
        "usersRegistered": student_count + instructor_count + admin_count,
        "students": student_count,
        "instructors": instructor_count,
        "admins": admin_count,
        "recentLogins": recent_students + recent_staff,
        "publishedBuilds": published_builds,
        "publishedScenarios": published_scenarios,
        "publishedTotal": published_builds + published_scenarios,
    }


@app.get("/api/admin/users/overview")
async def api_admin_users_overview(request: Request):
    """Return all user accounts for the dashboard Users drill-down."""
    require_admin(request)
    ensure_auth_tables()
    rows = run_select("""
        SELECT
            'student' AS type,
            student_id AS id,
            school_id AS identifier,
            display_name AS name,
            email,
            is_active,
            last_login_at::text AS last_login_at,
            created_at::text AS created_at
        FROM student_users
        UNION ALL
        SELECT
            role AS type,
            admin_id AS id,
            username AS identifier,
            display_name AS name,
            username AS email,
            is_active,
            last_login_at::text AS last_login_at,
            created_at::text AS created_at
        FROM admin_users
        ORDER BY type, id;
    """)
    return rows


@app.get("/api/admin/activity/recent-logins")
async def api_admin_recent_logins(request: Request):
    """Return users who logged in during the last seven days."""
    require_admin(request)
    ensure_auth_tables()
    rows = run_select("""
        SELECT *
        FROM (
            SELECT
                'student' AS type,
                student_id AS id,
                school_id AS identifier,
                display_name AS name,
                email,
                last_login_at::text AS last_login_at
            FROM student_users
            WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            UNION ALL
            SELECT
                role AS type,
                admin_id AS id,
                username AS identifier,
                display_name AS name,
                username AS email,
                last_login_at::text AS last_login_at
            FROM admin_users
            WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        ) recent
        ORDER BY last_login_at DESC;
    """)
    return rows


@app.get("/api/admin/published")
async def api_admin_published(request: Request):
    """Return published builds and scenarios for the dashboard Published drill-down."""
    require_admin(request)
    ensure_auth_tables()
    ensure_saved_builds_table()
    rows = run_select("""
        SELECT *
        FROM (
            SELECT
                'build' AS type,
                b.build_id AS id,
                b.build_name AS title,
                b.owner_role,
                COALESCE(s.display_name, a.display_name, 'Unknown') AS owner,
                b.created_at::text AS created_at
            FROM saved_builds b
            LEFT JOIN student_users s
                ON b.owner_role = 'student' AND b.owner_id = s.student_id
            LEFT JOIN admin_users a
                ON b.owner_role IN ('instructor', 'admin') AND b.owner_id = a.admin_id
            WHERE b.is_published = TRUE
            UNION ALL
            SELECT
                'scenario' AS type,
                sc.scenario_id AS id,
                sc.title,
                'instructor' AS owner_role,
                COALESCE(a.display_name, a.username, 'Unknown') AS owner,
                sc.created_at::text AS created_at
            FROM pc_scenarios sc
            LEFT JOIN admin_users a ON a.admin_id = sc.instructor_id
            WHERE sc.is_published = TRUE
        ) published
        ORDER BY created_at DESC;
    """)
    return rows


@app.get("/api/admin/components")
async def api_get_admin_components(request: Request):
    """Fetch all components grouped by category for admin dashboard."""
    require_admin(request)
    try:
        return fetch_all_admin_components_grouped()
    except Exception as e:
        print("ERROR LOADING COMPONENTS FOR ADMIN:", repr(e))
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to load components from PostgreSQL",
                "details": str(e),
            }
        )


@app.get("/api/admin/components/{category}")
async def api_get_admin_components_by_category(category: str, request: Request):
    """Fetch components by category for admin dashboard."""
    require_admin(request)
    normalized = normalize_admin_category(category)
    if str(category).lower().strip() == "all":
        return fetch_all_admin_components_grouped()
    if not normalized:
        raise HTTPException(status_code=400, detail={"error": "Invalid category"})
    return fetch_admin_components(normalized)


@app.post("/api/admin/components/{category}")
async def api_create_admin_component(category: str, request: Request):
    """Create a component row from the admin dashboard."""
    require_admin(request)
    payload = await request.json()
    return insert_admin_component(category, payload)


@app.put("/api/admin/components/{category}/{component_id}")
async def api_update_admin_component(category: str, component_id: int, request: Request):
    """Update a component row from the admin dashboard."""
    require_admin(request)
    payload = await request.json()
    return update_admin_component(category, component_id, payload)


@app.patch("/api/admin/components/{category}/{component_id}")
async def api_patch_admin_component(category: str, component_id: int, request: Request):
    """Patch a component row from the admin dashboard."""
    require_admin(request)
    payload = await request.json()
    existing = next((row for row in fetch_admin_components(category) if int(row["id"]) == int(component_id)), None)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": "Component not found"})
    existing.update(payload)
    return update_admin_component(category, component_id, existing)


@app.delete("/api/admin/components/{category}/{component_id}")
async def api_delete_admin_component(category: str, component_id: int, request: Request):
    """Delete a component row from the admin dashboard."""
    require_admin(request)
    return delete_admin_component(category, component_id)


@app.get("/api/admin/users")
async def api_get_admin_users(request: Request):
    """List admin accounts."""
    require_admin(request)
    ensure_admin_users_table()
    return run_select("""
        SELECT
            admin_id,
            username,
            display_name,
            is_active,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        FROM admin_users
        ORDER BY admin_id;
    """)


@app.get("/api/admin/users/students")
async def api_get_admin_students(request: Request):
    """List registered student accounts for the admin dashboard."""
    require_admin(request)
    ensure_student_users_table()
    return run_select("""
        SELECT
            student_id,
            school_id,
            email,
            first_name,
            last_name,
            display_name,
            is_active,
            last_login_at::text AS last_login_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        FROM student_users
        ORDER BY student_id;
    """)


@app.get("/api/admin/users/instructors")
async def api_get_admin_instructors(request: Request):
    """List registered instructor accounts for the admin dashboard."""
    require_admin(request)
    ensure_admin_users_table()
    return run_select("""
        SELECT
            admin_id,
            username,
            display_name,
            role,
            is_active,
            last_login_at::text AS last_login_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        FROM admin_users
        WHERE role = 'instructor'
        ORDER BY admin_id;
    """)


@app.post("/api/admin/users/students")
async def api_create_admin_student(request: Request):
    """Create a student account from the admin dashboard."""
    require_admin(request)
    payload = await request.json()
    return create_student_user(payload)


@app.post("/api/admin/users/instructors")
async def api_create_admin_instructor(request: Request):
    """Create an instructor account from the admin dashboard."""
    require_admin(request)
    payload = await request.json()
    return create_instructor_user(payload)


@app.delete("/api/admin/users/students/{student_id}")
async def api_delete_admin_student(student_id: int, request: Request):
    """Delete a student account and data owned by that account."""
    require_admin(request)
    return delete_user_account("students", student_id)


@app.delete("/api/admin/users/instructors/{instructor_id}")
async def api_delete_admin_instructor(instructor_id: int, request: Request):
    """Delete an instructor account and data owned by that account."""
    require_admin(request)
    return delete_user_account("instructors", instructor_id)


@app.post("/api/admin/users")
async def api_create_admin_user(request: Request):
    """Create another admin account."""
    require_admin(request)
    ensure_admin_users_table()
    payload = await request.json()
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    display_name = str(payload.get("display_name") or payload.get("displayName") or username).strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail={"error": "Username and password are required"})
    try:
        _, pw_hash = password_hash_bcrypt(password)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": "Password hashing failed"})
    try:
        row = run_write(
            """
            INSERT INTO admin_users (username, password_hash, display_name, role)
            VALUES (%s, %s, %s, %s)
            RETURNING admin_id, username, display_name, role, is_active, created_at::text AS created_at;
            """,
            (username, pw_hash, display_name, "admin"),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": "Could not create admin user", "details": str(exc)})
    return row


# ============================================================
# ERROR HANDLERS
# ============================================================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=404,
        content={"error": "Endpoint not found"}
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "details": str(exc)}
    )


# ============================================================
# STARTUP MESSAGE
# ============================================================

@app.on_event("startup")
async def startup_event():
    # Auto-sync schema on startup
    try:
        import importlib.util
        from pathlib import Path
        scripts_path = Path(__file__).parent / "scripts" / "schema_sync.py"
        if scripts_path.exists():
            spec = importlib.util.spec_from_file_location("schema_sync", scripts_path)
            if spec and spec.loader:
                schema_sync = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(schema_sync)
                schema_sync.create_version_table()
                is_synced = schema_sync.check_sync_status()
                if not is_synced:
                    print("\n⚠ Schema out of sync - run: python scripts/schema_sync.py --sync")
    except Exception as exc:
        pass  # schema_sync.py not available or error occurred
    
    try:
        ensure_auth_tables()
    except Exception as exc:
        print(f"Warning: Could not ensure auth tables: {exc}")
    print("=" * 60)
    print("Assembly PC - FastAPI Backend")
    print("=" * 60)
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "5000"))
    print(f"  DB: postgresql://postgres@localhost/pc_builder_simulation")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            lan_ip = probe.getsockname()[0]
    except Exception:
        lan_ip = "<your-computer-ip>"
    print(f"  Local URL:        http://127.0.0.1:{port}/")
    print(f"  LAN URL:          http://{lan_ip}:{port}/")
    print(f"  Simulator:        http://{lan_ip}:{port}/simulator")
    print(f"  Admin:            http://{lan_ip}:{port}/admin")
    print(f"  API Docs:         http://127.0.0.1:{port}/docs")
    print(f"  Listening on:     {host}:{port}")
    print("=" * 60)
    print(f"  Admin Access: admin | admin123")


# ============================================================
# MAIN - FOR RUNNING WITH: python app.py
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("APP_HOST", "0.0.0.0"), port=int(os.getenv("APP_PORT", "5000")))
