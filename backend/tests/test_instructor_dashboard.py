"""
Unit and integration tests for the Instructor Classroom Dashboard backend,
app.py auth/routing integration, and core/middleware.py security settings.

Runs cleanly with `python -m unittest` even when third-party runtime packages
(fastapi, psycopg2, bcrypt, python-dotenv) are not installed in the runner,
by installing lightweight in-memory stubs only for missing modules.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import mimetypes
import os
import re
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _install_missing_third_party_stubs() -> None:
    """Install minimal stubs for missing third-party packages in lightweight test runners."""
    if importlib.util.find_spec("dotenv") is None and "dotenv" not in sys.modules:
        dotenv_mod = types.ModuleType("dotenv")
        dotenv_mod.load_dotenv = lambda *args, **kwargs: True
        sys.modules["dotenv"] = dotenv_mod

    if importlib.util.find_spec("bcrypt") is None and "bcrypt" not in sys.modules:
        bcrypt_mod = types.ModuleType("bcrypt")
        bcrypt_mod.gensalt = lambda rounds=12: b"$2b$12$abcdefghijklmnopqrstuv"
        bcrypt_mod.hashpw = lambda pw, salt: b"$2b$12$stubhashvalue." + pw
        bcrypt_mod.checkpw = lambda pw, hashed: hashed.endswith(pw) or pw == b"admin123"
        sys.modules["bcrypt"] = bcrypt_mod

    if importlib.util.find_spec("psycopg2") is None and "psycopg2" not in sys.modules:
        psycopg2_mod = types.ModuleType("psycopg2")
        psycopg2_mod.connect = lambda *args, **kwargs: None
        extras_mod = types.ModuleType("psycopg2.extras")
        extras_mod.RealDictCursor = object()

        class _Json:
            def __init__(self, adapted):
                self.adapted = adapted

        extras_mod.Json = _Json
        psycopg2_mod.extras = extras_mod
        sys.modules["psycopg2"] = psycopg2_mod
        sys.modules["psycopg2.extras"] = extras_mod

    if importlib.util.find_spec("starlette") is None and "starlette" not in sys.modules:
        starlette_mod = types.ModuleType("starlette")
        starlette_mw = types.ModuleType("starlette.middleware")
        starlette_base = types.ModuleType("starlette.middleware.base")

        class BaseHTTPMiddleware:
            def __init__(self, app=None, *args, **kwargs):
                self.app = app

        starlette_base.BaseHTTPMiddleware = BaseHTTPMiddleware
        starlette_mw.base = starlette_base
        starlette_mod.middleware = starlette_mw
        sys.modules["starlette"] = starlette_mod
        sys.modules["starlette.middleware"] = starlette_mw
        sys.modules["starlette.middleware.base"] = starlette_base

    if importlib.util.find_spec("fastapi") is None and "fastapi" not in sys.modules:
        fastapi_mod = types.ModuleType("fastapi")
        responses_mod = types.ModuleType("fastapi.responses")
        staticfiles_mod = types.ModuleType("fastapi.staticfiles")
        mw_mod = types.ModuleType("fastapi.middleware")
        cors_mod = types.ModuleType("fastapi.middleware.cors")

        class HTTPException(Exception):
            def __init__(self, status_code: int, detail=None):
                super().__init__(str(detail))
                self.status_code = status_code
                self.detail = detail

        class Request:
            def __init__(self, method="GET", path="/", body=None, cookies=None, headers=None, query_params=None):
                self.method = method
                self.url = SimpleNamespace(path=path, scheme="http", hostname="localhost", netloc="localhost")
                self._body = body
                self.cookies = cookies or {}
                self.headers = headers or {}
                self.query_params = query_params or {}
                self.client = SimpleNamespace(host="127.0.0.1")

            async def json(self):
                if isinstance(self._body, Exception):
                    raise self._body
                return self._body

            async def body(self):
                if isinstance(self._body, bytes):
                    return self._body
                if isinstance(self._body, str):
                    return self._body.encode("utf-8")
                return json.dumps(self._body or {}).encode("utf-8")

        class Response:
            def __init__(self, content=b"", status_code=200, media_type=None, headers=None):
                self.body = content.encode("utf-8") if isinstance(content, str) else content
                self.status_code = status_code
                self.media_type = media_type
                self.headers = dict(headers or {})
                self.cookies_set = {}
                self.cookies_deleted = []

            def set_cookie(self, key, value="", **kwargs):
                self.cookies_set[key] = {"value": value, **kwargs}

            def delete_cookie(self, key, **kwargs):
                self.cookies_deleted.append(key)

        class JSONResponse(Response):
            def __init__(self, content, status_code=200, headers=None):
                super().__init__(
                    content=json.dumps(content),
                    status_code=status_code,
                    media_type="application/json",
                    headers=headers,
                )
                self.data = content

        class HTMLResponse(Response):
            def __init__(self, content, status_code=200, headers=None):
                super().__init__(
                    content=content,
                    status_code=status_code,
                    media_type="text/html",
                    headers=headers,
                )
                self.text = content

        class RedirectResponse(Response):
            def __init__(self, url, status_code=303, headers=None):
                hdrs = dict(headers or {})
                hdrs["location"] = url
                super().__init__(content=b"", status_code=status_code, headers=hdrs)
                self.url = url

        class FileResponse(Response):
            def __init__(self, path, media_type=None, status_code=200):
                super().__init__(content=b"", status_code=status_code, media_type=media_type)
                self.path = path

        class StaticFiles:
            def __init__(self, directory: str):
                self.directory = directory

        class CORSMiddleware:
            pass

        class _RouteRecord:
            def __init__(self, path: str, methods: set[str], endpoint):
                self.path = path
                self.methods = methods
                self.endpoint = endpoint

        class _RouterMixin:
            def __init__(self):
                self.routes: list[_RouteRecord] = []

            def _add(self, method: str, path: str, fn):
                self.routes.append(_RouteRecord(path, {method}, fn))
                return fn

            def get(self, path: str, **kwargs):
                return lambda fn: self._add("GET", path, fn)

            def post(self, path: str, **kwargs):
                return lambda fn: self._add("POST", path, fn)

            def put(self, path: str, **kwargs):
                return lambda fn: self._add("PUT", path, fn)

            def patch(self, path: str, **kwargs):
                return lambda fn: self._add("PATCH", path, fn)

            def delete(self, path: str, **kwargs):
                return lambda fn: self._add("DELETE", path, fn)

        class APIRouter(_RouterMixin):
            pass

        class FastAPI(_RouterMixin):
            def __init__(self, **kwargs):
                super().__init__()
                self.title = kwargs.get("title")
                self.user_middleware = []
                self.mounts = []
                self.exception_handlers = {}
                self.startup_handlers = []

            def add_middleware(self, cls, **options):
                self.user_middleware.append(SimpleNamespace(cls=cls, kwargs=options, options=options))

            def mount(self, path: str, app, name: str | None = None):
                self.mounts.append((path, app, name))

            def include_router(self, router):
                self.routes.extend(router.routes)

            def exception_handler(self, code):
                def decorator(fn):
                    self.exception_handlers[code] = fn
                    return fn
                return decorator

            def on_event(self, event_name):
                def decorator(fn):
                    if event_name == "startup":
                        self.startup_handlers.append(fn)
                    return fn
                return decorator

        fastapi_mod.FastAPI = FastAPI
        fastapi_mod.APIRouter = APIRouter
        fastapi_mod.HTTPException = HTTPException
        fastapi_mod.Request = Request
        fastapi_mod.Response = Response

        responses_mod.HTMLResponse = HTMLResponse
        responses_mod.FileResponse = FileResponse
        responses_mod.JSONResponse = JSONResponse
        responses_mod.RedirectResponse = RedirectResponse

        staticfiles_mod.StaticFiles = StaticFiles
        cors_mod.CORSMiddleware = CORSMiddleware
        mw_mod.cors = cors_mod

        sys.modules["fastapi"] = fastapi_mod
        sys.modules["fastapi.responses"] = responses_mod
        sys.modules["fastapi.staticfiles"] = staticfiles_mod
        sys.modules["fastapi.middleware"] = mw_mod
        sys.modules["fastapi.middleware.cors"] = cors_mod


_install_missing_third_party_stubs()

from fastapi import HTTPException, Request, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
import app as backend_app  # noqa: E402
from core import middleware as core_middleware  # noqa: E402
from api.routes.instructor_dashboard import (  # noqa: E402
    INSTRUCTOR_DASHBOARD_DDL_STATEMENTS,
    create_instructor_dashboard_router,
    ensure_instructor_dashboard_tables,
)


class _DummyRequest:
    """Request wrapper compatible with both real FastAPI handlers and unit tests."""

    def __init__(
        self,
        method: str = "GET",
        path: str = "/",
        body: object = None,
        cookies: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        query_params: dict[str, str] | None = None,
    ):
        self.method = method
        self.url = SimpleNamespace(path=path, scheme="http", hostname="localhost", netloc="localhost")
        self._body = body
        self.cookies = cookies or {}
        self.headers = headers or {}
        self.query_params = query_params or {}
        self.client = SimpleNamespace(host="127.0.0.1")

    async def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body

    async def body(self):
        if isinstance(self._body, bytes):
            return self._body
        if isinstance(self._body, str):
            return self._body.encode("utf-8")
        return json.dumps(self._body or {}).encode("utf-8")


class FakeStore:
    """In-memory transactional store simulating the PostgreSQL instructor dashboard tables."""

    def __init__(self):
        self.admin_users: dict[int, dict] = {
            10: {
                "admin_id": 10,
                "username": "prof.ada@lnu.edu.ph",
                "display_name": "Prof. Ada Lovelace",
                "role": "instructor",
                "is_active": True,
            },
            11: {
                "admin_id": 11,
                "username": "prof.alan@lnu.edu.ph",
                "display_name": "Prof. Alan Turing",
                "role": "instructor",
                "is_active": True,
            },
        }
        self.student_users: dict[int, dict] = {
            101: {
                "student_id": 101,
                "school_id": "2024-0001",
                "email": "alex@student.lnu.edu.ph",
                "first_name": "Alex",
                "last_name": "Rivera",
                "display_name": "Alex Rivera",
                "is_active": True,
            },
            102: {
                "student_id": 102,
                "school_id": "2024-0002",
                "email": "maya@student.lnu.edu.ph",
                "first_name": "Maya",
                "last_name": "Lin",
                "display_name": "Maya Lin",
                "is_active": True,
            },
            103: {
                "student_id": 103,
                "school_id": "2024-9999",
                "email": "inactive@student.lnu.edu.ph",
                "first_name": "Inactive",
                "last_name": "User",
                "display_name": "Inactive User",
                "is_active": False,
            },
        }
        self.pc_scenarios: dict[int, dict] = {
            5: {"scenario_id": 5, "instructor_id": 10, "is_published": True}
        }
        self.classrooms: dict[int, dict] = {}
        self.enrollments: dict[int, dict] = {}
        self.invitations: dict[int, dict] = {}
        self.activities: dict[int, dict] = {}
        self.submissions: dict[int, dict] = {}
        self._seq = {"classroom": 0, "enrollment": 0, "invitation": 0, "activity": 0, "submission": 0}
        self.ddl_executed: list[str] = []
        self.fail_on_submission_delete = False

    def snapshot(self) -> dict:
        return {
            "admin_users": {k: dict(v) for k, v in self.admin_users.items()},
            "classrooms": {k: dict(v) for k, v in self.classrooms.items()},
            "enrollments": {k: dict(v) for k, v in self.enrollments.items()},
            "invitations": {k: dict(v) for k, v in self.invitations.items()},
            "activities": {k: dict(v) for k, v in self.activities.items()},
            "submissions": {k: dict(v) for k, v in self.submissions.items()},
            "seq": dict(self._seq),
        }

    def restore(self, snap: dict) -> None:
        self.admin_users = snap["admin_users"]
        self.classrooms = snap["classrooms"]
        self.enrollments = snap["enrollments"]
        self.invitations = snap["invitations"]
        self.activities = snap["activities"]
        self.submissions = snap["submissions"]
        self._seq = snap["seq"]


class _FakeCursor:
    def __init__(self, store: FakeStore):
        self.store = store
        self._rows: list[dict] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query: str, params=()):
        q = " ".join(query.split())
        params = tuple(params or ())
        self._rows = []

        if q.startswith("CREATE TABLE") or q.startswith("CREATE INDEX") or q.startswith("CREATE UNIQUE INDEX"):
            self.store.ddl_executed.append(q)
            return

        if "FROM admin_users WHERE admin_id = %s" in q:
            admin_id = int(params[0])
            row = self.store.admin_users.get(admin_id)
            if row and row["role"] == "instructor" and row["is_active"]:
                self._rows = [dict(row)]
            return

        if q.startswith("UPDATE admin_users SET display_name = %s"):
            name, admin_id = params
            row = self.store.admin_users.get(int(admin_id))
            if row and row["role"] == "instructor" and row["is_active"]:
                row["display_name"] = name
                self._rows = [{"display_name": name}]
            return

        if "FROM classrooms WHERE instructor_id = %s" in q:
            iid = int(params[0])
            rows = [
                dict(c)
                for c in self.store.classrooms.values()
                if c["instructor_id"] == iid and not c["is_archived"]
            ]
            rows.sort(key=lambda r: (r["created_at"], r["classroom_id"]), reverse=True)
            self._rows = rows
            return

        if "FROM classroom_enrollments ce JOIN classrooms c" in q and "c.instructor_id = %s" in q:
            iid = int(params[0])
            rows = []
            for en in sorted(self.store.enrollments.values(), key=lambda r: (r["enrolled_at"], r["student_id"])):
                cls = self.store.classrooms.get(en["classroom_id"])
                stu = self.store.student_users.get(en["student_id"])
                if cls and stu and cls["instructor_id"] == iid and not cls["is_archived"]:
                    rows.append({"classroom_id": cls["classroom_id"], **stu})
            self._rows = rows
            return

        if "FROM classroom_invitations ci JOIN classrooms c" in q and "c.instructor_id = %s" in q:
            iid = int(params[0])
            rows = []
            for inv in sorted(self.store.invitations.values(), key=lambda r: (r["created_at"], r["invitation_id"]), reverse=True):
                cls = self.store.classrooms.get(inv["classroom_id"])
                stu = self.store.student_users.get(inv["student_id"])
                if cls and stu and cls["instructor_id"] == iid and not cls["is_archived"] and inv["status"] == "pending":
                    rows.append({**inv, **stu})
            self._rows = rows
            return

        if "FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id WHERE c.instructor_id = %s" in q:
            iid = int(params[0])
            rows = []
            for act in sorted(self.store.activities.values(), key=lambda r: (r["scheduled_at"], r["activity_id"])):
                cls = self.store.classrooms.get(act["classroom_id"])
                if cls and cls["instructor_id"] == iid and not cls["is_archived"]:
                    rows.append({**act, "class_name": cls["display_name"]})
            self._rows = rows
            return

        if "FROM activity_submissions asub JOIN classroom_activities ca" in q:
            iid = int(params[0])
            rows = []
            for sub in self.store.submissions.values():
                act = self.store.activities.get(sub["activity_id"])
                cls = self.store.classrooms.get(act["classroom_id"]) if act else None
                if act and cls and cls["instructor_id"] == iid and not cls["is_archived"] and sub["score"] is not None:
                    rows.append({"activity_id": sub["activity_id"], "student_id": sub["student_id"], "score": sub["score"]})
            self._rows = rows
            return

        if q.startswith("SELECT classroom_id FROM classrooms WHERE UPPER(join_code) = UPPER(%s)"):
            code = params[0].upper()
            for c in self.store.classrooms.values():
                if c["join_code"].upper() == code:
                    self._rows = [{"classroom_id": c["classroom_id"]}]
                    return
            return

        if q.startswith("INSERT INTO classrooms"):
            iid, name, display_name, join_code, cap = params
            for c in self.store.classrooms.values():
                if c["join_code"].upper() == join_code.upper():
                    raise RuntimeError("duplicate key value violates unique constraint")
            self.store._seq["classroom"] += 1
            cid = self.store._seq["classroom"]
            now = datetime.now(timezone.utc)
            row = {
                "classroom_id": cid,
                "instructor_id": int(iid),
                "name": name,
                "display_name": display_name,
                "join_code": join_code,
                "student_capacity": cap,
                "is_archived": False,
                "created_at": now,
                "updated_at": now,
            }
            self.store.classrooms[cid] = row
            self._rows = [dict(row)]
            return

        if "FROM classrooms WHERE classroom_id = %s AND instructor_id = %s" in q:
            cid, iid = int(params[0]), int(params[1])
            cls = self.store.classrooms.get(cid)
            if cls and cls["instructor_id"] == iid and not cls["is_archived"]:
                self._rows = [dict(cls)]
            return

        if "FROM student_users WHERE (lower(school_id) = lower(%s) OR lower(email) = lower(%s))" in q:
            ident = params[0].lower()
            for stu in self.store.student_users.values():
                if stu["is_active"] and (stu["school_id"].lower() == ident or stu["email"].lower() == ident):
                    self._rows = [dict(stu)]
                    return
            return

        if "SELECT enrollment_id FROM classroom_enrollments WHERE classroom_id = %s AND student_id = %s" in q:
            cid, sid = int(params[0]), int(params[1])
            for en in self.store.enrollments.values():
                if en["classroom_id"] == cid and en["student_id"] == sid:
                    self._rows = [{"enrollment_id": en["enrollment_id"]}]
                    return
            return

        if "SELECT invitation_id FROM classroom_invitations WHERE classroom_id = %s AND student_id = %s AND status = 'pending'" in q:
            cid, sid = int(params[0]), int(params[1])
            for inv in self.store.invitations.values():
                if inv["classroom_id"] == cid and inv["student_id"] == sid and inv["status"] == "pending":
                    self._rows = [{"invitation_id": inv["invitation_id"]}]
                    return
            return

        if q.startswith("SELECT COUNT(*) AS count FROM classroom_enrollments WHERE classroom_id = %s"):
            cid = int(params[0])
            cnt = sum(1 for en in self.store.enrollments.values() if en["classroom_id"] == cid)
            self._rows = [{"count": cnt}]
            return

        if q.startswith("INSERT INTO classroom_invitations"):
            cid, sid, inv_by = int(params[0]), int(params[1]), int(params[2])
            self.store._seq["invitation"] += 1
            inv_id = self.store._seq["invitation"]
            row = {
                "invitation_id": inv_id,
                "classroom_id": cid,
                "student_id": sid,
                "invited_by": inv_by,
                "status": "pending",
                "created_at": datetime.now(timezone.utc),
                "responded_at": None,
            }
            self.store.invitations[inv_id] = row
            self._rows = [dict(row)]
            return

        if "FROM classroom_invitations ci JOIN student_users su" in q and "WHERE ci.classroom_id = %s AND ci.status = 'pending'" in q:
            cid = int(params[0])
            rows = []
            for inv in sorted(self.store.invitations.values(), key=lambda r: (r["created_at"], r["invitation_id"]), reverse=True):
                stu = self.store.student_users.get(inv["student_id"])
                if inv["classroom_id"] == cid and inv["status"] == "pending" and stu:
                    rows.append({**inv, **stu})
            self._rows = rows
            return

        if q.startswith("DELETE FROM classroom_invitations WHERE invitation_id = %s AND classroom_id = %s"):
            inv_id, cid = int(params[0]), int(params[1])
            inv = self.store.invitations.get(inv_id)
            if inv and inv["classroom_id"] == cid and inv["status"] == "pending":
                del self.store.invitations[inv_id]
                self._rows = [{"invitation_id": inv_id}]
            return

        if q.startswith("DELETE FROM classroom_enrollments WHERE classroom_id = %s AND student_id = %s"):
            cid, sid = int(params[0]), int(params[1])
            for eid, en in list(self.store.enrollments.items()):
                if en["classroom_id"] == cid and en["student_id"] == sid:
                    del self.store.enrollments[eid]
                    self._rows = [{"enrollment_id": eid}]
                    return
            return

        if q.startswith("DELETE FROM activity_submissions WHERE student_id = %s AND activity_id IN"):
            if self.store.fail_on_submission_delete:
                raise RuntimeError("Simulated mid-transaction failure")
            sid, cid = int(params[0]), int(params[1])
            act_ids = {aid for aid, a in self.store.activities.items() if a["classroom_id"] == cid}
            for sub_id, sub in list(self.store.submissions.items()):
                if sub["student_id"] == sid and sub["activity_id"] in act_ids:
                    del self.store.submissions[sub_id]
            return

        if "FROM classroom_enrollments ce JOIN student_users su" in q and "WHERE ce.classroom_id = %s" in q:
            cid = int(params[0])
            rows = []
            for en in sorted(self.store.enrollments.values(), key=lambda r: (r["enrolled_at"], r["student_id"])):
                if en["classroom_id"] == cid:
                    stu = self.store.student_users.get(en["student_id"])
                    if stu:
                        rows.append(dict(stu))
            self._rows = rows
            return

        if "FROM pc_scenarios WHERE scenario_id = %s" in q:
            scid, iid = int(params[0]), int(params[1])
            sc = self.store.pc_scenarios.get(scid)
            if sc and (sc["instructor_id"] == iid or sc["is_published"]):
                self._rows = [{"scenario_id": scid}]
            return

        if q.startswith("INSERT INTO classroom_activities"):
            cid, scid, aname, sched_at, due_at, is_locked, manual_ov = params
            self.store._seq["activity"] += 1
            aid = self.store._seq["activity"]
            row = {
                "activity_id": aid,
                "classroom_id": int(cid),
                "scenario_id": scid,
                "activity_name": aname,
                "scheduled_at": sched_at,
                "due_at": due_at,
                "is_locked": bool(is_locked),
                "manual_override": bool(manual_ov),
            }
            self.store.activities[aid] = row
            self._rows = [dict(row)]
            return

        if "FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id WHERE ca.activity_id = %s AND c.instructor_id = %s" in q:
            aid, iid = int(params[0]), int(params[1])
            act = self.store.activities.get(aid)
            cls = self.store.classrooms.get(act["classroom_id"]) if act else None
            if act and cls and cls["instructor_id"] == iid and not cls["is_archived"]:
                self._rows = [dict(act)]
            return

        if q.startswith("UPDATE classroom_activities SET classroom_id = %s"):
            cid, scid, aname, sched_at, due_at, is_locked, manual_ov, aid = params
            act = self.store.activities[int(aid)]
            act.update(
                {
                    "classroom_id": int(cid),
                    "scenario_id": scid,
                    "activity_name": aname,
                    "scheduled_at": sched_at,
                    "due_at": due_at,
                    "is_locked": bool(is_locked),
                    "manual_override": bool(manual_ov),
                }
            )
            self._rows = [dict(act)]
            return

        if q.startswith("DELETE FROM activity_submissions WHERE activity_id = %s AND student_id = %s"):
            aid, sid = int(params[0]), int(params[1])
            for sub_id, sub in list(self.store.submissions.items()):
                if sub["activity_id"] == aid and sub["student_id"] == sid:
                    del self.store.submissions[sub_id]
            return

        if q.startswith("DELETE FROM activity_submissions WHERE activity_id = %s"):
            aid = int(params[0])
            for sub_id, sub in list(self.store.submissions.items()):
                if sub["activity_id"] == aid:
                    del self.store.submissions[sub_id]
            return

        if "SELECT student_id, score FROM activity_submissions WHERE activity_id = %s" in q:
            aid = int(params[0])
            self._rows = [
                {"student_id": s["student_id"], "score": s["score"]}
                for s in self.store.submissions.values()
                if s["activity_id"] == aid and s["score"] is not None
            ]
            return

        if q.startswith("DELETE FROM classroom_activities ca USING classrooms c"):
            aid, iid = int(params[0]), int(params[1])
            act = self.store.activities.get(aid)
            cls = self.store.classrooms.get(act["classroom_id"]) if act else None
            if act and cls and cls["instructor_id"] == iid and not cls["is_archived"]:
                del self.store.activities[aid]
                for sub_id, sub in list(self.store.submissions.items()):
                    if sub["activity_id"] == aid:
                        del self.store.submissions[sub_id]
                self._rows = [{"activity_id": aid}]
            return

        if q.startswith("UPDATE classroom_activities ca SET is_locked = %s"):
            is_locked, aid, iid = bool(params[0]), int(params[1]), int(params[2])
            act = self.store.activities.get(aid)
            cls = self.store.classrooms.get(act["classroom_id"]) if act else None
            if act and cls and cls["instructor_id"] == iid and not cls["is_archived"]:
                act["is_locked"] = is_locked
                act["manual_override"] = True
                self._rows = [dict(act)]
            return

        if q.startswith("INSERT INTO activity_submissions (activity_id, student_id, build_id, score"):
            aid = int(params[0])
            sid = int(params[1])
            build_id = int(params[2]) if params[2] is not None else None
            score = int(params[3])
            now = datetime.now(timezone.utc)
            for sub in self.store.submissions.values():
                if sub["activity_id"] == aid and sub["student_id"] == sid:
                    if build_id is not None:
                        sub["build_id"] = build_id
                    sub["score"] = score
                    sub["submitted_at"] = now
                    self._rows = [dict(sub)]
                    return
            self.store._seq["submission"] += 1
            sub_id = self.store._seq["submission"]
            row = {
                "submission_id": sub_id,
                "activity_id": aid,
                "student_id": sid,
                "build_id": build_id,
                "score": score,
                "graded_by": None,
                "submitted_at": now,
            }
            self.store.submissions[sub_id] = row
            self._rows = [dict(row)]
            return

        if q.startswith("INSERT INTO activity_submissions"):
            aid, sid, score, graded_by = int(params[0]), int(params[1]), int(params[2]), int(params[3])
            now = datetime.now(timezone.utc)
            for sub in self.store.submissions.values():
                if sub["activity_id"] == aid and sub["student_id"] == sid:
                    sub["score"] = score
                    sub["graded_by"] = graded_by
                    if "submitted_at" not in sub:
                        sub["submitted_at"] = now
                    self._rows = [{"score": score}]
                    return
            self.store._seq["submission"] += 1
            sub_id = self.store._seq["submission"]
            self.store.submissions[sub_id] = {
                "submission_id": sub_id,
                "activity_id": aid,
                "student_id": sid,
                "build_id": None,
                "score": score,
                "graded_by": graded_by,
                "submitted_at": now,
            }
            self._rows = [{"score": score}]
            return

        if "FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id JOIN classroom_enrollments ce" in q and "WHERE ce.student_id = %s AND c.is_archived = FALSE" in q:
            sid = int(params[0])
            enrolled_cids = {
                en["classroom_id"] for en in self.store.enrollments.values() if en["student_id"] == sid
            }
            rows = []
            for act in sorted(self.store.activities.values(), key=lambda r: (r["scheduled_at"], r["activity_id"])):
                cls = self.store.classrooms.get(act["classroom_id"])
                if not cls or cls["is_archived"] or cls["classroom_id"] not in enrolled_cids:
                    continue
                sc = self.store.pc_scenarios.get(act.get("scenario_id")) if act.get("scenario_id") else None
                sub = next(
                    (
                        s
                        for s in self.store.submissions.values()
                        if s["activity_id"] == act["activity_id"] and s["student_id"] == sid
                    ),
                    None,
                )
                rows.append(
                    {
                        **act,
                        "activity_type": sc.get("activity_type") if sc else None,
                        "submission_id": sub["submission_id"] if sub else None,
                        "score": sub["score"] if sub else None,
                        "build_id": sub.get("build_id") if sub else None,
                        "submitted_at": sub.get("submitted_at") if sub else None,
                    }
                )
            self._rows = rows
            return

        if (
            "FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id JOIN admin_users a" in q
            and "WHERE c.is_archived = FALSE ORDER BY ca.scheduled_at" in q
            and "WHERE ca.activity_id = %s" not in q
        ):
            sid = int(params[0])
            enrolled_cids = {
                en["classroom_id"] for en in self.store.enrollments.values() if en["student_id"] == sid
            }
            rows = []
            for act in sorted(self.store.activities.values(), key=lambda r: (r["scheduled_at"], r["activity_id"])):
                cls = self.store.classrooms.get(act["classroom_id"])
                if not cls or cls["is_archived"] or cls["classroom_id"] not in enrolled_cids:
                    continue
                inst = self.store.admin_users.get(cls["instructor_id"])
                sc = self.store.pc_scenarios.get(act.get("scenario_id")) if act.get("scenario_id") else None
                sub = next(
                    (
                        s
                        for s in self.store.submissions.values()
                        if s["activity_id"] == act["activity_id"] and s["student_id"] == sid
                    ),
                    None,
                )
                rows.append(
                    {
                        **act,
                        "class_name": cls["name"],
                        "class_display_name": cls["display_name"],
                        "instructor_name": inst["display_name"] if inst else "Instructor",
                        "activity_type": sc.get("activity_type") if sc else None,
                        "scenario_description": sc.get("description") if sc else None,
                        "scenario_tier": sc.get("tier") if sc else None,
                        "scenario_time_limit_minutes": sc.get("time_limit_minutes") if sc else None,
                        "submission_id": sub["submission_id"] if sub else None,
                        "score": sub["score"] if sub else None,
                        "build_id": sub.get("build_id") if sub else None,
                        "submitted_at": sub.get("submitted_at") if sub else None,
                    }
                )
            self._rows = rows
            return

        if "FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id JOIN admin_users a" in q and "WHERE ca.activity_id = %s AND c.is_archived = FALSE" in q:
            sid, aid = int(params[0]), int(params[1])
            act = self.store.activities.get(aid)
            cls = self.store.classrooms.get(act["classroom_id"]) if act else None
            is_enrolled = bool(
                cls
                and any(
                    en["classroom_id"] == cls["classroom_id"] and en["student_id"] == sid
                    for en in self.store.enrollments.values()
                )
            )
            if act and cls and not cls["is_archived"] and is_enrolled:
                inst = self.store.admin_users.get(cls["instructor_id"])
                sc = self.store.pc_scenarios.get(act.get("scenario_id")) if act.get("scenario_id") else None
                sub = next(
                    (
                        s
                        for s in self.store.submissions.values()
                        if s["activity_id"] == aid and s["student_id"] == sid
                    ),
                    None,
                )
                self._rows = [
                    {
                        **act,
                        "class_name": cls["name"],
                        "class_display_name": cls["display_name"],
                        "instructor_name": inst["display_name"] if inst else "Instructor",
                        "activity_type": sc.get("activity_type") if sc else None,
                        "submission_id": sub["submission_id"] if sub else None,
                        "score": sub["score"] if sub else None,
                        "build_id": sub.get("build_id") if sub else None,
                        "submitted_at": sub.get("submitted_at") if sub else None,
                    }
                ]
            return

        if "SELECT ca.activity_id, ca.classroom_id, ca.is_locked FROM classroom_activities ca JOIN classrooms c ON c.classroom_id = ca.classroom_id WHERE ca.activity_id = %s AND c.is_archived = FALSE" in q:
            aid = int(params[0])
            act = self.store.activities.get(aid)
            cls = self.store.classrooms.get(act["classroom_id"]) if act else None
            if act and cls and not cls["is_archived"]:
                self._rows = [
                    {
                        "activity_id": act["activity_id"],
                        "classroom_id": act["classroom_id"],
                        "is_locked": act["is_locked"],
                    }
                ]
            return

        if "FROM classrooms c JOIN admin_users a ON a.admin_id = c.instructor_id WHERE UPPER(c.join_code) = UPPER(%s)" in q:
            code = params[0].upper()
            for cls in self.store.classrooms.values():
                if cls["join_code"].upper() == code and not cls["is_archived"]:
                    inst = self.store.admin_users.get(cls["instructor_id"])
                    self._rows = [{**cls, "instructor_name": inst["display_name"] if inst else "Instructor"}]
                    return
            return

        if q.startswith("INSERT INTO classroom_enrollments"):
            cid, sid = int(params[0]), int(params[1])
            self.store._seq["enrollment"] += 1
            eid = self.store._seq["enrollment"]
            self.store.enrollments[eid] = {
                "enrollment_id": eid,
                "classroom_id": cid,
                "student_id": sid,
                "enrolled_at": datetime.now(timezone.utc),
            }
            self._rows = [{"enrollment_id": eid}]
            return

        if q.startswith("UPDATE classroom_invitations SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE classroom_id = %s"):
            cid, sid = int(params[0]), int(params[1])
            for inv in self.store.invitations.values():
                if inv["classroom_id"] == cid and inv["student_id"] == sid and inv["status"] == "pending":
                    inv["status"] = "accepted"
                    inv["responded_at"] = datetime.now(timezone.utc)
            return

        if "FROM classroom_enrollments ce JOIN classrooms c ON c.classroom_id = ce.classroom_id JOIN admin_users a ON a.admin_id = c.instructor_id" in q:
            sid = int(params[0])
            rows = []
            for en in sorted(
                self.store.enrollments.values(),
                key=lambda r: (r["enrolled_at"], r["classroom_id"]),
                reverse=True,
            ):
                if en["student_id"] != sid:
                    continue
                cls = self.store.classrooms.get(en["classroom_id"])
                if not cls or cls["is_archived"]:
                    continue
                inst = self.store.admin_users.get(cls["instructor_id"])
                act_count = sum(
                    1 for act in self.store.activities.values() if act["classroom_id"] == cls["classroom_id"]
                )
                rows.append(
                    {
                        "classroom_id": cls["classroom_id"],
                        "name": cls["name"],
                        "display_name": cls["display_name"],
                        "join_code": cls["join_code"],
                        "student_capacity": cls["student_capacity"],
                        "enrolled_at": en["enrolled_at"],
                        "instructor_name": inst["display_name"] if inst else "Instructor",
                        "activities_count": act_count,
                    }
                )
            self._rows = rows
            return

        if "FROM classroom_invitations ci JOIN classrooms c ON c.classroom_id = ci.classroom_id JOIN admin_users a" in q:
            sid = int(params[0])
            rows = []
            for inv in sorted(self.store.invitations.values(), key=lambda r: (r["created_at"], r["invitation_id"]), reverse=True):
                cls = self.store.classrooms.get(inv["classroom_id"])
                inst = self.store.admin_users.get(cls["instructor_id"]) if cls else None
                if inv["student_id"] == sid and inv["status"] == "pending" and cls and not cls["is_archived"]:
                    rows.append(
                        {
                            "invitation_id": inv["invitation_id"],
                            "classroom_id": cls["classroom_id"],
                            "status": inv["status"],
                            "created_at": inv["created_at"],
                            "classroom_name": cls["name"],
                            "classroom_display_name": cls["display_name"],
                            "join_code": cls["join_code"],
                            "instructor_id": cls["instructor_id"],
                            "instructor_name": inst["display_name"] if inst else "Instructor",
                        }
                    )
            self._rows = rows
            return

        if "FROM classroom_invitations ci JOIN classrooms c ON c.classroom_id = ci.classroom_id WHERE ci.invitation_id = %s AND ci.student_id = %s" in q:
            inv_id, sid = int(params[0]), int(params[1])
            inv = self.store.invitations.get(inv_id)
            if inv and inv["student_id"] == sid:
                cls = self.store.classrooms.get(inv["classroom_id"])
                self._rows = [
                    {
                        "invitation_id": inv["invitation_id"],
                        "classroom_id": inv["classroom_id"],
                        "status": inv["status"],
                        "student_capacity": cls["student_capacity"] if cls else None,
                        "is_archived": cls["is_archived"] if cls else True,
                    }
                ]
            return

        if q.startswith("UPDATE classroom_invitations SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE invitation_id = %s"):
            inv_id = int(params[0])
            self.store.invitations[inv_id]["status"] = "accepted"
            self.store.invitations[inv_id]["responded_at"] = datetime.now(timezone.utc)
            return

        if q.startswith("UPDATE classroom_invitations SET status = 'declined', responded_at = CURRENT_TIMESTAMP WHERE invitation_id = %s"):
            inv_id = int(params[0])
            self.store.invitations[inv_id]["status"] = "declined"
            self.store.invitations[inv_id]["responded_at"] = datetime.now(timezone.utc)
            return

        raise AssertionError(f"Unhandled SQL query in FakeCursor: {q}")

    def fetchall(self):
        return [dict(r) for r in self._rows]

    def fetchone(self):
        return dict(self._rows[0]) if self._rows else None


class _FakeConn:
    def __init__(self, store: FakeStore):
        self.store = store
        self._snap = store.snapshot()

    def cursor(self, **kwargs):
        return _FakeCursor(self.store)

    def commit(self):
        self._snap = self.store.snapshot()

    def rollback(self):
        self.store.restore(self._snap)

    def close(self):
        pass


class InstructorDashboardTestCase(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.active_user: dict | None = {
            "id": 10,
            "role": "instructor",
            "email": "prof.ada@lnu.edu.ph",
            "displayName": "Prof. Ada Lovelace",
        }
        self.router = create_instructor_dashboard_router(
            get_db_connection_fn=self._get_conn,
            run_select_fn=self._run_select,
            run_select_one_fn=self._run_select_one,
            run_write_fn=self._run_write,
            require_instructor_fn=self._require_instructor,
            require_student_fn=self._require_student,
            ensure_tables_fn=lambda: ensure_instructor_dashboard_tables(run_write_fn=self._run_write),
        )
        self.handlers = {}
        for route in self.router.routes:
            for method in route.methods:
                self.handlers[(method, route.path)] = route.endpoint

    def _get_conn(self):
        return _FakeConn(self.store)

    def _run_select(self, query, params=None):
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                return cur.fetchall()
        finally:
            conn.close()

    def _run_select_one(self, query, params=None):
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                return cur.fetchone()
        finally:
            conn.close()

    def _run_write(self, query, params=None):
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                row = cur.fetchone()
            conn.commit()
            return row
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _require_instructor(self, request):
        if not self.active_user:
            raise HTTPException(status_code=401, detail={"error": "Login required"})
        if self.active_user.get("role") != "instructor":
            raise HTTPException(status_code=403, detail={"error": "Instructor access required"})
        return self.active_user

    def _require_student(self, request):
        if not self.active_user:
            raise HTTPException(status_code=401, detail={"error": "Login required"})
        if self.active_user.get("role") != "student":
            raise HTTPException(status_code=403, detail={"error": "Student access required"})
        return self.active_user

    def _call(self, method: str, path: str, body=None, **path_params):
        fn = self.handlers[(method, path)]
        req = _DummyRequest(method=method, path=path, body=body)
        return asyncio.run(fn(request=req, **path_params))

    def _as_instructor(self, instructor_id: int = 10):
        row = self.store.admin_users[instructor_id]
        self.active_user = {
            "id": instructor_id,
            "role": "instructor",
            "email": row["username"],
            "displayName": row["display_name"],
        }

    def _as_student(self, student_id: int = 101):
        row = self.store.student_users[student_id]
        self.active_user = {
            "id": student_id,
            "role": "student",
            "studentId": row["school_id"],
            "email": row["email"],
            "displayName": row["display_name"],
        }

    def test_ddl_statements_match_5_tables_and_11_indexes(self):
        ensure_instructor_dashboard_tables(run_write_fn=self._run_write)
        self.assertEqual(len(INSTRUCTOR_DASHBOARD_DDL_STATEMENTS), 16)
        joined = "\n".join(self.store.ddl_executed)
        for table_name in (
            "classrooms",
            "classroom_enrollments",
            "classroom_invitations",
            "classroom_activities",
            "activity_submissions",
        ):
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {table_name}", joined)
        for index_name in (
            "idx_classrooms_instructor_id",
            "idx_classrooms_join_code_upper",
            "idx_classroom_enrollments_student_id",
            "idx_classroom_invitations_student_status",
            "idx_classroom_invitations_invited_by",
            "idx_classroom_invitations_pending_unique",
            "idx_classroom_activities_classroom_scheduled",
            "idx_classroom_activities_scenario_id",
            "idx_activity_submissions_student_id",
            "idx_activity_submissions_build_id",
            "idx_activity_submissions_graded_by",
        ):
            self.assertIn(index_name, joined)

    def test_auth_and_role_guards(self):
        self.active_user = None
        with self.assertRaises(HTTPException) as ctx:
            self._call("GET", "/api/instructor/dashboard")
        self.assertEqual(ctx.exception.status_code, 401)

        self._as_student(101)
        with self.assertRaises(HTTPException) as ctx2:
            self._call("GET", "/api/instructor/dashboard")
        self.assertEqual(ctx2.exception.status_code, 403)

        self._as_instructor(10)
        with self.assertRaises(HTTPException) as ctx3:
            self._call("GET", "/api/student/invitations")
        self.assertEqual(ctx3.exception.status_code, 403)

    def test_classroom_creation_join_code_and_capacity_validation(self):
        res = self._call("POST", "/api/instructor/classrooms", {"name": "CS 101", "capacity": 2})
        self.assertTrue(res["ok"])
        cls = res["classroom"]
        self.assertRegex(cls["joinCode"], r"^APC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$")
        self.assertEqual(cls["capacity"], 2)
        self.assertEqual(cls["totalStudents"], 0)
        self.assertEqual(cls["invitations"], [])

        # Duplicate case-insensitive join code -> 409
        with self.assertRaises(HTTPException) as dup_ctx:
            self._call(
                "POST",
                "/api/instructor/classrooms",
                {"name": "CS 102", "joinCode": cls["joinCode"].lower()},
            )
        self.assertEqual(dup_ctx.exception.status_code, 409)

        # Invalid capacities -> 400
        for bad_cap in (0, -5, 501, 12.5, True, "abc"):
            with self.assertRaises(HTTPException) as cap_ctx:
                self._call("POST", "/api/instructor/classrooms", {"name": "Bad Cap", "capacity": bad_cap})
            self.assertEqual(cap_ctx.exception.status_code, 400)

    def test_invitations_enrollment_cancel_and_student_respond(self):
        cls = self._call("POST", "/api/instructor/classrooms", {"name": "Networks", "capacity": 1})["classroom"]
        cid = int(cls["id"])

        # Inactive student -> 404
        with self.assertRaises(HTTPException) as inact_ctx:
            self._call(
                "POST",
                "/api/instructor/classrooms/{classroom_id}/invitations",
                {"identifier": "2024-9999"},
                classroom_id=cid,
            )
        self.assertEqual(inact_ctx.exception.status_code, 404)

        # Invite active student by email (case-insensitive)
        inv_res = self._call(
            "POST",
            "/api/instructor/classrooms/{classroom_id}/invitations",
            {"identifier": "ALEX@STUDENT.LNU.EDU.PH"},
            classroom_id=cid,
        )
        self.assertTrue(inv_res["ok"])
        self.assertEqual(len(inv_res["invitations"]), 1)
        inv_id = int(inv_res["invitation"]["id"])

        # Duplicate pending invite -> 409
        with self.assertRaises(HTTPException) as dup_inv:
            self._call(
                "POST",
                "/api/instructor/classrooms/{classroom_id}/invitations",
                {"identifier": "2024-0001"},
                classroom_id=cid,
            )
        self.assertEqual(dup_inv.exception.status_code, 409)

        # Cross-instructor isolation -> 404
        self._as_instructor(11)
        with self.assertRaises(HTTPException) as iso_ctx:
            self._call(
                "DELETE",
                "/api/instructor/classrooms/{classroom_id}/invitations/{invitation_id}",
                classroom_id=cid,
                invitation_id=inv_id,
            )
        self.assertEqual(iso_ctx.exception.status_code, 404)

        # Cancel and re-invite
        self._as_instructor(10)
        cancel_res = self._call(
            "DELETE",
            "/api/instructor/classrooms/{classroom_id}/invitations/{invitation_id}",
            classroom_id=cid,
            invitation_id=inv_id,
        )
        self.assertEqual(cancel_res, {"ok": True, "invitations": []})

        inv_res2 = self._call(
            "POST",
            "/api/instructor/classrooms/{classroom_id}/invitations",
            {"identifier": "2024-0001"},
            classroom_id=cid,
        )
        inv_id2 = int(inv_res2["invitation"]["id"])

        # Student sees invitation & declines
        self._as_student(101)
        st_invs = self._call("GET", "/api/student/invitations")["invitations"]
        self.assertEqual(len(st_invs), 1)
        self.assertEqual(st_invs[0]["instructorName"], "Prof. Ada Lovelace")

        dec = self._call(
            "POST",
            "/api/student/invitations/{invitation_id}/respond",
            {"action": "decline"},
            invitation_id=inv_id2,
        )
        self.assertEqual(dec, {"ok": True, "status": "declined"})

        # Responding twice -> 409
        with self.assertRaises(HTTPException) as resp_again:
            self._call(
                "POST",
                "/api/student/invitations/{invitation_id}/respond",
                {"action": "accept"},
                invitation_id=inv_id2,
            )
        self.assertEqual(resp_again.exception.status_code, 409)

        # Student joins via join code (which accepts any pending invite)
        self._as_instructor(10)
        inv_id3 = int(
            self._call(
                "POST",
                "/api/instructor/classrooms/{classroom_id}/invitations",
                {"identifier": "2024-0001"},
                classroom_id=cid,
            )["invitation"]["id"]
        )
        self._as_student(101)
        joined = self._call("POST", "/api/student/classrooms/join", {"joinCode": cls["joinCode"].lower()})
        self.assertTrue(joined["ok"])
        self.assertEqual(joined["classroom"]["id"], str(cid))
        self.assertEqual(self.store.invitations[inv_id3]["status"], "accepted")

        enrolled_list = self._call("GET", "/api/student/classrooms")
        self.assertTrue(enrolled_list["ok"])
        self.assertEqual(len(enrolled_list["classrooms"]), 1)
        self.assertEqual(enrolled_list["classrooms"][0]["id"], str(cid))
        self.assertEqual(enrolled_list["classrooms"][0]["instructorName"], "Prof. Ada Lovelace")

        # Duplicate join -> 409
        with self.assertRaises(HTTPException) as dup_join:
            self._call("POST", "/api/student/classrooms/join", {"joinCode": cls["joinCode"]})
        self.assertEqual(dup_join.exception.status_code, 409)

        # Capacity reached for second student -> 400
        self._as_student(102)
        with self.assertRaises(HTTPException) as full_join:
            self._call("POST", "/api/student/classrooms/join", {"joinCode": cls["joinCode"]})
        self.assertEqual(full_join.exception.status_code, 400)

        # Invalid join code -> 404
        with self.assertRaises(HTTPException) as bad_code:
            self._call("POST", "/api/student/classrooms/join", {"joinCode": "NOPE-9999"})
        self.assertEqual(bad_code.exception.status_code, 404)

        # Open classroom under capacity: student 102 accepts pending invitation
        self._as_instructor(10)
        cls_open = self._call("POST", "/api/instructor/classrooms", {"name": "Open Lab", "capacity": 5})["classroom"]
        open_inv = self._call(
            "POST",
            "/api/instructor/classrooms/{classroom_id}/invitations",
            {"identifier": "2024-0002"},
            classroom_id=int(cls_open["id"]),
        )["invitation"]
        self._as_student(102)
        with self.assertRaises(HTTPException) as bad_act:
            self._call(
                "POST",
                "/api/student/invitations/{invitation_id}/respond",
                {"action": "maybe"},
                invitation_id=int(open_inv["id"]),
            )
        self.assertEqual(bad_act.exception.status_code, 400)
        acc = self._call(
            "POST",
            "/api/student/invitations/{invitation_id}/respond",
            {"action": "accept"},
            invitation_id=int(open_inv["id"]),
        )
        self.assertEqual(acc, {"ok": True, "status": "accepted"})
        self._as_instructor(10)
        dash_after_acc = self._call("GET", "/api/instructor/dashboard")
        open_class_row = next(c for c in dash_after_acc["classes"] if c["id"] == cls_open["id"])
        self.assertEqual(open_class_row["totalStudents"], 1)
        self.assertEqual(open_class_row["students"][0]["schoolId"], "2024-0002")
        self.assertEqual(open_class_row["invitations"], [])

    def test_schedules_lock_scores_move_class_and_remove_student_transaction(self):
        c1 = self._call("POST", "/api/instructor/classrooms", {"name": "Class A"})["classroom"]
        c2 = self._call("POST", "/api/instructor/classrooms", {"name": "Class B"})["classroom"]
        c1_id, c2_id = int(c1["id"]), int(c2["id"])

        # Enroll student 101 in both classrooms
        self._as_student(101)
        self._call("POST", "/api/student/classrooms/join", {"joinCode": c1["joinCode"]})
        self._call("POST", "/api/student/classrooms/join", {"joinCode": c2["joinCode"]})
        self._as_instructor(10)

        # Invalid due_at <= scheduled_at -> 400
        with self.assertRaises(HTTPException) as bad_dates:
            self._call(
                "POST",
                "/api/instructor/schedules",
                {
                    "classId": str(c1_id),
                    "activityName": "Bad Timing",
                    "dateValue": "2026-11-20",
                    "timeValue": "10:00",
                    "dueDateValue": "2026-11-20",
                    "dueTimeValue": "10:00",
                },
            )
        self.assertEqual(bad_dates.exception.status_code, 400)

        # Create two schedules (out of chronological order to test dashboard sorting)
        s_later = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": str(c2_id),
                "activityName": "Lab 2",
                "dateValue": "2026-11-25",
                "timeValue": "09:00",
                "dueDateValue": "2026-11-26",
                "dueTimeValue": "18:00",
                "isLocked": False,
                "manualOverride": True,
            },
        )["schedule"]
        s_earlier = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": str(c1_id),
                "activityName": "Lab 1",
                "dateValue": "2026-11-21",
                "timeValue": "08:30",
                "dueDateValue": "2026-11-22",
                "dueTimeValue": "23:59",
                "isLocked": True,
                "manualOverride": True,
                "scenarioId": 5,
            },
        )["schedule"]
        self.assertEqual(s_earlier["dateValue"], "2026-11-21")
        self.assertEqual(s_earlier["timeValue"], "08:30")
        self.assertEqual(s_earlier["dueDateValue"], "2026-11-22")
        self.assertEqual(s_earlier["dueTimeValue"], "23:59")

        # Locked activity rejects score -> 409 with exact error text
        with self.assertRaises(HTTPException) as locked_ctx:
            self._call(
                "PUT",
                "/api/instructor/schedules/{activity_id}/scores/{student_id}",
                {"score": 90},
                activity_id=int(s_earlier["id"]),
                student_id=101,
            )
        self.assertEqual(locked_ctx.exception.status_code, 409)
        self.assertEqual(
            locked_ctx.exception.detail,
            {"error": "Scores cannot be edited while the activity is locked"},
        )

        # Non-enrolled student -> 400
        with self.assertRaises(HTTPException) as not_enrolled_ctx:
            self._call(
                "PUT",
                "/api/instructor/schedules/{activity_id}/scores/{student_id}",
                {"score": 90},
                activity_id=int(s_earlier["id"]),
                student_id=102,
            )
        self.assertEqual(not_enrolled_ctx.exception.status_code, 400)

        # Unlock via PATCH -> manualOverride=True
        lock_res = self._call(
            "PATCH",
            "/api/instructor/schedules/{activity_id}/lock",
            {"isLocked": False},
            activity_id=int(s_earlier["id"]),
        )
        self.assertEqual(lock_res, {"ok": True, "isLocked": False, "manualOverride": True})

        # Grade both activities (first reject invalid scores)
        for bad_score in (-1, 101, 88.5, True, "abc"):
            with self.assertRaises(HTTPException) as bad_sc_ctx:
                self._call(
                    "PUT",
                    "/api/instructor/schedules/{activity_id}/scores/{student_id}",
                    {"score": bad_score},
                    activity_id=int(s_earlier["id"]),
                    student_id=101,
                )
            self.assertEqual(bad_sc_ctx.exception.status_code, 400)

        self._call(
            "PUT",
            "/api/instructor/schedules/{activity_id}/scores/{student_id}",
            {"score": 92},
            activity_id=int(s_earlier["id"]),
            student_id=101,
        )
        self._call(
            "PUT",
            "/api/instructor/schedules/{activity_id}/scores/{student_id}",
            {"score": 88},
            activity_id=int(s_later["id"]),
            student_id=101,
        )

        # Dashboard returns sorted schedules + scores
        dash = self._call("GET", "/api/instructor/dashboard")
        self.assertTrue(dash["ok"])
        self.assertEqual([s["activityName"] for s in dash["schedules"]], ["Lab 1", "Lab 2"])
        self.assertEqual(dash["schedules"][0]["scores"], {"101": 92})

        # Clear score with None
        cleared = self._call(
            "PUT",
            "/api/instructor/schedules/{activity_id}/scores/{student_id}",
            {"score": None},
            activity_id=int(s_earlier["id"]),
            student_id=101,
        )
        self.assertEqual(cleared, {"ok": True, "score": None})

        # Re-grade and test transaction rollback on remove student
        self._call(
            "PUT",
            "/api/instructor/schedules/{activity_id}/scores/{student_id}",
            {"score": 95},
            activity_id=int(s_earlier["id"]),
            student_id=101,
        )
        self.store.fail_on_submission_delete = True
        with self.assertRaises(RuntimeError):
            self._call(
                "DELETE",
                "/api/instructor/classrooms/{classroom_id}/students/{student_id}",
                classroom_id=c1_id,
                student_id=101,
            )
        self.store.fail_on_submission_delete = False
        # Enrollment in Class A must still exist due to rollback
        self.assertTrue(
            any(e["classroom_id"] == c1_id and e["student_id"] == 101 for e in self.store.enrollments.values())
        )

        # Now succeed removing student 101 from Class A -> removes Class A enrollment & Class A submission, keeps Class B
        rem = self._call(
            "DELETE",
            "/api/instructor/classrooms/{classroom_id}/students/{student_id}",
            classroom_id=c1_id,
            student_id=101,
        )
        self.assertEqual(rem, {"ok": True, "students": [], "totalStudents": 0})
        self.assertFalse(any(s["activity_id"] == int(s_earlier["id"]) for s in self.store.submissions.values()))
        self.assertTrue(any(s["activity_id"] == int(s_later["id"]) for s in self.store.submissions.values()))

        # Moving s_later from Class B to Class A wipes s_later's old submissions in same transaction
        moved = self._call(
            "PUT",
            "/api/instructor/schedules/{activity_id}",
            {
                "classId": str(c1_id),
                "activityName": "Lab 2 Moved",
                "dateValue": "2026-11-25",
                "timeValue": "09:00",
                "dueDateValue": "2026-11-26",
                "dueTimeValue": "18:00",
            },
            activity_id=int(s_later["id"]),
        )["schedule"]
        self.assertEqual(moved["classId"], str(c1_id))
        self.assertEqual(moved["scores"], {})
        self.assertFalse(any(s["activity_id"] == int(s_later["id"]) for s in self.store.submissions.values()))

        # Profile update
        prof = self._call("PATCH", "/api/instructor/profile", {"name": "Prof. Ada L."})
        self.assertEqual(prof, {"ok": True, "instructorName": "Prof. Ada L."})

        # Delete schedule
        deleted = self._call(
            "DELETE",
            "/api/instructor/schedules/{activity_id}",
            activity_id=int(s_later["id"]),
        )
        self.assertEqual(deleted, {"ok": True})

    def test_student_classroom_activities_detail_and_submission_flow(self):
        # Create classroom and enroll student 101 (leave student 102 unenrolled)
        cls = self._call("POST", "/api/instructor/classrooms", {"name": "Hardware Lab 101"})["classroom"]
        cid = int(cls["id"])
        self._as_student(101)
        self._call("POST", "/api/student/classrooms/join", {"joinCode": cls["joinCode"]})

        # Create Fault Lab 1, Fault Lab 2 (locked), and standard Build activity
        self._as_instructor(10)
        act_fault1 = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": str(cid),
                "activityName": "Fault Lab 1: No-POST & Inverted Airflow Rig",
                "dateValue": "2026-11-21",
                "timeValue": "09:00",
                "dueDateValue": "2026-11-22",
                "dueTimeValue": "23:59",
                "isLocked": False,
            },
        )["schedule"]
        act_fault2_locked = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": str(cid),
                "activityName": "Fault Lab 2: Memory Conflict & Unplugged Rails",
                "dateValue": "2026-11-23",
                "timeValue": "10:00",
                "dueDateValue": "2026-11-24",
                "dueTimeValue": "18:00",
                "isLocked": True,
            },
        )["schedule"]
        act_build = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": str(cid),
                "activityName": "AM5 DDR5 Workstation Build",
                "dateValue": "2026-11-25",
                "timeValue": "08:00",
                "dueDateValue": "2026-11-26",
                "dueTimeValue": "17:00",
                "isLocked": False,
            },
        )["schedule"]

        # GET /api/student/classrooms includes activities array with faultLabId, isLocked, isSubmitted, score
        self._as_student(101)
        cls_res = self._call("GET", "/api/student/classrooms")
        self.assertTrue(cls_res["ok"])
        self.assertEqual(len(cls_res["classrooms"]), 1)
        activities = cls_res["classrooms"][0]["activities"]
        self.assertEqual(len(activities), 3)
        self.assertEqual(activities[0]["faultLabId"], "fault_no_post_orientation")
        self.assertEqual(activities[0]["activityType"], "troubleshoot")
        self.assertFalse(activities[0]["isLocked"])
        self.assertFalse(activities[0]["isSubmitted"])
        self.assertIsNone(activities[0]["score"])
        self.assertEqual(activities[1]["faultLabId"], "fault_memory_power_mismatch")
        self.assertTrue(activities[1]["isLocked"])
        self.assertIsNone(activities[2]["faultLabId"])
        self.assertEqual(activities[2]["activityType"], "build")

        # GET /api/student/activities/{activity_id} returns details for enrolled student
        detail = self._call(
            "GET",
            "/api/student/activities/{activity_id}",
            activity_id=int(act_fault1["id"]),
        )
        self.assertTrue(detail["ok"])
        act_detail = detail["activity"]
        self.assertEqual(act_detail["id"], act_fault1["id"])
        self.assertEqual(act_detail["classId"], str(cid))
        self.assertEqual(act_detail["className"], "Hardware Lab 101")
        self.assertEqual(act_detail["instructorName"], "Prof. Ada Lovelace")
        self.assertEqual(act_detail["faultLabId"], "fault_no_post_orientation")
        self.assertEqual(act_detail["activityType"], "troubleshoot")
        self.assertFalse(act_detail["isSubmitted"])

        # GET /api/student/activities/{activity_id} returns 404 for unenrolled student
        self._as_student(102)
        with self.assertRaises(HTTPException) as unenroll_get_ctx:
            self._call(
                "GET",
                "/api/student/activities/{activity_id}",
                activity_id=int(act_fault1["id"]),
            )
        self.assertEqual(unenroll_get_ctx.exception.status_code, 404)

        # POST /api/student/activities/{activity_id}/submit returns 403 for unenrolled student
        with self.assertRaises(HTTPException) as unenroll_sub_ctx:
            self._call(
                "POST",
                "/api/student/activities/{activity_id}/submit",
                {"score": 88, "buildId": 12},
                activity_id=int(act_fault1["id"]),
            )
        self.assertEqual(unenroll_sub_ctx.exception.status_code, 403)

        # Student 101 validates payload, locked rejection, and successful submission
        self._as_student(101)
        for bad_payload in ({}, {"score": None}, {"score": ""}, {"score": -1}, {"score": 101}, {"score": 80, "buildId": -5}):
            with self.assertRaises(HTTPException) as bad_sub_ctx:
                self._call(
                    "POST",
                    "/api/student/activities/{activity_id}/submit",
                    bad_payload,
                    activity_id=int(act_fault1["id"]),
                )
            self.assertEqual(bad_sub_ctx.exception.status_code, 400)

        # Locked activity rejects submission with 409
        with self.assertRaises(HTTPException) as locked_sub_ctx:
            self._call(
                "POST",
                "/api/student/activities/{activity_id}/submit",
                {"score": 95, "buildId": 42},
                activity_id=int(act_fault2_locked["id"]),
            )
        self.assertEqual(locked_sub_ctx.exception.status_code, 409)

        # Valid submission saves score & buildId
        sub_res = self._call(
            "POST",
            "/api/student/activities/{activity_id}/submit",
            {"score": 94, "buildId": 77},
            activity_id=int(act_fault1["id"]),
        )
        self.assertTrue(sub_res["ok"])
        self.assertEqual(sub_res["submission"]["activityId"], act_fault1["id"])
        self.assertEqual(sub_res["submission"]["studentId"], "101")
        self.assertEqual(sub_res["submission"]["buildId"], 77)
        self.assertEqual(sub_res["submission"]["score"], 94)
        self.assertIsNotNone(sub_res["submission"]["submittedAt"])

        # Re-submitting without buildId preserves previous buildId and allows 0 boundary score
        resub_res = self._call(
            "POST",
            "/api/student/activities/{activity_id}/submit",
            {"score": 0},
            activity_id=int(act_fault1["id"]),
        )
        self.assertEqual(resub_res["submission"]["score"], 0)
        self.assertEqual(resub_res["submission"]["buildId"], 77)

        # Re-submit final score 96
        self._call(
            "POST",
            "/api/student/activities/{activity_id}/submit",
            {"score": 96, "buildId": 88},
            activity_id=int(act_fault1["id"]),
        )

        # Verify GET /api/student/classrooms reflects submission
        cls_after = self._call("GET", "/api/student/classrooms")["classrooms"][0]["activities"]
        self.assertTrue(cls_after[0]["isSubmitted"])
        self.assertEqual(cls_after[0]["score"], 96)
        self.assertEqual(cls_after[0]["buildId"], 88)
        self.assertIsNotNone(cls_after[0]["submittedAt"])

        # Verify instructor dashboard schedules[...]["scores"] shows student submission
        self._as_instructor(10)
        dash = self._call("GET", "/api/instructor/dashboard")
        fault1_sched = next(s for s in dash["schedules"] if s["id"] == act_fault1["id"])
        self.assertEqual(fault1_sched["scores"], {"101": 96})

    def test_student_activities_list_endpoint(self):
        # Reject unauthenticated and instructor callers
        self.active_user = None
        with self.assertRaises(HTTPException) as unauth_ctx:
            self._call("GET", "/api/student/activities")
        self.assertEqual(unauth_ctx.exception.status_code, 401)

        self._as_instructor(10)
        with self.assertRaises(HTTPException) as inst_ctx:
            self._call("GET", "/api/student/activities")
        self.assertEqual(inst_ctx.exception.status_code, 403)

        self.store.pc_scenarios[5].update(
            {
                "description": "Build an AM5 DDR5 workstation within thermal targets.",
                "tier": "Intermediate",
                "time_limit_minutes": 45,
                "activity_type": "build",
            }
        )

        # Enrolled classroom (instructor 10) and unenrolled classroom (instructor 11)
        cls_enrolled = self._call("POST", "/api/instructor/classrooms", {"name": "Hardware Lab 101"})["classroom"]
        self._as_instructor(11)
        cls_other = self._call("POST", "/api/instructor/classrooms", {"name": "Other Section"})["classroom"]

        self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": cls_other["id"],
                "activityName": "Hidden Unenrolled Activity",
                "dateValue": "2026-11-20",
                "timeValue": "08:00",
                "dueDateValue": "2026-11-21",
                "dueTimeValue": "17:00",
            },
        )

        self._as_instructor(10)
        act_open = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": cls_enrolled["id"],
                "activityName": "Fault Lab 1: No-POST & Inverted Airflow Rig",
                "dateValue": "2026-11-21",
                "timeValue": "09:00",
                "dueDateValue": "2026-11-22",
                "dueTimeValue": "23:59",
                "isLocked": False,
            },
        )["schedule"]
        act_locked = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": cls_enrolled["id"],
                "activityName": "Fault Lab 2: Memory Conflict & Unplugged Rails",
                "dateValue": "2026-11-22",
                "timeValue": "10:00",
                "dueDateValue": "2026-11-23",
                "dueTimeValue": "18:00",
                "isLocked": True,
            },
        )["schedule"]
        act_done = self._call(
            "POST",
            "/api/instructor/schedules",
            {
                "classId": cls_enrolled["id"],
                "activityName": "AM5 DDR5 Workstation Build",
                "scenarioId": 5,
                "dateValue": "2026-11-23",
                "timeValue": "08:00",
                "dueDateValue": "2026-11-24",
                "dueTimeValue": "17:00",
                "isLocked": False,
            },
        )["schedule"]

        self._as_student(101)
        self._call("POST", "/api/student/classrooms/join", {"joinCode": cls_enrolled["joinCode"]})
        self._call(
            "POST",
            "/api/student/activities/{activity_id}/submit",
            {"score": 92, "buildId": 44},
            activity_id=int(act_done["id"]),
        )

        res = self._call("GET", "/api/student/activities")
        self.assertTrue(res["ok"])
        activities = res["activities"]
        self.assertEqual([a["id"] for a in activities], [act_open["id"], act_locked["id"], act_done["id"]])

        first, second, third = activities
        self.assertEqual(first["title"], "Fault Lab 1: No-POST & Inverted Airflow Rig")
        self.assertEqual(first["activityName"], "Fault Lab 1: No-POST & Inverted Airflow Rig")
        self.assertEqual(first["className"], "Hardware Lab 101")
        self.assertEqual(first["instructorName"], "Prof. Ada Lovelace")
        self.assertEqual(first["faultLabId"], "fault_no_post_orientation")
        self.assertEqual(first["activityType"], "troubleshoot")
        self.assertEqual(first["description"], "")
        self.assertEqual(first["tier"], "")
        self.assertIsNone(first["timeLimitMinutes"])
        self.assertEqual(first["status"], "notStarted")
        self.assertIsNone(first["score"])
        self.assertIsNone(first["completion"])

        self.assertEqual(second["faultLabId"], "fault_memory_power_mismatch")
        self.assertEqual(second["status"], "locked")
        self.assertTrue(second["isLocked"])
        self.assertIsNone(second["completion"])

        self.assertEqual(third["scenarioId"], 5)
        self.assertIsNone(third["faultLabId"])
        self.assertEqual(third["activityType"], "build")
        self.assertEqual(third["description"], "Build an AM5 DDR5 workstation within thermal targets.")
        self.assertEqual(third["tier"], "Intermediate")
        self.assertEqual(third["timeLimitMinutes"], 45)
        self.assertEqual(third["status"], "completed")
        self.assertEqual(third["score"], 92)
        self.assertEqual(third["buildId"], 44)
        self.assertIsNotNone(third["submittedAt"])
        self.assertEqual(third["completion"], {"score": 92, "completedAt": third["submittedAt"]})

        # Submitted activity stays status='completed' even if instructor locks it afterward
        self._as_instructor(10)
        self._call(
            "PATCH",
            "/api/instructor/schedules/{activity_id}/lock",
            {"isLocked": True},
            activity_id=int(act_done["id"]),
        )
        self._as_student(101)
        res_after_lock = self._call("GET", "/api/student/activities")
        self.assertTrue(res_after_lock["activities"][2]["isLocked"])
        self.assertEqual(res_after_lock["activities"][2]["status"], "completed")


class AppAndMiddlewareIntegrationTestCase(unittest.TestCase):
    def test_mjs_and_js_mimetypes_registered_on_app_import(self):
        self.assertIn(mimetypes.guess_type("SimulatorApp.mjs")[0], {"application/javascript", "text/javascript"})
        self.assertIn(mimetypes.guess_type("main.js")[0], {"application/javascript", "text/javascript"})

    def test_cors_allows_patch_and_middleware_paths(self):
        cors_mw = next(
            (m for m in backend_app.app.user_middleware if m.cls is CORSMiddleware),
            None,
        )
        self.assertIsNotNone(cors_mw)
        allow_methods = (getattr(cors_mw, "kwargs", None) or getattr(cors_mw, "options", {})).get("allow_methods", [])
        self.assertIn("PATCH", allow_methods)

        self.assertIn("/api/instructor", core_middleware.AuditLoggingMiddleware.AUDIT_PATHS)
        self.assertIn("/api/student/classrooms", core_middleware.AuditLoggingMiddleware.AUDIT_PATHS)
        self.assertIn("/api/student/invitations", core_middleware.AuditLoggingMiddleware.AUDIT_PATHS)
        self.assertIn("/api/student/activities", core_middleware.AuditLoggingMiddleware.AUDIT_PATHS)

        sec_mw = core_middleware.SecurityHeadersMiddleware(app=lambda s, r, se: None)

        async def _call_next(_req):
            return Response(content="ok", status_code=200)

        for protected_path in ("/instructor", "/student", "/student/dashboard"):
            resp = asyncio.run(sec_mw.dispatch(_DummyRequest(path=protected_path), _call_next))
            self.assertIn("no-store", resp.headers.get("Cache-Control", ""))

    def test_instructor_html_route_redirects_and_auth_injection(self):
        with patch.object(backend_app, "current_auth_user", return_value=None):
            res = asyncio.run(backend_app.instructor_dashboard_page(_DummyRequest(path="/instructor")))
        self.assertEqual(res.status_code, 303)
        self.assertEqual(res.headers.get("location"), "/?login_required=instructor")

        with patch.object(backend_app, "current_auth_user", return_value={"id": 1, "role": "student"}):
            res_stu = asyncio.run(backend_app.instructor_dashboard_page(_DummyRequest(path="/instructor")))
        self.assertEqual(res_stu.status_code, 303)
        self.assertEqual(res_stu.headers.get("location"), "/student/dashboard")

        instructor_user = {"id": 10, "role": "instructor", "email": "prof@lnu.edu.ph", "displayName": "Prof"}
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with patch.object(backend_app, "INSTRUCTOR_DIST_DIR", tmp_path):
                with patch.object(backend_app, "current_auth_user", return_value=instructor_user):
                    res_503 = asyncio.run(backend_app.instructor_dashboard_page(_DummyRequest(path="/instructor")))
                self.assertEqual(res_503.status_code, 503)

                (tmp_path / "index.html").write_text("<html><head><title>Test</title></head><body></body></html>", encoding="utf-8")
                with patch.object(backend_app, "current_auth_user", return_value=instructor_user):
                    res_200 = asyncio.run(backend_app.instructor_dashboard_page(_DummyRequest(path="/instructor")))
                self.assertEqual(res_200.status_code, 200)
                body_text = res_200.body.decode("utf-8") if isinstance(res_200.body, bytes) else str(res_200.body)
                self.assertIn("window.AUTH_USER =", body_text)
                self.assertIn("prof@lnu.edu.ph", body_text)

    def test_student_html_route_redirects_and_auth_injection(self):
        for route_path in ("/student", "/student/dashboard"):
            with patch.object(backend_app, "current_auth_user", return_value=None):
                res = asyncio.run(backend_app.student_dashboard_page(_DummyRequest(path=route_path)))
            self.assertEqual(res.status_code, 303)
            self.assertEqual(res.headers.get("location"), "/?login_required=student")

        with patch.object(backend_app, "current_auth_user", return_value={"id": 10, "role": "instructor"}):
            res_inst = asyncio.run(backend_app.student_dashboard_page(_DummyRequest(path="/student/dashboard")))
        self.assertEqual(res_inst.status_code, 303)
        self.assertEqual(res_inst.headers.get("location"), "/instructor")

        with patch.object(backend_app, "current_auth_user", return_value={"id": 1, "role": "admin"}):
            res_admin = asyncio.run(backend_app.student_dashboard_page(_DummyRequest(path="/student/dashboard")))
        self.assertEqual(res_admin.status_code, 303)
        self.assertEqual(res_admin.headers.get("location"), "/admin")

        student_user = {
            "id": 101,
            "role": "student",
            "studentId": "2024-0001",
            "email": "alex@student.lnu.edu.ph",
            "displayName": "Alex <Rivera>",
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with patch.object(backend_app, "STUDENT_DIST_DIR", tmp_path):
                with patch.object(backend_app, "current_auth_user", return_value=student_user):
                    res_503 = asyncio.run(backend_app.student_dashboard_page(_DummyRequest(path="/student/dashboard")))
                self.assertEqual(res_503.status_code, 503)
                body_503 = res_503.body.decode("utf-8") if isinstance(res_503.body, bytes) else str(res_503.body)
                self.assertIn("frontend/student-dashboard", body_503)

                (tmp_path / "index.html").write_text("<html><head><title>Student</title></head><body></body></html>", encoding="utf-8")
                with patch.object(backend_app, "current_auth_user", return_value=student_user):
                    res_200 = asyncio.run(backend_app.student_dashboard_page(_DummyRequest(path="/student/dashboard")))
                self.assertEqual(res_200.status_code, 200)
                body_text = res_200.body.decode("utf-8") if isinstance(res_200.body, bytes) else str(res_200.body)
                self.assertIn("window.AUTH_USER =", body_text)
                self.assertIn("alex@student.lnu.edu.ph", body_text)
                self.assertIn("\\u003cRivera>", body_text)
                self.assertNotIn("<Rivera>", body_text)

        sec_mw = core_middleware.SecurityHeadersMiddleware(app=lambda s, r, se: None)

        async def _call_next(_req):
            return Response(content="ok", status_code=200)

        resp_stu = asyncio.run(sec_mw.dispatch(_DummyRequest(path="/student/dashboard"), _call_next))
        self.assertIn("no-store", resp_stu.headers.get("Cache-Control", ""))
        self.assertIn("/api/student/activities", core_middleware.AuditLoggingMiddleware.AUDIT_PATHS)

    def test_auth_login_and_register_redirect_urls(self):
        fake_inst = {"admin_id": 10, "username": "prof@lnu.edu.ph", "display_name": "Prof", "role": "instructor"}
        with (
            patch.object(backend_app, "create_instructor_user", return_value=fake_inst),
            patch.object(backend_app, "mark_user_logged_in"),
            patch.object(backend_app, "set_app_session_cookie"),
        ):
            reg_req = _DummyRequest(method="POST", path="/api/auth/register", body={"role": "instructor", "rememberMe": True})
            reg_res = asyncio.run(backend_app.api_auth_register(reg_req))
        self.assertEqual(json.loads(reg_res.body.decode("utf-8"))["redirectUrl"], "/instructor")

        with (
            patch.object(backend_app, "check_account_lockout", return_value=False),
            patch.object(backend_app, "verify_admin_credentials", return_value=fake_inst),
            patch.object(backend_app, "mark_user_logged_in"),
            patch.object(backend_app, "set_app_session_cookie"),
        ):
            login_req = _DummyRequest(
                method="POST",
                path="/api/auth/login",
                body={"role": "instructor", "email": "prof@lnu.edu.ph", "password": "secret"},
            )
            login_res = asyncio.run(backend_app.api_auth_login(login_req))
        self.assertEqual(json.loads(login_res.body.decode("utf-8"))["redirectUrl"], "/instructor")

        fake_stu = {
            "student_id": 101,
            "school_id": "2024-0001",
            "email": "alex@student.lnu.edu.ph",
            "first_name": "Alex",
            "last_name": "Rivera",
            "display_name": "Alex Rivera",
        }
        with (
            patch.object(backend_app, "create_student_user", return_value=fake_stu),
            patch.object(backend_app, "mark_user_logged_in"),
            patch.object(backend_app, "set_app_session_cookie"),
        ):
            stu_reg_req = _DummyRequest(method="POST", path="/api/auth/register", body={"role": "student", "rememberMe": True})
            stu_reg_res = asyncio.run(backend_app.api_auth_register(stu_reg_req))
        self.assertEqual(json.loads(stu_reg_res.body.decode("utf-8"))["redirectUrl"], "/student/dashboard")

        with (
            patch.object(backend_app, "check_account_lockout", return_value=False),
            patch.object(backend_app, "verify_student_credentials", return_value=fake_stu),
            patch.object(backend_app, "mark_user_logged_in"),
            patch.object(backend_app, "set_app_session_cookie"),
        ):
            stu_login_req = _DummyRequest(
                method="POST",
                path="/api/auth/login",
                body={"role": "student", "studentId": "2024-0001", "password": "secret"},
            )
            stu_login_res = asyncio.run(backend_app.api_auth_login(stu_login_req))
        self.assertEqual(json.loads(stu_login_res.body.decode("utf-8"))["redirectUrl"], "/student/dashboard")

    def test_not_found_handler_preserves_detail_dict(self):
        detail_res = asyncio.run(
            backend_app.not_found_handler(
                _DummyRequest(path="/api/instructor/classrooms/99/invitations"),
                HTTPException(status_code=404, detail={"error": "Classroom not found"}),
            )
        )
        self.assertEqual(detail_res.status_code, 404)
        payload = json.loads(detail_res.body.decode("utf-8"))
        self.assertEqual(payload["detail"], {"error": "Classroom not found"})
        self.assertEqual(payload["error"], "Classroom not found")

        generic_res = asyncio.run(
            backend_app.not_found_handler(
                _DummyRequest(path="/api/nonexistent"),
                HTTPException(status_code=404, detail="Not Found"),
            )
        )
        self.assertEqual(generic_res.status_code, 404)
        self.assertEqual(json.loads(generic_res.body.decode("utf-8")), {"error": "Endpoint not found"})


if __name__ == "__main__":
    unittest.main()
