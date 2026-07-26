/* ===========================================================
   MUSCLE TONIK - Role-Based Access Control (RBAC)
   Single source of truth for roles and permissions. Every
   /api/admin route is gated against these via requirePermission.
   =========================================================== */

// Every distinct capability in the admin panel. Add here as new
// subsystems land; middleware and UI both read from this list.
export const PERMISSIONS = [
  "dashboard",
  "team",         // manage admins / managers / staff
  "products",
  "orders",
  "customers",
  "inventory",
  "coupons",
  "reviews",
  "analytics",
  "content",      // homepage / banners / pages
  "tasks",
  "shipping",
  "settings",     // website + payment + smtp + tax settings
  "payments",
  "audit_logs",
  "system"        // backups / logs / maintenance
];

// Roles that may access the admin panel at all (everything else is a customer).
export const ADMIN_PANEL_ROLES = ["staff", "manager", "admin", "super_admin"];

// The full role set stored on the user document.
export const ALL_ROLES = ["customer", ...ADMIN_PANEL_ROLES];

// Role -> permission grants. "*" means every permission (super admin).
export const ROLE_PERMISSIONS = {
  super_admin: "*",
  admin: [
    "dashboard", "products", "orders", "customers", "inventory",
    "coupons", "analytics", "reviews", "content", "tasks"
  ],
  manager: [
    "dashboard", "orders", "customers", "inventory", "shipping", "tasks"
  ],
  staff: [
    "dashboard", "content", "reviews", "products"
  ],
  customer: []
};

// True if the given role (optionally with per-user overrides) has a permission.
// Per-user `overrides` let a specific account be granted extra permissions
// without changing its role; super_admin always has everything.
export function roleHasPermission(role, permission, overrides = []) {
  if (role === "super_admin") return true;
  if (Array.isArray(overrides) && overrides.includes(permission)) return true;
  const grants = ROLE_PERMISSIONS[role];
  if (grants === "*") return true;
  return Array.isArray(grants) && grants.includes(permission);
}

// Resolve the effective permission list for a role (for sending to the UI so it
// can render only the nav the user is allowed to see).
export function permissionsForRole(role, overrides = []) {
  if (role === "super_admin" || ROLE_PERMISSIONS[role] === "*") return [...PERMISSIONS];
  const base = new Set(Array.isArray(ROLE_PERMISSIONS[role]) ? ROLE_PERMISSIONS[role] : []);
  for (const p of overrides || []) if (PERMISSIONS.includes(p)) base.add(p);
  return [...base];
}

export function isAdminRole(role) {
  return ADMIN_PANEL_ROLES.includes(role);
}
