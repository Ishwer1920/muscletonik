import { verifyAccessToken } from "../utils/jwt.js";
import { isAdminRole, roleHasPermission } from "../config/permissions.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies?.accessToken || bearer;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

// Any admin-panel role (staff/manager/admin/super_admin). Must run after requireAuth.
export function requireAdminPanel(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!isAdminRole(req.auth.role)) {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
}

// Gate a route on a specific permission (see config/permissions.js). The access
// token carries the role and any per-user permission overrides, so this needs
// no database hit. Usage: router.get("/x", requireAuth, requirePermission("orders"), handler)
export function requirePermission(permission) {
  return function (req, res, next) {
    if (!req.auth) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roleHasPermission(req.auth.role, permission, req.auth.perms || [])) {
      return res.status(403).json({ message: `You do not have permission: ${permission}` });
    }
    next();
  };
}

// Back-compat alias. Historically "admin only" — now means "any admin-panel role".
// Prefer requirePermission for new routes.
export const requireAdmin = requireAdminPanel;
