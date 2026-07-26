// One-off importer: scrape the Kevin Levrone catalogue from levrosupplements.com
// (PrestaShop) and add every product to the MongoDB catalog under a new brand.
// Product URLs come from scratch_canon.txt (extracted from the site sitemap:
// the canonical GB product lines — black / gold / silver / wellness / merch).
// Each product page carries a schema.org Product JSON-LD block we parse.
//
// Prices on the site are in PLN; we convert to INR (store currency).
//
//   node scripts/import-levrone.js
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";
import { getBrands, getCategories } from "../src/services/taxonomy.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URLS_FILE = path.resolve(__dirname, "../../scratch_canon.txt");

const BRAND = { id: "kevin-levrone", name: "Kevin Levrone", initials: "KL", color: "#c9a227", desc: "Kevin Levrone Signature Series — pro-grade sports nutrition" };
const PLN_TO_INR = 22;          // approximate 2026 conversion rate
const CONCURRENCY = 6;

const EXTRA_CATEGORIES = [
  { id: "amino-acids", name: "Amino Acids", icon: "layers" },
  { id: "fat-burner", name: "Fat Burner", icon: "flame" },
  { id: "electrolytes", name: "Electrolytes", icon: "drop" },
  { id: "wellness", name: "Wellness & Health", icon: "shield" },
  { id: "accessories", name: "Accessories & Merch", icon: "bag" }
];

function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function slugify(v) { return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

function stripHtml(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&reg;/g, "®").replace(/&trade;/g, "™").replace(/&deg;/g, "°")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

// Price feels retail if it ends in 9.
function toInr(pln) {
  const raw = Math.round(Number(pln) * PLN_TO_INR);
  return Math.max(9, Math.round(raw / 10) * 10 - 1);
}

// Pull a human weight/size from the product title (e.g. "385 g", "2 kg",
// "120 ml", "90 tablets"); fall back to the JSON-LD quantitative weight.
function weightFromTitle(title, ldWeight) {
  const m = /(\d[\d.,]*)\s*(kg|g|ml|l|tablets|tablet|capsules|caps|sachets|servings)\b/i.exec(title);
  if (m) return `${m[1].replace(",", ".")} ${m[2].toLowerCase()}`;
  if (ldWeight?.value) return `${Number(ldWeight.value)} ${ldWeight.unitCode || "kg"}`;
  return "";
}

function categoryFor(title) {
  const t = ` ${title.toLowerCase()} `;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has("t-shirt", "tshirt", "cap", "shaker", "hoodie", "logo")) return "accessories";
  if (has("iso whey", "iso-whey", "isolate")) return "whey-protein";
  if (has("mass")) return "mass-gainer";
  if (has("whey", "prime pro", "pro blend", "supreme")) return "whey-protein";
  if (has("cream of rice")) return "oats";
  if (has("bar")) return "protein-bars";
  if (has("creatine")) return "creatine";
  if (has("bcaa")) return "bcaa";
  if (has("eaa", "leaa", "amino", "glutamine", "l-carnitine", "carnitine")) {
    return has("carnitine", "lipo", "burn", "cut") ? "fat-burner" : "amino-acids";
  }
  if (has("pump", "shaaboom", "scatterbrain", "pre-workout", "pre workout", "on stage")) return "pre-workout";
  if (has("hydration", "electrolyt")) return "electrolytes";
  if (has("omega", "fish oil")) return "fish-oil";
  if (has("lipo", "burn", "cut", "l-carnitine")) return "fat-burner";
  if (has("vitamin", "vita ", "vita-", "multivit")) return "vitamins";
  // everything else health/wellness: test, flex, sleep, coq10, cla, ashwagandha,
  // digestion, eye shield, acid, glutamine caps, joint, liver...
  return "wellness";
}

function extractProduct(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1]);
      if (j && j["@type"] === "Product") return j;
    } catch { /* ignore malformed block */ }
  }
  return null;
}

// Gallery: PrestaShop embeds each product image as "large":{"url":"..."}.
function extractImages(html, ldImage) {
  const set = new Set();
  const re = /"large":\{"url":"([^"]+?\.jpg[^"]*?)"/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1].replace(/\\\//g, "/"));
  const list = [...set];
  if (list.length) return list;
  if (Array.isArray(ldImage)) return ldImage;
  if (ldImage) return [ldImage];
  return [];
}

async function fetchText(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (catalog importer)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries) throw err;
      await new Promise(r => setTimeout(r, 800 * i));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i).catch(err => ({ __error: err.message, url: items[i] }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  if (!fs.existsSync(URLS_FILE)) {
    console.error(`Missing ${URLS_FILE}. Build it from the sitemap first.`);
    process.exit(1);
  }
  const urls = fs.readFileSync(URLS_FILE, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  console.log(`Scraping ${urls.length} product pages...`);

  const scraped = await mapLimit(urls, CONCURRENCY, async (url, i) => {
    const html = await fetchText(url);
    const ld = extractProduct(html);
    if (!ld) throw new Error("no Product JSON-LD");
    const images = extractImages(html, ld.image);
    process.stdout.write(`\r  scraped ${i + 1}/${urls.length}   `);
    return {
      url,
      name: clean(ld.name),
      description: stripHtml(ld.description),
      line: clean(ld.category),
      sku: ld.sku ? String(ld.sku) : "",
      gtin: ld.gtin13 ? String(ld.gtin13) : "",
      pricePln: Number(ld.offers?.price || 0),
      weight: weightFromTitle(ld.name, ld.weight),
      images
    };
  });
  console.log("");

  const ok = scraped.filter(p => p && !p.__error && p.name && p.pricePln > 0);
  const failed = scraped.filter(p => !p || p.__error || !p.name || !(p.pricePln > 0));
  console.log(`Parsed OK: ${ok.length}, problems: ${failed.length}`);
  failed.forEach(f => console.log("  ! " + (f.__error || "no price/name") + " :: " + (f.url || "?")));

  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.");

  // Register brand (merge).
  const brands = await getBrands();
  if (!brands.some(b => b.id === BRAND.id)) {
    await SiteSetting.findOneAndUpdate(
      { key: "catalog.brands" },
      { key: "catalog.brands", category: "catalog", value: [...brands, BRAND], updatedBy: "import-levrone" },
      { upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`Added brand: ${BRAND.name}`);
  } else console.log(`Brand ${BRAND.name} already present.`);

  // Merge in any missing categories.
  const categories = await getCategories();
  const catIds = new Set(categories.map(c => c.id));
  const toAdd = EXTRA_CATEGORIES.filter(c => !catIds.has(c.id));
  if (toAdd.length) {
    await SiteSetting.findOneAndUpdate(
      { key: "catalog.categories" },
      { key: "catalog.categories", category: "catalog", value: [...categories, ...toAdd], updatedBy: "import-levrone" },
      { upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`Added categories: ${toAdd.map(c => c.id).join(", ")}`);
  }

  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  let created = 0, updated = 0;
  const catCount = {};
  for (const p of ok) {
    const category = categoryFor(p.name);
    catCount[category] = (catCount[category] || 0) + 1;
    const price = toInr(p.pricePln);
    const short = p.description.split("\n").map(s => s.trim()).find(Boolean)?.slice(0, 200) || p.name;

    let slug = slugify(p.name);
    const clash = await Product.findOne({ slug, brand: { $ne: BRAND.id } }).select("_id").lean();
    if (clash) slug = `${slug}-kl`;
    const existing = await Product.findOne({ slug }).select("catalogId").lean();
    const catalogId = existing?.catalogId || nextId;

    const doc = {
      catalogId, name: p.name, slug,
      sku: `MT-${catalogId}`,
      barcode: p.gtin && p.gtin.length >= 8 ? p.gtin : `890200${String(catalogId).padStart(4, "0")}`,
      category, brand: BRAND.id,
      description: p.description,
      shortDescription: short,
      badge: "", color: BRAND.color, deal: false,
      ingredients: "", nutritionFacts: "",
      usageInstructions: "Use as directed on the label.",
      warnings: "Read the product label before use.",
      images: p.images, galleryImages: p.images,
      mrp: price, sellingPrice: price, discountPercent: 0,
      stock: 25, rating: 4.7, reviewCount: 0,
      featured: false, trending: false, bestSeller: false, newArrival: true,
      weight: p.weight, flavor: "",
      tags: [BRAND.name, category, p.line].filter(Boolean),
      seoTitle: `${p.name} - ${BRAND.name}`,
      seoDescription: short,
      seoKeywords: [BRAND.name, category, "kevin levrone"].filter(Boolean),
      status: "active"
    };

    await Product.findOneAndUpdate({ slug }, doc, { upsert: true, setDefaultsOnInsert: true });
    if (existing) updated++; else { created++; nextId++; }
  }

  console.log(`\nDone. Created ${created}, updated ${updated}.`);
  console.log("Category distribution:", JSON.stringify(catCount, null, 1));
  console.log(`Total ${BRAND.name} products in DB:`, await Product.countDocuments({ brand: BRAND.id }));
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
