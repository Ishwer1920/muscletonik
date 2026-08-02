from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from . import rbac


def _require_auth(request):
    auth = getattr(request, "user", None)
    if auth is None or not getattr(auth, "is_authenticated", False):
        raise NotAuthenticated("Authentication required")
    return auth


class RequireAuth:
    """Mirror of middleware/auth.middleware.js#requireAuth."""

    def has_permission(self, request, view):
        _require_auth(request)
        return True


class RequireAdminPanel:
    """Mirror of #requireAdminPanel — any admin-panel role."""

    def has_permission(self, request, view):
        auth = _require_auth(request)
        if not rbac.is_admin_role(auth.role):
            raise PermissionDenied("Admin access only")
        return True


def RequirePermission(permission):
    """Mirror of #requirePermission(name) — a factory, same as the Node
    higher-order middleware. Usage: permission_classes = [RequirePermission("orders")]"""

    class _RequirePermission:
        def has_permission(self, request, view):
            auth = _require_auth(request)
            if not rbac.role_has_permission(auth.role, permission, auth.perms):
                raise PermissionDenied(f"You do not have permission: {permission}")
            return True

    return _RequirePermission
