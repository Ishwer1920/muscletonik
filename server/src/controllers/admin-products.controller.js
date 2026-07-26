import { body, param, validationResult } from "express-validator";
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

function slugify(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function discountFrom(mrp, price) {
  return mrp > 0 && price <= mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
}

// Fields an admin may set. catalogId, sku and slug are derived/immutable.
const EDITABLE = [
  "name", "brand", "category", "description", "shortDescription", "badge", "color",
  "protein", "calories", "servings", "flavor", "ingredients", "mrp", "sellingPrice",
  "stock", "rating", "reviewCount", "featured", "trending", "deal", "bestSeller",
  "newArrival", "weight", "status", "seoTitle", "seoDescription", "images", "galleryImages"
];

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  const text = String(value).trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
    } catch {}
  }
  return text.split(/[\n,]/).map(v => v.trim()).filter(Boolean);
}

function normalizeMedia(body, files = []) {
  const uploaded = files.map(file => `/uploads/products/${file.filename}`);
  const imageUrls = parseList(body.imageUrls || body.images || body.imageUrl);
  const galleryUrls = parseList(body.galleryUrls || body.galleryImages);
  return {
    images: [...new Set([...uploaded, ...imageUrls])],
    galleryImages: [...new Set([...uploaded, ...galleryUrls, ...imageUrls])]
  };
}

function applyEditable(doc, body) {
  for (const key of EDITABLE) {
    if (body[key] !== undefined) doc[key] = body[key];
  }
  if (Array.isArray(body.images)) doc.images = body.images;
  if (Array.isArray(body.galleryImages)) doc.galleryImages = body.galleryImages;
  doc.discountPercent = discountFrom(Number(doc.mrp) || 0, Number(doc.sellingPrice) || 0);
}

function adminView(p) {
  return {
    id: String(p._id),
    catalogId: p.catalogId,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    shortDescription: p.shortDescription,
    badge: p.badge,
    color: p.color,
    protein: p.protein,
    calories: p.calories,
    servings: p.servings,
    flavor: p.flavor,
    ingredients: p.ingredients,
    images: Array.isArray(p.images) ? p.images : [],
    galleryImages: Array.isArray(p.galleryImages) ? p.galleryImages : [],
    mrp: p.mrp,
    sellingPrice: p.sellingPrice,
    discountPercent: p.discountPercent,
    stock: p.stock,
    rating: p.rating,
    reviewCount: p.reviewCount,
    featured: p.featured,
    trending: p.trending,
    deal: p.deal,
    bestSeller: p.bestSeller,
    newArrival: p.newArrival,
    weight: p.weight,
    status: p.status,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    createdAt: p.createdAt
  };
}

// GET /api/admin/products — paginated, searchable list.
export async function listProducts(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const search = String(req.query.search || "").trim();
    const filter = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { category: rx }];
    }
    if (req.query.status) filter.status = String(req.query.status);

    const [total, items] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).sort({ catalogId: 1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);
    res.json({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), products: items.map(adminView) });
  } catch (err) { next(err); }
}

// GET /api/admin/products/:id
export async function getProduct(req, res, next) {
  try {
    const p = await Product.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ message: "Product not found" });
    res.json({ product: adminView(p) });
  } catch (err) { next(err); }
}

export const productValidators = [
  body("name").trim().isLength({ min: 2, max: 160 }).withMessage("Name is required (2–160 chars)."),
  body("brand").trim().notEmpty().withMessage("Brand is required."),
  body("category").trim().notEmpty().withMessage("Category is required."),
  body("sellingPrice").isFloat({ min: 0 }).withMessage("Selling price must be ≥ 0."),
  body("mrp").optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage("MRP must be ≥ 0."),
  body("stock").optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage("Stock must be a whole number ≥ 0.")
];

// POST /api/admin/products — create. Assigns the next catalogId + SKU.
export async function createProduct(req, res, next) {
  try {
    if (validationErrors(req, res)) return;

    const last = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
    const catalogId = (last?.catalogId || 0) + 1;

    let slug = slugify(req.body.name) || `product-${catalogId}`;
    if (await Product.exists({ slug })) slug = `${slug}-${catalogId}`;

    const doc = new Product({ catalogId, sku: `MT-${catalogId}`, slug, status: "active" });
    applyEditable(doc, req.body);
    const media = normalizeMedia(req.body, req.files || []);
    if (media.images.length) doc.images = media.images;
    if (media.galleryImages.length) doc.galleryImages = media.galleryImages;
    await doc.save();
    await writeAudit(req, "product.create", doc.sku, { name: doc.name, price: doc.sellingPrice });
    res.status(201).json({ message: "Product created.", product: adminView(doc) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A product with this name/slug already exists." });
    next(err);
  }
}

// PATCH /api/admin/products/:id — update editable fields (catalogId/sku immutable).
export async function updateProduct(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const doc = await Product.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Product not found" });

    const before = { name: doc.name, sellingPrice: doc.sellingPrice, stock: doc.stock, status: doc.status };
    applyEditable(doc, req.body);
    const media = normalizeMedia(req.body, req.files || []);
    if (media.images.length) doc.images = media.images;
    if (media.galleryImages.length) doc.galleryImages = media.galleryImages;
    if (req.body.name && slugify(req.body.name) && !doc.slug.endsWith(String(doc.catalogId))) {
      // keep slug stable unless it collides; leave existing slug otherwise
    }
    await doc.save();
    await writeAudit(req, "product.update", doc.sku, { before, after: { name: doc.name, sellingPrice: doc.sellingPrice, stock: doc.stock, status: doc.status } });
    res.json({ message: "Product updated.", product: adminView(doc) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate product name/slug." });
    next(err);
  }
}

// DELETE /api/admin/products/:id — hard delete.
export async function deleteProduct(req, res, next) {
  try {
    const doc = await Product.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Product not found" });
    await writeAudit(req, "product.delete", doc.sku, { name: doc.name });
    res.json({ message: "Product deleted.", id: String(doc._id) });
  } catch (err) { next(err); }
}

// PATCH /api/admin/products/:id/status — quick archive/activate toggle.
export const statusValidators = [
  param("id").isMongoId(),
  body("status").isIn(["active", "archived"]).withMessage("Status must be active or archived.")
];
export async function setProductStatus(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const doc = await Product.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!doc) return res.status(404).json({ message: "Product not found" });
    await writeAudit(req, "product.status", doc.sku, { status: doc.status });
    res.json({ message: "Status updated.", product: adminView(doc) });
  } catch (err) { next(err); }
}
