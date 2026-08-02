"""Direct port of server/src/config/permissions.js — zero DB hits, all checks
read role + per-user permission overrides straight from the JWT claims."""

PERMISSIONS = [
    "dashboard", "team", "products", "orders", "customers", "inventory",
    "coupons", "reviews", "analytics", "content", "tasks", "shipping",
    "settings", "payments", "audit_logs", "system",
]

ADMIN_PANEL_ROLES = ["staff", "manager", "admin", "super_admin"]
ALL_ROLES = ["customer"] + ADMIN_PANEL_ROLES

ROLE_PERMISSIONS = {
    "super_admin": "*",
    "admin": ["dashboard", "products", "orders", "customers", "inventory", "coupons", "analytics", "reviews", "content", "tasks"],
    "manager": ["dashboard", "orders", "customers", "inventory", "shipping", "tasks"],
    "staff": ["dashboard", "content", "reviews", "products"],
    "customer": [],
}


def role_has_permission(role, permission, overrides=None):
    overrides = overrides or []
    if role == "super_admin":
        return True
    if permission in overrides:
        return True
    grants = ROLE_PERMISSIONS.get(role, [])
    if grants == "*":
        return True
    return permission in grants


def permissions_for_role(role, overrides=None):
    overrides = overrides or []
    grants = ROLE_PERMISSIONS.get(role, [])
    if role == "super_admin" or grants == "*":
        return list(PERMISSIONS)
    valid_overrides = [p for p in overrides if p in PERMISSIONS]
    return sorted(set(grants) | set(valid_overrides), key=PERMISSIONS.index)


def is_admin_role(role):
    return role in ADMIN_PANEL_ROLES
