import { body, param, validationResult } from "express-validator";
import { User } from "../models/user.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { writeAudit } from "../utils/audit.js";

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

function paging(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

// Build a Mongo sort object from ?sort=&dir=, restricted to an allow-list so a
// client can only sort by columns we've indexed/approved.
function buildSort(req, allowed, def = { createdAt: -1 }) {
  const key = String(req.query.sort || "");
  if (!allowed.includes(key)) return def;
  return { [key]: String(req.query.dir).toLowerCase() === "asc" ? 1 : -1 };
}

// Optional createdAt range from ?from=&to= (YYYY-MM-DD).
function dateRange(req, field = "createdAt") {
  const out = {};
  if (req.query.from) out.$gte = new Date(String(req.query.from));
  if (req.query.to) { const t = new Date(String(req.query.to)); t.setHours(23, 59, 59, 999); out.$lte = t; }
  return Object.keys(out).length ? { [field]: out } : null;
}

/* ===================== CUSTOMERS ===================== */

// GET /api/admin/customers — paginated, searchable customer list with order stats.
export async function listCustomers(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const search = String(req.query.search || "").trim();
    const filter = { role: "customer" };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    if (req.query.status === "active" || req.query.status === "blocked") filter.status = req.query.status;
    const range = dateRange(req);
    if (range) Object.assign(filter, range);
    const sort = buildSort(req, ["name", "email", "status", "createdAt"]);

    const [total, customers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone status createdAt").sort(sort).skip(skip).limit(limit).lean()
    ]);

    // Order counts + spend for just this page of customers.
    const ids = customers.map(c => c._id);
    const stats = await Order.aggregate([
      { $match: { user: { $in: ids } } },
      { $group: { _id: "$user", orders: { $sum: 1 }, spent: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } } } }
    ]);
    const statMap = stats.reduce((a, s) => { a[String(s._id)] = s; return a; }, {});

    res.json({
      page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
      customers: customers.map(c => ({
        id: String(c._id), name: c.name, email: c.email, phone: c.phone || "",
        status: c.status, createdAt: c.createdAt,
        orders: statMap[String(c._id)]?.orders || 0,
        spent: statMap[String(c._id)]?.spent || 0
      }))
    });
  } catch (err) { next(err); }
}

// GET /api/admin/customers/:id — one customer + their recent orders.
export async function getCustomer(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select("name email phone status addresses wishlist createdAt role");
    if (!user || user.role !== "customer") return res.status(404).json({ message: "Customer not found" });
    const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({
      customer: {
        id: String(user._id), name: user.name, email: user.email, phone: user.phone || "",
        status: user.status, addresses: user.addresses || [], wishlistCount: (user.wishlist || []).length,
        createdAt: user.createdAt
      },
      orders: orders.map(o => ({
        id: String(o._id), orderNumber: o.orderNumber, total: o.total,
        paymentProvider: o.paymentProvider, paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus, createdAt: o.createdAt
      }))
    });
  } catch (err) { next(err); }
}

export const customerStatusValidators = [
  param("id").isMongoId().withMessage("Invalid customer id."),
  body("status").isIn(["active", "blocked"]).withMessage("Status must be active or blocked.")
];

// PATCH /api/admin/customers/:id — block / unblock a customer.
export async function updateCustomerStatus(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const user = await User.findById(req.params.id).select("email status role");
    if (!user || user.role !== "customer") return res.status(404).json({ message: "Customer not found" });
    const before = user.status;
    user.status = req.body.status;
    await user.save();
    await writeAudit(req, "customer.status", user.email, { before, after: user.status });
    res.json({ message: "Customer updated.", status: user.status });
  } catch (err) { next(err); }
}

/* ===================== INVENTORY ===================== */

const LOW_STOCK = 5;

// GET /api/admin/inventory — products with stock, low-first, searchable.
export async function listInventory(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const search = String(req.query.search || "").trim();
    const filter = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { category: rx }];
    }
    if (req.query.lowOnly === "true") filter.stock = { $lte: LOW_STOCK };
    // Stock-state filter: in (>threshold), low (1..threshold), out (0).
    if (req.query.state === "out") filter.stock = { $lte: 0 };
    else if (req.query.state === "low") filter.stock = { $gt: 0, $lte: LOW_STOCK };
    else if (req.query.state === "in") filter.stock = { $gt: LOW_STOCK };
    const sort = buildSort(req, ["name", "sku", "brand", "category", "stock", "sellingPrice"], { stock: 1 });

    const [total, items, valueAgg] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).select("name sku brand category stock sellingPrice status").sort(sort).skip(skip).limit(limit).lean(),
      Product.aggregate([{ $group: { _id: null, value: { $sum: { $multiply: ["$stock", "$sellingPrice"] } }, units: { $sum: "$stock" } } }])
    ]);

    res.json({
      page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
      lowStockThreshold: LOW_STOCK,
      inventoryValue: valueAgg[0]?.value || 0,
      totalUnits: valueAgg[0]?.units || 0,
      items: items.map(p => ({
        id: String(p._id), name: p.name, sku: p.sku, brand: p.brand, category: p.category,
        stock: p.stock, price: p.sellingPrice, status: p.status,
        state: p.stock <= 0 ? "out" : (p.stock <= LOW_STOCK ? "low" : "ok")
      }))
    });
  } catch (err) { next(err); }
}

export const stockValidators = [
  param("id").isMongoId().withMessage("Invalid product id."),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock must be a whole number ≥ 0."),
  body("delta").optional().isInt().withMessage("Delta must be a whole number.")
];

// PATCH /api/admin/inventory/:id/stock — set absolute stock or apply a delta.
export async function adjustStock(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const product = await Product.findById(req.params.id).select("name sku stock");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const before = product.stock;
    if (req.body.stock !== undefined) product.stock = Number(req.body.stock);
    else if (req.body.delta !== undefined) product.stock = Math.max(0, product.stock + Number(req.body.delta));
    else return res.status(400).json({ message: "Provide a new stock value or a delta." });

    await product.save();
    await writeAudit(req, "inventory.adjust", product.sku, { before, after: product.stock });
    res.json({ message: "Stock updated.", id: String(product._id), stock: product.stock });
  } catch (err) { next(err); }
}

/* ===================== ANALYTICS ===================== */

// GET /api/admin/analytics — totals, 30-day revenue series, status & provider breakdowns, top products.
export async function getAnalytics(req, res, next) {
  try {
    const since = new Date(Date.now() - 29 * 864e5);
    since.setHours(0, 0, 0, 0);

    const [totals, paidAgg, series, byStatus, byProvider, topProducts, invValue] = await Promise.all([
      Order.countDocuments({}),
      Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, revenue: { $sum: "$total" }, orders: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } }
      ]),
      Order.aggregate([{ $group: { _id: "$fulfillmentStatus", count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: "$paymentProvider", count: { $sum: 1 }, revenue: { $sum: "$total" } } }]),
      Order.aggregate([
        { $unwind: "$items" },
        { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
        { $sort: { revenue: -1 } }, { $limit: 8 }
      ]),
      Product.aggregate([{ $group: { _id: null, value: { $sum: { $multiply: ["$stock", "$sellingPrice"] } } } }])
    ]);

    const customers = await User.countDocuments({ role: "customer" });
    const paidRevenue = paidAgg[0]?.revenue || 0;
    const paidOrders = paidAgg[0]?.orders || 0;

    const seriesMap = series.reduce((a, s) => { a[s._id] = s; return a; }, {});
    const revenueSeries = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      revenueSeries.push({ date: key, revenue: seriesMap[key]?.revenue || 0, orders: seriesMap[key]?.orders || 0 });
    }

    res.json({
      totals: {
        totalOrders: totals,
        paidRevenue,
        paidOrders,
        avgOrderValue: paidOrders ? Math.round(paidRevenue / paidOrders) : 0,
        customers,
        inventoryValue: invValue[0]?.value || 0
      },
      revenueSeries,
      byStatus: byStatus.map(s => ({ status: s._id, count: s.count })),
      byProvider: byProvider.map(p => ({ provider: p._id || "unknown", count: p.count, revenue: p.revenue })),
      topProducts: topProducts.map(t => ({ name: t._id, quantity: t.quantity, revenue: t.revenue }))
    });
  } catch (err) { next(err); }
}

// GET /api/admin/analytics/export — orders as CSV download.
export async function exportOrdersCsv(req, res, next) {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(5000).populate("user", "email").lean();
    const rows = [["Order", "Date", "Customer", "Total", "Payment", "PaymentStatus", "Fulfillment"]];
    for (const o of orders) {
      rows.push([
        o.orderNumber,
        new Date(o.createdAt).toISOString(),
        o.user?.email || "",
        o.total,
        o.paymentProvider,
        o.paymentStatus,
        o.fulfillmentStatus
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
