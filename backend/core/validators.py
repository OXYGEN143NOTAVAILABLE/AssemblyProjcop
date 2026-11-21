"""
core/validators.py
Input validation and sanitization for security.
"""

import re
from typing import Any
from fastapi import HTTPException


# Maximum input sizes (in characters)
MAX_USERNAME_LENGTH = 80
MAX_EMAIL_LENGTH = 180
MAX_NAME_LENGTH = 100
MAX_SCHOOL_ID_LENGTH = 80
MAX_TEXT_LENGTH = 2000
MAX_JSON_FIELD_LENGTH = 5000
MAX_PASSWORD_LENGTH = 256
MAX_TITLE_LENGTH = 180
MAX_DESCRIPTION_LENGTH = 5000

# Pattern constants
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
SCHOOL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9\-_]{3,}$")
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{3,}$")


def clean_text(value: Any, max_length: int | None = None) -> str:
    """Clean and normalize text input.
    
    - Strips whitespace
    - Converts to string
    - Validates length
    """
    text = str(value or "").strip()
    
    if max_length and len(text) > max_length:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Input exceeds maximum length of {max_length} characters"}
        )
    
    return text


def validate_email(email: str, allow_empty: bool = False) -> str:
    """Validate and normalize email address."""
    email = clean_text(email).lower()
    
    if not email:
        if allow_empty:
            return ""
        raise HTTPException(status_code=400, detail={"error": "Email is required"})
    
    if len(email) > MAX_EMAIL_LENGTH:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Email exceeds maximum length of {MAX_EMAIL_LENGTH} characters"}
        )
    
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail={"error": "Invalid email format"})
    
    return email


def validate_password(password: str, min_length: int = 8, max_length: int = MAX_PASSWORD_LENGTH) -> str:
    """Validate password length."""
    password = str(password or "")
    
    if len(password) < min_length:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Password must be at least {min_length} characters"}
        )
    
    if len(password) > max_length:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Password exceeds maximum length of {max_length} characters"}
        )
    
    return password


def validate_username(username: str) -> str:
    """Validate username/school ID."""
    username = clean_text(username, MAX_USERNAME_LENGTH)
    
    if not username:
        raise HTTPException(status_code=400, detail={"error": "Username is required"})
    
    if not SCHOOL_ID_PATTERN.match(username):
        raise HTTPException(
            status_code=400,
            detail={"error": "Username must be 3+ characters with letters, numbers, hyphens, or underscores"}
        )
    
    return username


def validate_name(name: str, field_name: str = "Name") -> str:
    """Validate a name field."""
    name = clean_text(name, MAX_NAME_LENGTH)
    
    if not name:
        raise HTTPException(status_code=400, detail={"error": f"{field_name} is required"})
    
    # Allow letters, spaces, hyphens, apostrophes
    if not re.match(r"^[a-zA-Z\s\-']{1,}$", name):
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} contains invalid characters"}
        )
    
    return name


def validate_title(title: str) -> str:
    """Validate a title field."""
    title = clean_text(title, MAX_TITLE_LENGTH)
    
    if not title:
        raise HTTPException(status_code=400, detail={"error": "Title is required"})
    
    return title


def validate_description(description: str, allow_empty: bool = True) -> str:
    """Validate a description field."""
    description = clean_text(description, MAX_DESCRIPTION_LENGTH)
    
    if not description and not allow_empty:
        raise HTTPException(status_code=400, detail={"error": "Description is required"})
    
    return description


def validate_integer(value: Any, field_name: str = "Value", min_val: int | None = None, 
                    max_val: int | None = None) -> int:
    """Validate and convert to integer."""
    try:
        num = int(value or 0)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be an integer"}
        )
    
    if min_val is not None and num < min_val:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be at least {min_val}"}
        )
    
    if max_val is not None and num > max_val:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be at most {max_val}"}
        )
    
    return num


def validate_float(value: Any, field_name: str = "Value", min_val: float | None = None,
                  max_val: float | None = None) -> float:
    """Validate and convert to float."""
    try:
        num = float(value or 0)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be a number"}
        )
    
    if min_val is not None and num < min_val:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be at least {min_val}"}
        )
    
    if max_val is not None and num > max_val:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be at most {max_val}"}
        )
    
    return num


def validate_list(value: Any, field_name: str = "List", max_items: int | None = None) -> list:
    """Validate list input."""
    if not isinstance(value, list):
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be a list"}
        )
    
    if max_items and len(value) > max_items:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} exceeds maximum of {max_items} items"}
        )
    
    return value


def validate_dict(value: Any, field_name: str = "Object") -> dict:
    """Validate dictionary/object input."""
    if not isinstance(value, dict):
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must be an object/dictionary"}
        )
    
    return value


def sanitize_json_string(value: str, max_length: int = MAX_JSON_FIELD_LENGTH) -> str:
    """Sanitize JSON field to prevent injection."""
    value = str(value or "").strip()
    
    if len(value) > max_length:
        raise HTTPException(
            status_code=400,
            detail={"error": f"JSON field exceeds maximum length of {max_length} characters"}
        )
    
    return value


def validate_boolean(value: Any) -> bool:
    """Validate and convert boolean."""
    if isinstance(value, bool):
        return value
    
    text = str(value or "").lower().strip()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off", ""}:
        return False
    
    raise HTTPException(status_code=400, detail={"error": "Invalid boolean value"})


def validate_array_length(value: list, min_items: int = 0, max_items: int = 100, 
                         field_name: str = "Array") -> list:
    """Validate array length constraints."""
    if len(value) < min_items:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} must have at least {min_items} items"}
        )
    
    if len(value) > max_items:
        raise HTTPException(
            status_code=400,
            detail={"error": f"{field_name} exceeds maximum of {max_items} items"}
        )
    
    return value


def escape_html(text: str) -> str:
    """Escape HTML special characters."""
    import html
    return html.escape(str(text or ""))


def escape_sql_like(text: str) -> str:
    """Escape SQL LIKE pattern characters."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
