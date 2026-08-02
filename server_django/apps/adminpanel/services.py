import re

from apps.core.rbac import ADMIN_PANEL_ROLES

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def validate_create_team_member(data):
    errors = []
    name = str(data.get("name", "")).strip()
    if not (2 <= len(name) <= 60):
        errors.append({"msg": "Name must be 2–60 characters.", "param": "name"})
    email = str(data.get("email", "")).strip()
    if not EMAIL_RE.match(email):
        errors.append({"msg": "Enter a valid email.", "param": "email"})
    password = str(data.get("password", ""))
    if len(password) < 8:
        errors.append({"msg": "Password must be at least 8 characters.", "param": "password"})
    role = data.get("role")
    if role not in ADMIN_PANEL_ROLES:
        errors.append({"msg": "Invalid role.", "param": "role"})
    return errors


def validate_update_team_member(data):
    errors = []
    role = data.get("role")
    if role is not None and role not in ADMIN_PANEL_ROLES:
        errors.append({"msg": "Invalid role.", "param": "role"})
    status = data.get("status")
    if status is not None and status not in ("active", "blocked"):
        errors.append({"msg": "Invalid status.", "param": "status"})
    permissions = data.get("permissions")
    if permissions is not None and not isinstance(permissions, list):
        errors.append({"msg": "Permissions must be a list.", "param": "permissions"})
    return errors
