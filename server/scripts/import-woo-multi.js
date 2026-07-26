// Bulk importer for WooCommerce storefronts (Store API) -> MongoDB catalog.
// Same contract as import-shopify-multi.js: one store = one brand, idempotent
// upsert by slug, prices converted to INR.
//
//   node scripts/import-woo-multi.js [brandId ...]
//
// Unlike Shopify, the Woo Store API reports its own `currency_code` and
// `currency_minor_unit`, so the currency is read from the response rather than
// guessed — no presentment-currency ambiguity.
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";

const RATE = { INR: 1, USD: 86, EUR: 93, GBP: 108, CAD: 63, AUD: 57 };

const BRANDS = [
  { id: "perfect-sports", name: "PerfectSports", domain: "https://us.perfectsports.com", color: "#c8102e" },
  { id: "exalt",          name: "Exalt Supplements", domain: "https://exaltsupps.in",    color: "#6d28d9" }
];

const clean = s => String(s || "")
  .replace(/&#0?38;|&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'")
  .replace(/&#8211;/g, "-").replace(/&#8212;/g, "-").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, " ")
  .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// Keep the full slug — Woo slugs are unique per product and truncating them
// merges distinct flavour SKUs (learned the hard way on muscle-harvest).
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function stripHtml(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&#0?38;|&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&#8211;/g, "-").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

const round9 = n => (n > 0 ? Math.max(9, Math.round(n / 10) * 10 - 1) : 0);
const toInr = (amount, currency) => round9(Number(amount) * (RATE[currency] || 1));

// Same taxonomy rules as the Shopify importer so both feed one consistent store.
function categoryFor(title, cats = []) {
  const t = ` ${[title, cats.join(" ")].join(" ").toLowerCase()} `;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has("t-shirt", "tshirt", "hoodie", "shaker", "bottle", "apparel", "gym bag", "sipper", "towel", "belt", "sleeve")) return "accessories";
  if (has("collagen")) return "collagen";
  if (has("casein", "micellar")) return "casein";
  if (has("mass gain", "gainer", "weight gainer")) return "mass-gainer";
  if (has("isolate", "iso ", "hydro whey", "hydrolyzed whey", "clear whey")) return "whey-protein";
  if (has("plant protein", "vegan protein", "pea protein")) return "plant-protein";
  if (has("whey", "protein blend")) return "whey-protein";
  if (has("cream of rice", "oats", "muesli")) return "oats";
  if (has("peanut butter", "almond butter")) return "peanut-butter";
  if (has("protein bar", "energy bar", "cookie", "wafer", "snack")) return has("bar") ? "protein-bars" : "snacks";
  if (has("creatine")) return "creatine";
  if (has("bcaa")) return "bcaa";
  if (has("test booster", "testosterone", "tribulus", "d-aspartic", "shilajit")) return "test-booster";
  if (has("eaa", "amino", "glutamine", "leucine", "arginine", "citrulline", "beta-alanine", "beta alanine", "carnitine", "hmb")) {
    return has("carnitine", "lipo", "burn") ? "fat-burner" : "amino-acids";
  }
  if (has("pre-workout", "pre workout", "preworkout", "pump", "nitric", "energy drink", "intra")) return "pre-workout";
  if (has("hydration", "electrolyt")) return "electrolytes";
  if (has("omega", "fish oil", "krill", "cod liver")) return "fish-oil";
  if (has("fat burn", "burner", "lipo", "cla", "thermo", "slim", "weight loss", "garcinia")) return "fat-burner";
  if (has("multivit", "multi vit", "vitamin", "biotin", "zinc", "magnesium", "b12", "zma")) return "vitamins";
  if (has("greens", "spirulina", "superfood", "wheatgrass", "moringa")) return "greens";
  return "wellness";
}

async function fetchAll(domain) {
  const out = [];
  let currency = "INR";
  for (let page = 1; page <= 30; page++) {
    const url = `${domain}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (catalog importer)" } });
    if (!r.ok) break;
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    if (page === 1 && batch[0]?.prices?.currency_code) currency = batch[0].prices.currency_code;
    out.push(...batch);
    if (batch.length < 100) break;
    await new Promise(res => setTimeout(res, 250));
  }
  return { products: out, currency };
}

async function mergeBrands(additions) {
  const doc = await SiteSetting.findOne({ key: "catalog.brands" }).lean();
  const current = doc?.value || [];
  const seen = new Set(current.map(b => b.id));
  const merged = [...current];
  for (const a of additions) if (!seen.has(a.id)) { merged.push(a); seen.add(a.id); }
  await SiteSetting.findOneAndUpdate(
    { key: "catalog.brands" },
    { key: "catalog.brands", category: "catalog", value: merged, updatedBy: "import-woo-multi" },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length ? BRANDS.filter(b => only.includes(b.id)) : BRANDS;

  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.\n");

  await mergeBrands(targets.map(b => ({
    id: b.id, name: b.name,
    initials: b.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    color: b.color, desc: `${b.name} — imported catalogue`
  })));

  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  const summary = [];
  for (const brand of targets) {
    process.stdout.write(`\n=== ${brand.name} — fetching...`);
    let products, currency;
    try {
      ({ products, currency } = await fetchAll(brand.domain));
    } catch (e) {
      console.log(` FAILED: ${e.message}`);
      summary.push({ brand: brand.name, error: e.message });
      continue;
    }
    console.log(` ${products.length} products (${currency})`);

    let created = 0, updated = 0, skipped = 0;
    const catCount = {};
    for (const p of products) {
      if (p.type === "variation" || p.parent) continue;
      const name = clean(p.name);
      const minor = p.prices?.currency_minor_unit ?? 2;
      const div = Math.pow(10, minor);
      const price = toInr(Number(p.prices?.price || 0) / div, currency);
      if (!name || price <= 0) { skipped++; continue; }

      const reg = toInr(Number(p.prices?.regular_price || 0) / div, currency);
      const mrp = reg > price ? reg : price;
      const discountPercent = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
      const cats = (p.categories || []).map(c => clean(c.name));
      const category = categoryFor(name, cats);
      catCount[category] = (catCount[category] || 0) + 1;
      const images = (p.images || []).map(i => i.src).filter(Boolean);
      const desc = stripHtml(p.description || p.short_description);
      const short = stripHtml(p.short_description) ||
        desc.split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 200) || name;

      // Never let one brand's slug overwrite another brand's product.
      let slug = slugify(p.slug || name);
      const clash = await Product.findOne({ slug, brand: { $ne: brand.id } }).select("_id").lean();
      if (clash) slug = `${slug}-${brand.id}`;
      const existing = await Product.findOne({ slug }).select("catalogId").lean();
      const catalogId = existing?.catalogId || nextId;

      const doc = {
        catalogId, name, slug, sku: `MT-${catalogId}`, barcode: `8904${String(catalogId).padStart(6, "0")}`,
        category, brand: brand.id, description: desc, shortDescription: short.slice(0, 200),
        badge: discountPercent >= 20 ? "Deal" : "", color: brand.color, deal: discountPercent >= 20,
        usageInstructions: "Use as directed on the label.", warnings: "Read the product label before use.",
        images, galleryImages: images, mrp, sellingPrice: price, discountPercent,
        stock: 25, rating: Number(p.average_rating) || 4.6, reviewCount: p.review_count || 0,
        trending: discountPercent >= 20, newArrival: true, flavor: "",
        tags: [brand.name, category, ...cats].filter(Boolean),
        seoTitle: `${name} - ${brand.name}`.slice(0, 120), seoDescription: short.slice(0, 200),
        seoKeywords: [brand.name, category].filter(Boolean), status: "active"
      };
      await Product.findOneAndUpdate({ slug }, doc, { upsert: true, setDefaultsOnInsert: true });
      if (existing) updated++; else { created++; nextId++; }
    }
    console.log(`   created ${created}, updated ${updated}, skipped ${skipped}`);
    console.log("   categories:", Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", "));
    summary.push({ brand: brand.name, created, updated, skipped, total: products.length });
  }

  console.log("\n===== SUMMARY =====");
  for (const s of summary) {
    if (s.error) console.log(`  ${s.brand}: FAILED — ${s.error}`);
    else console.log(`  ${s.brand}: ${s.created} new, ${s.updated} upd, ${s.skipped} skip (of ${s.total})`);
  }
  console.log("Total products in DB now:", await Product.countDocuments());
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
