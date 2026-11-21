"""
core/security.py
Enhanced security functions with bcrypt hashing, CSRF protection, and audit logging.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Any

import bcrypt
from fastapi import HTTPException, Request

# Configure audit logger
logging.basicConfig(level=logging.INFO)
audit_logger = logging.getLogger("security_audit")

# Security configuration
ADMIN_COOKIE_NAME = "assemblypc_admin_session"
APP_COOKIE_NAME = "assemblypc_user_session"
CSRF_COOKIE_NAME = "assemblypc_csrf_token"
APP_SESSION_SECONDS = 60 * 60 * 24 * 7  # 7 days
ADMIN_SESSION_SECONDS = 60 * 60 * 4    # 4 hours (shorter for admin)
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "assemblypc-dev-secret-change-me-in-production")

# Account lockout configuration
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
LOGIN_ATTEMPT_WINDOW_MINUTES = 15

# Track failed login attempts: username -> [(timestamp, count)]
FAILED_LOGIN_ATTEMPTS: dict[str, list[int]] = {}
REVOKED_ADMIN_SESSIONS: dict[str, int] = {}

# Warn if using default secret
if ADMIN_SECRET == "assemblypc-dev-secret-change-me-in-production":
    audit_logger.warning("WARNING: Using default ADMIN_SECRET. Change ADMIN_SECRET in .env for production!")


def secure_random_token(length: int = 32) -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(length)


def password_hash_bcrypt(password: str) -> tuple[str, str]:
    """Hash password using bcrypt (more secure than SHA256).
    
    Returns: (salt, hash)
    """
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    return salt.decode("utf-8"), hashed.decode("utf-8")


def verify_password_bcrypt(password: str, salt_and_hash: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        password_bytes = password.encode("utf-8")
        stored_hash = salt_and_hash.encode("utf-8")
        return bcrypt.checkpw(password_bytes, stored_hash)
    except Exception:
        return False


def check_account_lockout(identifier: str, lockout_window: int = LOGIN_ATTEMPT_WINDOW_MINUTES) -> bool:
    """Check if account is locked due to too many failed attempts.
    
    Returns: True if locked, False if OK to attempt login
    """
    now = int(time.time())
    window_start = now - (lockout_window * 60)
    
    # Clean old attempts
    if identifier in FAILED_LOGIN_ATTEMPTS:
        FAILED_LOGIN_ATTEMPTS[identifier] = [
            ts for ts in FAILED_LOGIN_ATTEMPTS[identifier]
            if ts > window_start
        ]
    
    attempts = FAILED_LOGIN_ATTEMPTS.get(identifier, [])
    
    # If account is locked, check if lockout period expired
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        oldest_attempt = min(attempts)
        lockout_expiry = oldest_attempt + (LOCKOUT_DURATION_MINUTES * 60)
        if now < lockout_expiry:
            return True  # Still locked
        else:
            FAILED_LOGIN_ATTEMPTS.pop(identifier, None)
            return False  # Lockout expired
    
    return False  # Not locked


def record_login_attempt(identifier: str, success: bool) -> None:
    """Record login attempt for account lockout protection."""
    now = int(time.time())
    
    if success:
        # Clear failed attempts on successful login
        FAILED_LOGIN_ATTEMPTS.pop(identifier, None)
        audit_logger.info(f"Login successful: {identifier}")
    else:
        # Record failed attempt
        if identifier not in FAILED_LOGIN_ATTEMPTS:
            FAILED_LOGIN_ATTEMPTS[identifier] = []
        FAILED_LOGIN_ATTEMPTS[identifier].append(now)
        
        attempts = len(FAILED_LOGIN_ATTEMPTS[identifier])
        audit_logger.warning(f"Login failed for {identifier}: {attempts} attempt(s)")
        
        if attempts >= MAX_LOGIN_ATTEMPTS:
            audit_logger.warning(f"Account locked: {identifier} - too many failed attempts")


def sign_admin_session(username: str) -> str:
    """Create signed admin session token with expiration."""
    expires = int(time.time()) + ADMIN_SESSION_SECONDS
    nonce = secure_random_token(12)
    payload = f"{username}|{expires}|{nonce}"
    
    sig = hmac.new(
        ADMIN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload}|{sig}"


def sign_app_session(role: str, subject: str) -> str:
    """Create signed user session token with expiration."""
    expires = int(time.time()) + APP_SESSION_SECONDS
    nonce = secure_random_token(12)
    payload = f"{role}|{subject}|{expires}|{nonce}"
    
    sig = hmac.new(
        ADMIN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload}|{sig}"


def verify_admin_session(token: str | None) -> str | None:
    """Verify admin session token and return username if valid.
    
    Checks:
    - Token format and signature
    - Expiration
    - Not in revocation list
    - User still exists and is active (done by caller)
    """
    if not token:
        return None
    
    # Clean old revocations
    now = int(time.time())
    REVOKED_ADMIN_SESSIONS.update({
        t: exp for t, exp in REVOKED_ADMIN_SESSIONS.items()
        if exp >= now
    })
    
    if token in REVOKED_ADMIN_SESSIONS:
        return None
    
    parts = token.split("|")
    if len(parts) != 4:
        return None
    
    username, expires, nonce, sig = parts
    payload = f"{username}|{expires}|{nonce}"
    
    expected = hmac.new(
        ADMIN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(sig, expected):
        return None
    
    try:
        if int(expires or 0) < now:
            return None
    except ValueError:
        return None
    
    return username


def verify_app_session(token: str | None) -> tuple[str, str] | None:
    """Verify user session token and return (role, subject) if valid."""
    if not token:
        return None
    
    parts = token.split("|")
    if len(parts) != 5:
        return None
    
    role, subject, expires, nonce, sig = parts
    payload = f"{role}|{subject}|{expires}|{nonce}"
    
    expected = hmac.new(
        ADMIN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(sig, expected):
        return None
    
    try:
        if int(expires or 0) < int(time.time()):
            return None
    except ValueError:
        return None
    
    if role not in {"student", "instructor", "admin"}:
        return None
    
    return role, subject


def revoke_admin_session(token: str | None) -> None:
    """Revoke an admin session token."""
    if not token:
        return
    
    parts = token.split("|")
    if len(parts) != 4:
        return
    
    try:
        expires = int(parts[1] or 0)
    except ValueError:
        return
    
    REVOKED_ADMIN_SESSIONS[token] = expires
    audit_logger.info(f"Admin session revoked")


def set_secure_cookie(response, name: str, value: str, max_age: int | None = None, 
                      http_only: bool = True, same_site: str = "lax") -> None:
    """Set a secure HTTP cookie with best practices."""
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=http_only,
        samesite=same_site,
        secure=True,  # Require HTTPS in production
        # Note: secure=True should be set dynamically based on environment
        # For development, you may need to handle this differently
    )


def generate_csrf_token() -> str:
    """Generate a CSRF protection token."""
    return secure_random_token(32)


def verify_csrf_token(request_token: str | None, session_token: str | None) -> bool:
    """Verify CSRF token matches between request and session."""
    if not request_token or not session_token:
        return False
    return hmac.compare_digest(request_token, session_token)


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request, accounting for proxies."""
    # Check X-Forwarded-For header first (for proxied requests)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    
    # Fall back to direct client
    return request.client.host if request.client else "unknown"


def create_safe_error_response(
    status_code: int,
    user_message: str,
    error_code: str | None = None,
    details: dict[str, Any] | None = None,
    internal_log: str | None = None
) -> dict[str, Any]:
    """Create a safe error response that doesn't leak sensitive info.
    
    Args:
        status_code: HTTP status code
        user_message: Safe message for client
        error_code: Machine-readable error code
        details: Additional details (only shown if in development)
        internal_log: Message to log internally (not sent to client)
    """
    if internal_log:
        audit_logger.error(f"[{status_code}] {internal_log}")
    
    response = {
        "ok": False,
        "error": user_message,
    }
    
    if error_code:
        response["errorCode"] = error_code
    
    # Only include details in development mode
    if os.getenv("DEBUG", "false").lower() == "true" and details:
        response["details"] = details
    
    return response


def sanitize_html_attribute(value: str) -> str:
    """Sanitize value for use in HTML attributes."""
    import html
    return html.escape(str(value or ""), quote=True)


def is_safe_redirect_url(url: str, request: Request | None = None, allowed_paths: set[str] | None = None) -> bool:
    """Check if a redirect URL is safe (no open redirect).
    
    Args:
        url: URL to check
        request: FastAPI request object
        allowed_paths: Set of allowed local paths (if None, only same-origin)
    
    Returns:
        True if URL is safe to redirect to
    """
    import urllib.parse
    
    if not url:
        return False
    
    parsed = urllib.parse.urlparse(url)
    
    # Reject absolute URLs with different schemes/netloc (open redirect)
    if parsed.scheme or parsed.netloc:
        if request and parsed.netloc == request.url.hostname:
            return True
        return False
    
    # Allow local paths
    path = parsed.path or "/"
    
    # If allowed_paths specified, check membership
    if allowed_paths:
        return path in allowed_paths
    
    # By default, only allow root path
    return path == "/"
