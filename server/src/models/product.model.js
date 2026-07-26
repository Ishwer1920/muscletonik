import mongoose from "mongoose";

const moneyField = { type: Number, default: 0, min: 0 };

const productSchema = new mongoose.Schema(
  {
    // Stable numeric id used by the storefront URLs (product.html?id=),
    // the cart, and the checkout SKU mapping (sku === `MT-${catalogId}`).
    // This is the product's public identity; MongoDB _id stays internal.
    catalogId: { type: Number, index: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    sku: { type: String, trim: true, index: true },
    barcode: { type: String, trim: true, index: true },
    category: { type: String, required: true, index: true },
    brand: { type: String, required: true, index: true },
    description: { type: String, default: "" },
    // Storefront display fields (kept 1:1 so the DB is a faithful single source).
    shortDescription: { type: String, default: "" },
    badge: { type: String, default: "" },
    color: { type: String, default: "#111111" },
    protein: { type: String, default: "" },
    calories: { type: Number, default: 0 },
    servings: { type: Number, default: 0 },
    deal: { type: Boolean, default: false },
    ingredients: { type: String, default: "" },
    nutritionFacts: { type: String, default: "" },
    usageInstructions: { type: String, default: "" },
    warnings: { type: String, default: "" },
    images: [{ type: String }],
    galleryImages: [{ type: String }],
    // Per-flavour image map, so the product page can swap the main photo when a
    // shopper picks a flavour. Populated from Shopify variant/option data.
    flavors: [{ name: { type: String }, image: { type: String }, _id: false }],
    mrp: moneyField,
    sellingPrice: moneyField,
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, default: 0, min: 0 },
    // Digital goods (diet/workout plans): delivered as a download, so they carry
    // no shipping and are never stock-reserved.
    digital: { type: Boolean, default: false },
    // Hidden products resolve by id (so the cart can price them) but are kept
    // out of every browse/search listing.
    hidden: { type: Boolean, default: false },
    // For digital plan products only: "diet" | "workout" | "both".
    planType: { type: String, default: "" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    featured: { type: Boolean, default: false },
    trending: { type: Boolean, default: false },
    bestSeller: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    weight: { type: String, default: "" },
    flavor: { type: String, default: "" },
    tags: [{ type: String }],
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    seoKeywords: [{ type: String }],
    status: { type: String, enum: ["active", "archived"], default: "active" }
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", tags: "text" });

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
