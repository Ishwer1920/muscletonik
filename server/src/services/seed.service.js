import { Product } from "../models/product.model.js";
import { PRODUCTS, discountPct } from "../data/catalog.js";

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Build a full Product document from a catalog seed entry. Used only for the
// one-time seed and for backfilling legacy rows — never on every start.
function docFromCatalog(product) {
  return {
    catalogId: product.id,
    name: product.name,
    slug: slugify(product.name),
    sku: `MT-${product.id}`,
    barcode: `890000${String(product.id).padStart(4, "0")}`,
    category: product.category,
    brand: product.brand,
    description: product.desc || "",
    shortDescription: product.short || "",
    badge: product.badge || "",
    color: product.color || "#111111",
    protein: product.protein || "",
    calories: product.calories || 0,
    servings: product.servings || 0,
    deal: Boolean(product.deal),
    ingredients: product.ingredients || "",
    nutritionFacts: `Protein: ${product.protein || "0g"} | Calories: ${product.calories || 0}`,
    usageInstructions: "Use as directed on the label.",
    warnings: "Read the product label before use.",
    images: [],
    galleryImages: [],
    mrp: product.oldPrice,
    sellingPrice: product.price,
    discountPercent: discountPct(product.price, product.oldPrice),
    rating: product.rating || 0,
    reviewCount: product.reviews || 0,
    featured: Boolean(product.featured),
    trending: Boolean(product.deal),
    bestSeller: product.badge === "Bestseller",
    newArrival: product.badge === "New",
    weight: product.servings ? `${product.servings} servings` : "",
    flavor: product.flavor || "",
    tags: [product.brand, product.category, product.badge].filter(Boolean),
    seoTitle: product.name,
    seoDescription: product.short || product.desc || product.name,
    seoKeywords: [product.brand, product.category, product.flavor].filter(Boolean),
    status: "active",
    stock: Math.max(8, 28 - (product.id % 9))
  };
}

// STEP 3: Seed the catalog into MongoDB exactly once. If the Product collection
// already has documents, do nothing — the database is the source of truth from
// then on and admin edits are never overwritten.
export async function seedProductsIfEmpty() {
  const count = await Product.countDocuments();
  if (count > 0) return { seeded: false, count };
  const docs = PRODUCTS.map(docFromCatalog);
  await Product.insertMany(docs, { ordered: false });
  return { seeded: true, count: docs.length };
}

// One-time migration for stores that were seeded by the OLD sync (which did not
// store catalogId or the storefront display fields). It only fills rows that are
// missing a catalogId, and only fills the display fields — it never touches
// name/price/stock, so any admin edits are preserved.
export async function backfillProductDisplayFields() {
  const legacy = await Product.find({ $or: [{ catalogId: { $exists: false } }, { catalogId: null }] });
  let migrated = 0;
  for (const doc of legacy) {
    const m = /^MT-(\d+)$/.exec(doc.sku || "");
    const catalogId = m ? Number(m[1]) : null;
    if (catalogId == null) continue;
    const src = PRODUCTS.find(p => p.id === catalogId);
    doc.catalogId = catalogId;
    if (src) {
      if (!doc.shortDescription) doc.shortDescription = src.short || "";
      if (!doc.badge) doc.badge = src.badge || "";
      if (!doc.color || doc.color === "#111111") doc.color = src.color || "#111111";
      if (!doc.protein) doc.protein = src.protein || "";
      if (!doc.calories) doc.calories = src.calories || 0;
      if (!doc.servings) doc.servings = src.servings || 0;
      if (doc.deal === undefined) doc.deal = Boolean(src.deal);
    }
    await doc.save();
    migrated++;
  }
  return { migrated };
}

// Runs at startup: seed once if empty, then migrate any legacy rows.
export async function initProductCatalog() {
  const seed = await seedProductsIfEmpty();
  const backfill = await backfillProductDisplayFields();
  return { ...seed, ...backfill };
}
