import { body, param, validationResult } from "express-validator";
import { Coupon } from "../models/coupon.model.js";
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
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

export const couponValidators = [
  body("code").trim().isLength({ min: 3, max: 32 }).withMessage("Code must be 3-32 characters."),
  body("title").trim().isLength({ min: 2, max: 80 }).withMessage("Title must be 2-80 characters."),
  body("type").isIn(["percent", "flat", "free_shipping"]).withMessage("Invalid coupon type."),
  body("value").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Value must be a number."),
  body("minOrder").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("Minimum order must be a number."),
  body("maxUses").optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage("Max uses must be a whole number."),
  body("expiresAt").optional({ checkFalsy: true }).isISO8601().withMessage("Invalid expiry date."),
  body("active").optional().isBoolean().withMessage("Active must be true or false."),
  body("notes").optional().isString().withMessage("Notes must be text.")
];

export async function listCoupons(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const search = String(req.query.search || "").trim();
    const filter = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ code: rx }, { title: rx }, { notes: rx }];
    }
    if (req.query.status === "active") filter.active = true;
    if (req.query.status === "inactive") filter.active = false;
    const [total, coupons, summary] = await Promise.all([
      Coupon.countDocuments(filter),
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Coupon.aggregate([
        {
          $group: {
            _id: null,
            active: { $sum: { $cond: ["$active", 1, 0] } },
            inactive: { $sum: { $cond: ["$active", 0, 1] } },
            usage: { $sum: "$usageCount" }
          }
        }
      ])
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: summary[0] || { active: 0, inactive: 0, usage: 0 },
      coupons: coupons.map(c => ({
        id: String(c._id),
        code: c.code,
        title: c.title,
        type: c.type,
        value: c.value,
        minOrder: c.minOrder,
        maxUses: c.maxUses,
        usageCount: c.usageCount,
        expiresAt: c.expiresAt,
        active: c.active,
        notes: c.notes,
        createdAt: c.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function getCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ coupon });
  } catch (err) { next(err); }
}

export async function createCoupon(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const payload = {
      code: String(req.body.code || "").toUpperCase().trim(),
      title: req.body.title,
      type: req.body.type,
      value: Number(req.body.value || 0),
      minOrder: Number(req.body.minOrder || 0),
      maxUses: Number(req.body.maxUses || 0),
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      active: req.body.active !== false && req.body.active !== "false",
      notes: req.body.notes || "",
      createdBy: req.auth?.email || ""
    };
    const existing = await Coupon.findOne({ code: payload.code });
    if (existing) return res.status(409).json({ message: "That coupon code already exists." });
    const coupon = await Coupon.create(payload);
    await writeAudit(req, "coupon.create", coupon.code, payload);
    res.status(201).json({ message: "Coupon created.", coupon });
  } catch (err) { next(err); }
}

export async function updateCoupon(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    const before = coupon.toObject();
    coupon.code = String(req.body.code || coupon.code).toUpperCase().trim();
    coupon.title = req.body.title ?? coupon.title;
    coupon.type = req.body.type ?? coupon.type;
    if (req.body.value !== undefined) coupon.value = Number(req.body.value);
    if (req.body.minOrder !== undefined) coupon.minOrder = Number(req.body.minOrder);
    if (req.body.maxUses !== undefined) coupon.maxUses = Number(req.body.maxUses);
    coupon.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (req.body.active !== undefined) coupon.active = req.body.active === true || req.body.active === "true";
    if (req.body.notes !== undefined) coupon.notes = req.body.notes;
    coupon.updatedBy = req.auth?.email || "";
    await coupon.save();
    await writeAudit(req, "coupon.update", coupon.code, { before, after: coupon.toObject() });
    res.json({ message: "Coupon updated.", coupon });
  } catch (err) { next(err); }
}

export async function deleteCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    await writeAudit(req, "coupon.delete", coupon.code, coupon.toObject());
    await coupon.deleteOne();
    res.json({ message: "Coupon deleted." });
  } catch (err) { next(err); }
}

export const couponIdValidator = [param("id").isMongoId().withMessage("Invalid coupon id.")];
