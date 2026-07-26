import { body, param, validationResult } from "express-validator";
import { Review } from "../models/review.model.js";
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

export const reviewValidators = [
  body("productId").isInt({ min: 1 }).withMessage("Product id is required."),
  body("productName").trim().isLength({ min: 2, max: 200 }).withMessage("Product name is required."),
  body("customerName").trim().isLength({ min: 2, max: 80 }).withMessage("Customer name is required."),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1-5."),
  body("text").trim().isLength({ min: 3, max: 2000 }).withMessage("Review text is required."),
  body("status").optional().isIn(["pending", "approved", "rejected", "spam"]).withMessage("Invalid status."),
  body("reply").optional().isString().withMessage("Reply must be text."),
  body("featured").optional().isBoolean().withMessage("Featured must be true or false.")
];

export async function listReviews(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const search = String(req.query.search || "").trim();
    const filter = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ productName: rx }, { customerName: rx }, { text: rx }, { reply: rx }];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.featured === "true") filter.featured = true;
    if (req.query.featured === "false") filter.featured = false;
    if (req.query.minRating) filter.rating = { $gte: Number(req.query.minRating) };

    const [total, reviews, summary] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.aggregate([
        {
          $group: {
            _id: null,
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
            spam: { $sum: { $cond: [{ $eq: ["$status", "spam"] }, 1, 0] } }
          }
        }
      ])
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: summary[0] || { pending: 0, approved: 0, rejected: 0, spam: 0 },
      reviews: reviews.map(r => ({
        id: String(r._id),
        productId: r.productId,
        productName: r.productName,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        rating: r.rating,
        text: r.text,
        imageUrl: r.imageUrl,
        status: r.status,
        featured: r.featured,
        reply: r.reply,
        tags: r.tags || [],
        createdAt: r.createdAt
      }))
    });
  } catch (err) { next(err); }
}

export async function createReview(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const review = await Review.create({
      productId: Number(req.body.productId),
      productName: req.body.productName,
      customerName: req.body.customerName,
      customerEmail: req.body.customerEmail || "",
      rating: Number(req.body.rating),
      text: req.body.text,
      imageUrl: req.body.imageUrl || "",
      status: req.body.status || "pending",
      featured: req.body.featured === true || req.body.featured === "true",
      reply: req.body.reply || "",
      tags: Array.isArray(req.body.tags) ? req.body.tags : []
    });
    await writeAudit(req, "review.create", review.productName, review.toObject());
    res.status(201).json({ message: "Review created.", review });
  } catch (err) { next(err); }
}

export async function updateReview(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    const before = review.toObject();
    if (req.body.productId !== undefined) review.productId = Number(req.body.productId);
    if (req.body.productName !== undefined) review.productName = req.body.productName;
    if (req.body.customerName !== undefined) review.customerName = req.body.customerName;
    if (req.body.customerEmail !== undefined) review.customerEmail = req.body.customerEmail;
    if (req.body.rating !== undefined) review.rating = Number(req.body.rating);
    if (req.body.text !== undefined) review.text = req.body.text;
    if (req.body.imageUrl !== undefined) review.imageUrl = req.body.imageUrl;
    if (req.body.status !== undefined) review.status = req.body.status;
    if (req.body.featured !== undefined) review.featured = req.body.featured === true || req.body.featured === "true";
    if (req.body.reply !== undefined) review.reply = req.body.reply;
    if (Array.isArray(req.body.tags)) review.tags = req.body.tags;
    await review.save();
    await writeAudit(req, "review.update", review.productName, { before, after: review.toObject() });
    res.json({ message: "Review updated.", review });
  } catch (err) { next(err); }
}

export async function deleteReview(req, res, next) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    await writeAudit(req, "review.delete", review.productName, review.toObject());
    await review.deleteOne();
    res.json({ message: "Review deleted." });
  } catch (err) { next(err); }
}

export const reviewIdValidator = [param("id").isMongoId().withMessage("Invalid review id.")];
