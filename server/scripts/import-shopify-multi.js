// Bulk importer for many Shopify storefronts -> MongoDB catalog. Each store
// becomes one brand; every product is classified into a storefront category and
// its price converted to INR (store currency read from the table below).
// Idempotent: upserts by slug, so re-running updates rather than duplicates.
//
//   node scripts/import-shopify-multi.js [brandId ...]
//
// With no args it imports every brand; pass ids to import a subset.
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";
import { getBrands, getCategories } from "../src/services/taxonomy.service.js";

// currency -> INR (approx, 2026)
const RATE = { INR: 1, USD: 86, EUR: 93, GBP: 108, CAD: 63, AUD: 57, PLN: 22 };

const BRANDS = [
  { id: "gaspari",        name: "Gaspari Nutrition",     domain: "https://gasparinutrition.com",     currency: "USD", color: "#e10600" },
  { id: "ronnie-coleman", name: "Ronnie Coleman",        domain: "https://ronniecoleman.net",        currency: "USD", color: "#1b1b1b" },
  { id: "labrada",        name: "Labrada Nutrition",     domain: "https://labradanutrition.in",      currency: "INR", color: "#0057b8" },
  { id: "scitron",        name: "Scitron",               domain: "https://scitron.com",              currency: "INR", color: "#00a651" },
  { id: "muscletech",     name: "MuscleTech",            domain: "https://www.muscletech.com",       currency: "USD", color: "#c8102e" },
  { id: "gat",            name: "GAT Sport",             domain: "https://gatsport.com",             currency: "USD", color: "#111111" },
  { id: "one-science",    name: "One Science Nutrition", domain: "https://onesciencenutrition.in",   currency: "INR", color: "#f47920" },
  { id: "guardian",       name: "Guardian",              domain: "https://www.guardian.in",          currency: "INR", color: "#7b2d8b" },
  { id: "allmax",         name: "ALLMAX Nutrition",      domain: "https://www.allmaxnutrition.com",  currency: "USD", color: "#ffcb05" },
  { id: "pure-nutrition", name: "Pure Nutrition",        domain: "https://purenutrition.in",         currency: "INR", color: "#4caf50" },
  { id: "rule-one",       name: "Rule One Proteins",     domain: "https://www.ruleoneproteins.com",  currency: "USD", color: "#e4002b" },
  { id: "basic",          name: "Basic Supplements",     domain: "https://basicsupplements.com",     currency: "USD", color: "#222222" },
  { id: "fb-nutrition",   name: "FB Nutrition",          domain: "https://fbnutrition.com",          currency: "INR", color: "#ed1c24" },
  { id: "animal",         name: "Animal",                domain: "https://de.animalpak.com",         currency: "EUR", color: "#231f20" },
  { id: "absolute",       name: "Absolute Nutrition",    domain: "https://www.absolutenutrition.co.in", currency: "INR", color: "#d81e05" },

  // --- batch 3 (2026-07-21). Currencies were verified against raw variant
  // prices, not just Shopify.currency.active, which reports the *presentment*
  // currency and can differ from what products.json actually returns.
  { id: "absn",             name: "ABSN",                   domain: "https://apexsupplements.in",           currency: "INR", color: "#0a2540", collection: "absn" },
  { id: "applied-nutrition", name: "Applied Nutrition",     domain: "https://appliednutrition.uk",          currency: "GBP", color: "#000000" },
  { id: "ans-performance",  name: "ANS Performance",        domain: "https://www.ansperformance.com",       currency: "CAD", color: "#e4002b" },
  { id: "big-muscles",      name: "Big Muscles Nutrition",  domain: "https://www.bigmusclesnutrition.com",  currency: "INR", color: "#d32f2f" },
  { id: "bpi-sports",       name: "BPI Sports",             domain: "https://bpisports.in",                 currency: "INR", color: "#0093d0" },
  { id: "bsn",              name: "BSN",                    domain: "https://www.gobsn.com",                currency: "USD", color: "#003da5" },
  { id: "cellucor",         name: "Cellucor",               domain: "https://cellucor.com",                 currency: "USD", color: "#ed1c24" },
  { id: "condemned-labz",   name: "Condemned Labz",         domain: "https://condemnedlabz.com",            currency: "USD", color: "#1a1a1a" },
  { id: "isopure",          name: "Isopure",                domain: "https://www.theisopurecompany.com",    currency: "USD", color: "#00a0df" },
  { id: "jym",              name: "JYM Supplement Science", domain: "https://jymsupplementscience.com",     currency: "USD", color: "#e31837" },
  { id: "mutant",           name: "Mutant",                 domain: "https://mutantnation.com",             currency: "INR", color: "#7ac143" },
  { id: "nutrex",           name: "Nutrex Research",        domain: "https://nutrex.com",                   currency: "USD", color: "#f7941e" },
  { id: "optimum-nutrition", name: "Optimum Nutrition",     domain: "https://www.optimumnutrition.co.in",   currency: "INR", color: "#d4001a" },
  { id: "pintola",          name: "Pintola",                domain: "https://pintola.in",                   currency: "INR", color: "#8b5a2b" },
  { id: "prosupps",         name: "ProSupps",               domain: "https://prosuppsindia.com",            currency: "INR", color: "#c8102e" },
  { id: "redcon1",          name: "REDCON1",                domain: "https://redcon1.com",                  currency: "USD", color: "#111111" },
  { id: "star-labs",        name: "Star Labs",              domain: "https://starlabsfrance.fr",            currency: "EUR", color: "#1e88e5" }
];

// Categories this run may introduce on top of the existing storefront taxonomy.
const EXTRA_CATEGORIES = [
  { id: "amino-acids", name: "Amino Acids", icon: "layers" },
  { id: "collagen", name: "Collagen", icon: "drop" },
  { id: "fat-burner", name: "Fat Burner", icon: "flame" },
  { id: "electrolytes", name: "Electrolytes", icon: "drop" },
  { id: "greens", name: "Greens & Superfoods", icon: "bowl" },
  { id: "plant-protein", name: "Plant Protein", icon: "flask" },
  { id: "wellness", name: "Wellness & Health", icon: "shield" },
  { id: "accessories", name: "Accessories & Merch", icon: "bag" },
  { id: "casein", name: "Casein Protein", icon: "flask" },
  { id: "test-booster", name: "Test Booster", icon: "bolt" },
  { id: "snacks", name: "Snacks & Foods", icon: "bar" }
];

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function stripHtml(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&reg;/g, "®").replace(/&trade;/g, "™")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function toInr(amount, currency) {
  const inr = Number(amount) * (RATE[currency] || 1);
  if (!Number.isFinite(inr) || inr <= 0) return 0;
  return Math.max(9, Math.round(inr / 10) * 10 - 1);
}

// Classify by title + product_type + tags. First match wins; specific first.
function categoryFor(title, ptype = "", tags = []) {
  const t = ` ${[title, ptype, (tags || []).join(" ")].join(" ").toLowerCase()} `;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has("t-shirt", "tshirt", "hoodie", "cap ", "shaker", "bottle", "gym bag", "apparel", "wrist", "belt", "sipper", "towel", "sleeve")) return "accessories";
  if (has("collagen")) return "collagen";
  if (has("casein", "micellar")) return "casein";
  if (has("mass gain", "gainer", "weight gainer")) return "mass-gainer";
  if (has("iso ", "isolate", "hydro whey", "hydrolyzed whey", "hydrolysed whey", "clear whey")) return "whey-protein";
  if (has("plant protein", "vegan protein", "pea protein", "soy protein")) return "plant-protein";
  if (has("whey", "protein blend")) return "whey-protein";
  if (has("cream of rice", "oats", "muesli")) return "oats";
  if (has("peanut butter", "almond butter")) return "peanut-butter";
  if (has("protein bar", "energy bar", "cookie", "wafer", "chips", "snack")) return has("bar") ? "protein-bars" : "snacks";
  if (has("creatine", "crea ")) return "creatine";
  if (has("bcaa")) return "bcaa";
  if (has("test booster", "testosterone", "test-", "tribulus", "d-aspartic", "shilajit", "ashwagandha booster")) return "test-booster";
  if (has("eaa", "amino", "glutamine", "leucine", "arginine", "citrulline", "aakg", "beta-alanine", "beta alanine", "carnitine", "hmb")) {
    return has("carnitine", "lipo", "burn", " cut ") ? "fat-burner" : "amino-acids";
  }
  if (has("pre-workout", "pre workout", "preworkout", "pump", "nitric", "energy drink", "endurance")) return "pre-workout";
  if (has("hydration", "electrolyt", "eaa hydration")) return "electrolytes";
  if (has("omega", "fish oil", "krill", "flaxseed", "cod liver")) return "fish-oil";
  if (has("fat burn", "burner", "lipo", "l-carnitine", "cla", "thermo", "slim", "weight loss", "green coffee", "garcinia")) return "fat-burner";
  if (has("multivit", "multi vit", "vitamin", "biotin", "zinc", "magnesium", "calcium", "iron", "b12", "vit-", "zma")) return "vitamins";
  if (has("greens", "spirulina", "superfood", "wheatgrass", "moringa", "chlorella")) return "greens";
  // health/wellness catch-all: joint, liver, sleep, probiotic, gut, hair/skin/nail,
  // immunity, apple cider, digestion, glucosamine, melatonin, etc.
  return "wellness";
}

// Build a flavour -> image list from a Shopify product's variants + images.
// Each variant's option value (the one on the "Flavour" option) maps to its
// featured image (variant.image_id), falling back to any image tagged with that
// variant, then the product's main image. Returns [] unless there are >=2.
function flavorsFrom(product) {
  const opts = product.options || [];
  const idx = opts.findIndex(o => /flavou?r|taste/i.test(o.name || ""));
  if (idx < 0) return [];
  const key = `option${idx + 1}`;
  const imgById = new Map((product.images || []).map(im => [im.id, im.src]));
  const imgByVariant = new Map();
  for (const im of product.images || []) for (const vid of (im.variant_ids || [])) imgByVariant.set(vid, im.src);
  const mainImg = product.images?.[0]?.src || "";
  const seen = new Map();
  for (const v of product.variants || []) {
    const name = clean(v[key]);
    if (!name || seen.has(name)) continue;
    const image = (v.image_id && imgById.get(v.image_id)) || imgByVariant.get(v.id) || mainImg;
    seen.set(name, { name, image });
  }
  const list = [...seen.values()];
  return list.length >= 2 ? list : [];
}

async function fetchJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (catalog importer)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await new Promise(res => setTimeout(res, 700 * i));
    }
  }
}

// `collection` scopes the import to one Shopify collection instead of the whole
// store. Needed for multi-brand retailers, where importing everything would file
// dozens of unrelated brands under a single brand id.
async function fetchAllProducts(domain, collection) {
  const base = collection
    ? `${domain}/collections/${collection}/products.json`
    : `${domain}/products.json`;
  const all = [];
  for (let page = 1; page <= 40; page++) {
    const j = await fetchJson(`${base}?limit=250&page=${page}`);
    const batch = j.products || [];
    all.push(...batch);
    if (batch.length < 250) break;
    await new Promise(r => setTimeout(r, 250));
  }
  return all;
}

async function mergeSetting(key, additions, keyOf) {
  const doc = await SiteSetting.findOne({ key }).lean();
  const current = doc?.value || [];
  const seen = new Set(current.map(keyOf));
  const merged = [...current];
  for (const a of additions) if (!seen.has(keyOf(a))) { merged.push(a); seen.add(keyOf(a)); }
  await SiteSetting.findOneAndUpdate(
    { key }, { key, category: "catalog", value: merged, updatedBy: "import-shopify-multi" },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return merged;
}

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length ? BRANDS.filter(b => only.includes(b.id)) : BRANDS;

  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.\n");

  await mergeSetting("catalog.brands",
    targets.map(b => ({ id: b.id, name: b.name, initials: b.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(), color: b.color, desc: `${b.name} — imported catalogue` })),
    b => b.id);
  await mergeSetting("catalog.categories", EXTRA_CATEGORIES, c => c.id);

  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  const summary = [];
  for (const brand of targets) {
    process.stdout.write(`\n=== ${brand.name} (${brand.currency}) — fetching...`);
    let products;
    try { products = await fetchAllProducts(brand.domain, brand.collection); }
    catch (e) { console.log(` FAILED: ${e.message}`); summary.push({ brand: brand.name, error: e.message }); continue; }
    console.log(` ${products.length} products`);

    let created = 0, updated = 0, skipped = 0;
    const catCount = {};
    for (const p of products) {
      const name = clean(p.title);
      const variants = p.variants || [];
      const v0 = variants[0] || {};
      const price = toInr(v0.price, brand.currency);
      if (!name || price <= 0) { skipped++; continue; }
      const compare = toInr(v0.compare_at_price, brand.currency);
      const mrp = compare > price ? compare : price;
      const discountPercent = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
      const category = categoryFor(name, p.product_type, p.tags);
      catCount[category] = (catCount[category] || 0) + 1;
      const images = (p.images || []).map(i => i.src).filter(Boolean);
      const desc = stripHtml(p.body_html);
      const short = desc.split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 200) || name;

      let slug = slugify(p.handle || name);
      const clash = await Product.findOne({ slug, brand: { $ne: brand.id } }).select("_id").lean();
      if (clash) slug = `${slug}-${brand.id}`;
      const existing = await Product.findOne({ slug }).select("catalogId").lean();
      const catalogId = existing?.catalogId || nextId;

      const doc = {
        catalogId, name, slug, sku: `MT-${catalogId}`,
        barcode: `8903${String(catalogId).padStart(6, "0")}`,
        category, brand: brand.id, description: desc, shortDescription: short,
        badge: discountPercent >= 20 ? "Deal" : "", color: brand.color, deal: discountPercent >= 20,
        usageInstructions: "Use as directed on the label.", warnings: "Read the product label before use.",
        images, galleryImages: images, flavors: flavorsFrom(p), mrp, sellingPrice: price, discountPercent,
        stock: 25, rating: 4.6, reviewCount: 0, trending: discountPercent >= 20, newArrival: true,
        weight: clean((p.product_type || "")), flavor: "",
        tags: [brand.name, category].filter(Boolean),
        seoTitle: `${name} - ${brand.name}`, seoDescription: short,
        seoKeywords: [brand.name, category].filter(Boolean), status: "active"
      };
      await Product.findOneAndUpdate({ slug }, doc, { upsert: true, setDefaultsOnInsert: true });
      if (existing) updated++; else { created++; nextId++; }
    }
    console.log(`   created ${created}, updated ${updated}, skipped ${skipped}`);
    console.log(`   categories: ${Object.entries(catCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(", ")}`);
    summary.push({ brand: brand.name, total: products.length, created, updated, skipped });
  }

  console.log("\n\n===== SUMMARY =====");
  for (const s of summary) console.log(s.error ? `  ${s.brand}: ERROR ${s.error}` : `  ${s.brand}: ${s.created} new, ${s.updated} upd, ${s.skipped} skip (of ${s.total})`);
  console.log("Total products in DB now:", await Product.countDocuments());
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
