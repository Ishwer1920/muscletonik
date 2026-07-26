// One-off importer: pull the products fetched from gainz4ever.com (Shopify
// products.json, saved to scratch_products.json at the project root) into the
// MongoDB catalog under a new brand "G4E". Idempotent: re-running updates the
// same rows (matched by slug) instead of creating duplicates.
//
//   node scripts/import-g4e.js
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import "../src/config/env.js"; // loads .env
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";
import { getBrands, getCategories } from "../src/services/taxonomy.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../scratch_products.json");

const BRAND_ID = "g4e";
const BRAND = { id: BRAND_ID, name: "G4E", initials: "G4", color: "#d90429", desc: "Gainz4Ever performance nutrition" };

// New categories G4E needs on top of the existing storefront taxonomy.
const EXTRA_CATEGORIES = [
  { id: "amino-acids", name: "Amino Acids", icon: "layers" },
  { id: "collagen", name: "Collagen", icon: "drop" },
  { id: "fat-burner", name: "Fat Burner", icon: "flame" },
  { id: "electrolytes", name: "Electrolytes", icon: "drop" },
  { id: "greens", name: "Greens & Superfoods", icon: "bowl" },
  { id: "plant-protein", name: "Plant Protein", icon: "flask" },
  { id: "wellness", name: "Wellness & Health", icon: "shield" }
];

function clean(str) {
  return String(str || "").replace(/[​-‍⁠﻿]/g, "").trim();
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

// Classify a product into a storefront category from its title. Ordered rules:
// first match wins, so put more specific rules before generic ones.
function categoryFor(title) {
  const t = ` ${title.toLowerCase()} `;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has("collagen")) return "collagen";
  if (has("mass gain", "gainer", "real gainz", "super mass")) return "mass-gainer";
  if (has("iso", "whey", "hydro whey", "hydro iso", "nitro whey")) return "whey-protein";
  if (has("plant protein", "vegan protein")) return "plant-protein";
  if (has("creatine", "crea-10", "creapro", "crea 10", "cellmax")) return "creatine";
  if (has("pre-workout", "preworkout", "pre workout", "warrior", "nuclear", "1.m.r", "t - pre", "t-pre", "coffee")) return "pre-workout";
  if (has("bcaa")) return "bcaa";
  if (has("eaa", "aminoz", "amino", "glutamine", "leucine", "arginine", "citrulline", "aakg", "beta-alanine", "beta alanine", "carnitine")) return "amino-acids";
  if (has("fish oil", "omega", "flaxseed")) return "fish-oil";
  if (has("burn", "lipo", "carniburn", "fiburn")) return "fat-burner";
  if (has("electro", "hydra", "electrolyte")) return "electrolytes";
  if (has("greens")) return "greens";
  if (has("vitamin")) return "vitamins";
  if (has("oats")) return "oats";
  // wellness bucket: joint/liver/organ/prostate/sleep/trt/collagen-free health
  if (has("joint", "liver", "tudca", "organ", "prostate", "sleep", "trt", "shield", "support", "fiber")) return "wellness";
  return "wellness";
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function optionValues(product, keyword) {
  const idx = (product.options || []).findIndex(o => new RegExp(keyword, "i").test(o.name));
  if (idx < 0) return "";
  const key = `option${idx + 1}`;
  const vals = [...new Set((product.variants || []).map(v => v[key]).filter(Boolean))];
  return vals.join(", ");
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Cannot find ${SRC}. Fetch it first:\n  curl -s "https://gainz4ever.com/collections/all-products/products.json?limit=250" -o scratch_products.json`);
    process.exit(1);
  }
  const shopify = JSON.parse(fs.readFileSync(SRC, "utf8")).products || [];
  console.log(`Loaded ${shopify.length} products from Shopify export.`);

  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.");

  // 1) Register the G4E brand (merge, don't clobber existing brands).
  const brands = await getBrands();
  if (!brands.some(b => b.id === BRAND_ID)) {
    await SiteSetting.findOneAndUpdate(
      { key: "catalog.brands" },
      { key: "catalog.brands", category: "catalog", value: [...brands, BRAND], updatedBy: "import-g4e" },
      { upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`Added brand: ${BRAND.name}`);
  } else {
    console.log(`Brand ${BRAND.name} already present.`);
  }

  // 2) Ensure the extra categories exist (merge).
  const categories = await getCategories();
  const catIds = new Set(categories.map(c => c.id));
  const toAdd = EXTRA_CATEGORIES.filter(c => !catIds.has(c.id));
  if (toAdd.length) {
    await SiteSetting.findOneAndUpdate(
      { key: "catalog.categories" },
      { key: "catalog.categories", category: "catalog", value: [...categories, ...toAdd], updatedBy: "import-g4e" },
      { upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`Added categories: ${toAdd.map(c => c.id).join(", ")}`);
  }

  // 3) Next catalogId picks up after the current max so IDs stay unique.
  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  let created = 0, updated = 0;
  const catCount = {};
  for (const p of shopify) {
    const name = clean(p.title);
    if (!name) continue;
    const v0 = (p.variants || [])[0] || {};
    const price = num(v0.price);
    const compare = num(v0.compare_at_price);
    const sellingPrice = price;
    const mrp = compare > price ? compare : price;
    const discountPercent = mrp > 0 && sellingPrice < mrp ? Math.round((1 - sellingPrice / mrp) * 100) : 0;
    const category = categoryFor(name);
    catCount[category] = (catCount[category] || 0) + 1;
    const images = (p.images || []).map(i => i.src).filter(Boolean);
    const desc = stripHtml(p.body_html);
    const short = desc.split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 200) || name;
    const flavor = optionValues(p, "flavou?r|taste");
    const weight = optionValues(p, "weight|size|quantity|pack|grams|kg");

    // slug from Shopify handle; guarantee uniqueness against non-G4E rows.
    let slug = slugify(p.handle || name);
    const clash = await Product.findOne({ slug, brand: { $ne: BRAND_ID } }).select("_id").lean();
    if (clash) slug = `${slug}-g4e`;

    const existing = await Product.findOne({ slug }).select("catalogId").lean();
    const catalogId = existing?.catalogId || nextId;

    const doc = {
      catalogId,
      name,
      slug,
      sku: `MT-${catalogId}`,
      barcode: `890100${String(catalogId).padStart(4, "0")}`,
      category,
      brand: BRAND_ID,
      description: desc,
      shortDescription: short,
      badge: discountPercent >= 20 ? "Deal" : "",
      color: BRAND.color,
      deal: discountPercent >= 20,
      ingredients: "",
      nutritionFacts: "",
      usageInstructions: "Use as directed on the label.",
      warnings: "Read the product label before use.",
      images,
      galleryImages: images,
      mrp,
      sellingPrice,
      discountPercent,
      stock: 25,
      rating: 4.6,
      reviewCount: 0,
      featured: false,
      trending: discountPercent >= 20,
      bestSeller: false,
      newArrival: true,
      weight,
      flavor,
      tags: [BRAND.name, category].filter(Boolean),
      seoTitle: `${name} - G4E`,
      seoDescription: short,
      seoKeywords: [BRAND.name, category, "gainz4ever"].filter(Boolean),
      status: "active"
    };

    await Product.findOneAndUpdate({ slug }, doc, { upsert: true, setDefaultsOnInsert: true });
    if (existing) { updated++; } else { created++; nextId++; }
  }

  console.log(`\nDone. Created ${created}, updated ${updated}.`);
  console.log("Category distribution:", JSON.stringify(catCount, null, 1));
  const total = await Product.countDocuments({ brand: BRAND_ID });
  console.log(`Total G4E products in DB: ${total}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
