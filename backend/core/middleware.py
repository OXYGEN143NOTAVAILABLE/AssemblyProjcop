"""
core/middleware.py
Security middleware: rate limiting, timeouts, size limits, security headers.
"""

import logging
import os
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

audit_logger = logging.getLogger("security_audit")

# Rate limiting configuration
MAX_REQUESTS_PER_IP_PER_MINUTE = 60
MAX_REQUESTS_PER_IP_PER_HOUR = 600
MAX_REQUESTS_LOGIN_PER_MINUTE = 5

# Track requests per IP
request_timestamps = defaultdict(list)
login_request_timestamps = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware to prevent abuse."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = self._get_client_ip(request)
        now = time.time()
        
        # Clean old timestamps
        request_timestamps[client_ip] = [
            ts for ts in request_timestamps[client_ip]
            if now - ts < 3600  # Keep 1 hour of history
        ]
        
        # Check if login/auth endpoint - stricter limits
        if request.url.path in {"/api/auth/login", "/api/auth/register", "/admin/login"}:
            login_request_timestamps[client_ip] = [
                ts for ts in login_request_timestamps[client_ip]
                if now - ts < 60  # 1 minute window
            ]
            
            if len(login_request_timestamps[client_ip]) >= MAX_REQUESTS_LOGIN_PER_MINUTE:
                audit_logger.warning(f"Rate limit exceeded for login: {client_ip}")
                return Response(
                    content='{"ok": false, "error": "Too many login attempts. Please try again later."}',
                    status_code=429,
                    media_type="application/json"
                )
            
            login_request_timestamps[client_ip].append(now)
        
        # Check general rate limits
        recent_requests = [ts for ts in request_timestamps[client_ip] if now - ts < 60]
        if len(recent_requests) >= MAX_REQUESTS_PER_IP_PER_MINUTE:
            audit_logger.warning(f"Rate limit exceeded (per minute): {client_ip}")
            return Response(
                content='{"ok": false, "error": "Rate limit exceeded. Too many requests."}',
                status_code=429,
                media_type="application/json"
            )
        
        request_timestamps[client_ip].append(now)
        
        response = await call_next(request)
        return response
    
    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP, accounting for proxies."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Enable XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Control referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions policy (formerly Feature-Policy)
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), "
            "camera=(), "
            "geolocation=(), "
            "gyroscope=(), "
            "magnetometer=(), "
            "microphone=(), "
            "payment=(), "
            "usb=()"
        )
        
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self'"
        )
        if os.getenv("ENVIRONMENT", "development").lower() == "production" or request.url.scheme == "https":
            csp += "; upgrade-insecure-requests"

        response.headers["Content-Security-Policy"] = csp
        
        # No cache for sensitive pages
        if request.url.path in {"/admin", "/simulator", "/profile"}:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validate request size and prevent abuse."""
    
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Check Content-Length header
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > self.MAX_CONTENT_LENGTH:
                    audit_logger.warning(
                        f"Request body too large from {self._get_client_ip(request)}: {size} bytes"
                    )
                    return Response(
                        content='{"ok": false, "error": "Request body too large"}',
                        status_code=413,
                        media_type="application/json"
                    )
            except ValueError:
                pass
        
        response = await call_next(request)
        return response
    
    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Log security-relevant requests."""
    
    AUDIT_PATHS = {
        "/admin/login", "/admin/logout", "/api/auth/login", "/api/auth/register",
        "/api/scenarios", "/api/auth/logout"
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Log audit paths
        if any(request.url.path.startswith(path) for path in self.AUDIT_PATHS):
            client_ip = self._get_client_ip(request)
            audit_logger.info(
                f"{request.method} {request.url.path} from {client_ip}"
            )
        
        response = await call_next(request)
        return response
    
    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP."""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
