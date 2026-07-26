import bcrypt from "bcryptjs";
import { body, param, validationResult } from "express-validator";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { User } from "../models/user.model.js";
import { Payment } from "../models/payment.model.js";
import { AuditLog } from "../models/audit-log.model.js";
import { ADMIN_PANEL_ROLES, PERMISSIONS, permissionsForRole } from "../config/permissions.js";

const LOW_STOCK_THRESHOLD = 5;

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function writeAudit(req, action, target, details = {}) {
  try {
    await AuditLog.create({
      actor: req.auth?.sub,
      actorEmail: req.auth?.email || "",
      actorRole: req.auth?.role || "",
      action,
      target,
      details,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || ""
    });
  } catch {
    /* auditing must never break the main action */
  }
}

// GET /api/admin/me — who the caller is + the permissions the UI should render.
export async function getAdminMe(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub).select("name email role permissions");
    if (!user) return res.status(404).json({ message: "Account not found" });
    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissionsForRole(user.role, user.permissions)
      },
      allPermissions: PERMISSIONS
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/stats — dashboard KPI widgets + 7-day revenue series.
export async function getDashboardStats(req, res, next) {
  try {
    const todayStart = startOfToday();

    const [
      todayOrders,
      todayPaidAgg,
      statusCounts,
      customerCount,
      newUsersToday,
      lowStock,
      outOfStock,
      recentOrders,
      bestSellers,
      revenueSeriesRaw,
      pendingCodValueAgg
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]),
      Order.aggregate([
        { $group: { _id: "$fulfillmentStatus", count: { $sum: 1 } } }
      ]),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "customer", createdAt: { $gte: todayStart } }),
      Product.countDocuments({ stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } }),
      Product.countDocuments({ stock: { $lte: 0 } }),
      Order.find().sort({ createdAt: -1 }).limit(6).populate("user", "name email").lean(),
      Order.aggregate([
        { $unwind: "$items" },
        { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
        { $sort: { quantity: -1 } },
        { $limit: 5 }
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: new Date(Date.now() - 6 * 864e5) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { paymentProvider: "cod", paymentStatus: "pending" } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ])
    ]);

    const statusMap = statusCounts.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});
    const pendingStatuses = ["pending", "confirmed", "packed", "ready_to_ship", "shipped", "out_for_delivery"];
    const pendingOrders = pendingStatuses.reduce((n, s) => n + (statusMap[s] || 0), 0);

    // Build a continuous 7-day series (fill gaps with 0) for the chart.
    const seriesMap = revenueSeriesRaw.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
    const revenueSeries = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      revenueSeries.push({
        date: key,
        label: d.toLocaleDateString("en-IN", { weekday: "short" }),
        revenue: seriesMap[key]?.revenue || 0,
        orders: seriesMap[key]?.orders || 0
      });
    }

    res.json({
      kpis: {
        todaysRevenue: todayPaidAgg[0]?.total || 0,
        todaysOrders: todayOrders,
        pendingOrders,
        deliveredOrders: statusMap.delivered || 0,
        cancelledOrders: statusMap.cancelled || 0,
        refundedOrders: (statusMap.refunded || 0),
        customers: customerCount,
        newUsersToday,
        lowStock,
        outOfStock,
        pendingCodValue: pendingCodValueAgg[0]?.total || 0
      },
      revenueSeries,
      bestSellers: bestSellers.map(b => ({ name: b._id, quantity: b.quantity, revenue: b.revenue })),
      recentOrders: recentOrders.map(o => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        customer: o.user ? o.user.name : "—",
        total: o.total,
        paymentProvider: o.paymentProvider,
        fulfillmentStatus: o.fulfillmentStatus,
        createdAt: o.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

// ---------------- Team / RBAC management (super_admin only) ----------------

// GET /api/admin/team — list all admin-panel accounts.
export async function listTeam(req, res, next) {
  try {
    const team = await User.find({ role: { $in: ADMIN_PANEL_ROLES } })
      .select("name email role permissions status createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      roles: ADMIN_PANEL_ROLES,
      allPermissions: PERMISSIONS,
      team: team.map(u => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        permissions: u.permissions || [],
        status: u.status,
        createdAt: u.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

export const createTeamValidators = [
  body("name").trim().isLength({ min: 2, max: 60 }).withMessage("Name must be 2–60 characters."),
  // See auth.controller.js: normalizeEmail() would strip gmail dots/+tags and
  // leave the new team member unable to log in with the address as given.
  body("email").isEmail().withMessage("Enter a valid email.").trim().toLowerCase(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  body("role").isIn(ADMIN_PANEL_ROLES).withMessage("Invalid role.")
];

// POST /api/admin/team — create a new staff/manager/admin account.
export async function createTeamMember(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const { name, email, password, role } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role, emailVerified: true });
    await writeAudit(req, "team.create", email, { role });

    res.status(201).json({
      message: "Team member created.",
      member: { id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status }
    });
  } catch (err) {
    next(err);
  }
}

export const updateTeamValidators = [
  param("id").isMongoId().withMessage("Invalid user id."),
  body("role").optional().isIn(ADMIN_PANEL_ROLES).withMessage("Invalid role."),
  body("status").optional().isIn(["active", "blocked"]).withMessage("Invalid status."),
  body("permissions").optional().isArray().withMessage("Permissions must be a list.")
];

// PATCH /api/admin/team/:id — change a member's role, status, or overrides.
export async function updateTeamMember(req, res, next) {
  try {
    if (validationErrors(req, res)) return;

    const target = await User.findById(req.params.id).select("name email role permissions status");
    if (!target) return res.status(404).json({ message: "User not found." });

    // Guard rails: a super_admin cannot demote/lock themselves out accidentally,
    // and only super_admins reach this route (enforced by route middleware).
    if (String(target._id) === String(req.auth.sub) && req.body.role && req.body.role !== "super_admin") {
      return res.status(400).json({ message: "You cannot change your own super-admin role." });
    }

    const before = { role: target.role, status: target.status, permissions: target.permissions };
    if (req.body.role) target.role = req.body.role;
    if (req.body.status) target.status = req.body.status;
    if (Array.isArray(req.body.permissions)) {
      target.permissions = req.body.permissions.filter(p => PERMISSIONS.includes(p));
    }
    await target.save();
    await writeAudit(req, "team.update", target.email, { before, after: { role: target.role, status: target.status, permissions: target.permissions } });

    res.json({
      message: "Team member updated.",
      member: { id: String(target._id), name: target.name, email: target.email, role: target.role, permissions: target.permissions, status: target.status }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/audit — recent audit log entries (super_admin only).
export async function listAuditLogs(req, res, next) {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ logs });
  } catch (err) {
    next(err);
  }
}
