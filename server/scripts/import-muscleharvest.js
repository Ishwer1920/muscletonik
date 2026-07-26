// Importer for Muscle Harvest (WooCommerce Store API) -> MongoDB catalog.
// Prices are INR in minor units (divide by currency_minor_unit). Idempotent.
//   node scripts/import-muscleharvest.js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";

const BRAND = { id: "muscle-harvest", name: "Muscle Harvest", initials: "MH", color: "#16a34a", desc: "Muscle Harvest — imported catalogue" };
const API = "https://muscleharvest.in/wp-json/wc/store/v1/products";

const clean = s => String(s || "").replace(/&#0?38;|&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
// Keep full slug: these products are distinguished only by a flavour suffix, so
// truncating merges distinct SKUs. Woo slugs are already unique per product.
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const FLAVOURS = ["dark chocolate", "cream n cookies", "cookies and cream", "cookies n cream", "double rich chocolate",
  "chocolate", "vanilla", "strawberry", "banana", "mango", "cappuccino", "coffee", "butterscotch", "kesar",
  "kulfi", "cardamom", "elaichi", "pista", "pistachio", "caramel", "hazelnut", "lemon", "orange", "cola",
  "blueberry", "raspberry", "unflavoured", "unflavored", "kesar pista", "malai kulfi"];
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
function flavourFrom(slug) {
  const s = " " + slug.replace(/-/g, " ") + " ";
  let best = "";
  for (const f of FLAVOURS) if (s.includes(" " + f + " ") && f.length > best.length) best = f;
  return best ? titleCase(best) : "";
}
function stripHtml(html) {
  return String(html || "").replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#0?38;|&amp;/g, "&").replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
const round9 = n => (n > 0 ? Math.max(9, Math.round(n / 10) * 10 - 1) : 0);

function categoryFor(title, cats = []) {
  const t = ` ${[title, cats.join(" ")].join(" ").toLowerCase()} `;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has("t-shirt", "shaker", "bottle", "apparel", "gym bag")) return "accessories";
  if (has("collagen")) return "collagen";
  if (has("casein")) return "casein";
  if (has("mass gain", "gainer")) return "mass-gainer";
  if (has("isolate", "iso ", "hydro whey", "clear whey")) return "whey-protein";
  if (has("plant protein", "vegan")) return "plant-protein";
  if (has("whey")) return "whey-protein";
  if (has("creatine")) return "creatine";
  if (has("bcaa")) return "bcaa";
  if (has("eaa", "amino", "glutamine", "citrulline", "arginine")) return "amino-acids";
  if (has("pre workout", "pre-workout", "pre/intra", "intra", "pump", "nitric")) return "pre-workout";
  if (has("electrolyt", "hydration")) return "electrolytes";
  if (has("omega", "fish oil")) return "fish-oil";
  if (has("burn", "carnitine", "lipo")) return "fat-burner";
  if (has("vitamin", "multivit", "zma")) return "vitamins";
  if (has("greens", "superfood")) return "greens";
  if (has("bar", "cookie", "snack")) return "protein-bars";
  return "wellness";
}

async function fetchAll() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${API}?per_page=100&page=${page}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) break;
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  const products = await fetchAll();
  console.log(`Fetched ${products.length} Muscle Harvest products.`);
  await mongoose.connect(env.mongoUri);

  const bdoc = await SiteSetting.findOne({ key: "catalog.brands" }).lean();
  const brands = bdoc?.value || [];
  if (!brands.some(b => b.id === BRAND.id)) {
    await SiteSetting.findOneAndUpdate({ key: "catalog.brands" },
      { key: "catalog.brands", category: "catalog", value: [...brands, BRAND], updatedBy: "import-muscleharvest" },
      { upsert: true, setDefaultsOnInsert: true });
    console.log("Added brand:", BRAND.name);
  }

  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  let created = 0, updated = 0, skipped = 0;
  const catCount = {};
  for (const p of products) {
    if (p.type === "variation" || p.parent) continue;
    let name = clean(p.name);
    const flavour = flavourFrom(p.slug || "");
    // The listing names are identical across flavours; append it so they read distinctly.
    if (flavour && !name.toLowerCase().includes(flavour.toLowerCase())) name = `${name} (${flavour})`;
    const minor = p.prices?.currency_minor_unit ?? 2;
    const div = Math.pow(10, minor);
    const price = round9(Number(p.prices?.price || 0) / div);
    if (!name || price <= 0) { skipped++; continue; }
    const reg = round9(Number(p.prices?.regular_price || 0) / div);
    const mrp = reg > price ? reg : price;
    const discountPercent = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
    const cats = (p.categories || []).map(c => c.name);
    const category = categoryFor(name, cats);
    catCount[category] = (catCount[category] || 0) + 1;
    const images = (p.images || []).map(i => i.src).filter(Boolean);
    const desc = stripHtml(p.description || p.short_description);
    const short = stripHtml(p.short_description) || desc.split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 200) || name;

    let slug = slugify(p.slug || name);
    const clash = await Product.findOne({ slug, brand: { $ne: BRAND.id } }).select("_id").lean();
    if (clash) slug = `${slug}-mh`;
    const existing = await Product.findOne({ slug }).select("catalogId").lean();
    const catalogId = existing?.catalogId || nextId;

    const doc = {
      catalogId, name, slug, sku: `MT-${catalogId}`, barcode: `8904${String(catalogId).padStart(6, "0")}`,
      category, brand: BRAND.id, description: desc, shortDescription: short.slice(0, 200),
      badge: discountPercent >= 20 ? "Deal" : "", color: BRAND.color, deal: discountPercent >= 20,
      usageInstructions: "Use as directed on the label.", warnings: "Read the product label before use.",
      images, galleryImages: images, mrp, sellingPrice: price, discountPercent,
      stock: 25, rating: Number(p.average_rating) || 4.6, reviewCount: p.review_count || 0,
      trending: discountPercent >= 20, newArrival: true, weight: clean(p.formatted_weight || ""), flavor: flavour,
      tags: [BRAND.name, category, ...cats].filter(Boolean),
      seoTitle: `${name} - ${BRAND.name}`.slice(0, 120), seoDescription: short.slice(0, 200),
      seoKeywords: [BRAND.name, category].filter(Boolean), status: "active"
    };
    await Product.findOneAndUpdate({ slug }, doc, { upsert: true, setDefaultsOnInsert: true });
    if (existing) updated++; else { created++; nextId++; }
  }
  console.log(`Done. created ${created}, updated ${updated}, skipped ${skipped}`);
  console.log("categories:", JSON.stringify(catCount));
  console.log("Total Muscle Harvest in DB:", await Product.countDocuments({ brand: BRAND.id }));
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
