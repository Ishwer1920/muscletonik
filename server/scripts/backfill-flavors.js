// Backfill the per-flavour image map onto already-imported Shopify products, so
// the product page can swap the main photo when a shopper picks a flavour.
// Re-fetches each store's products.json and updates only the `flavors` field on
// the matching DB doc (matched by brand + slug). Safe to re-run.
//   node scripts/backfill-flavors.js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";

// brandId -> storefront domain (all Shopify). Includes g4e (gainz4ever).
const STORES = {
  "g4e": "https://gainz4ever.com",
  "gaspari": "https://gasparinutrition.com",
  "ronnie-coleman": "https://ronniecoleman.net",
  "labrada": "https://labradanutrition.in",
  "scitron": "https://scitron.com",
  "muscletech": "https://www.muscletech.com",
  "gat": "https://gatsport.com",
  "one-science": "https://onesciencenutrition.in",
  "guardian": "https://www.guardian.in",
  "allmax": "https://www.allmaxnutrition.com",
  "pure-nutrition": "https://purenutrition.in",
  "rule-one": "https://www.ruleoneproteins.com",
  "basic": "https://basicsupplements.com",
  "fb-nutrition": "https://fbnutrition.com",
  "animal": "https://de.animalpak.com",
  "absolute": "https://www.absolutenutrition.co.in"
};

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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

async function fetchAll(domain) {
  const all = [];
  for (let page = 1; page <= 40; page++) {
    let batch = [];
    for (let t = 1; t <= 3; t++) {
      try {
        const r = await fetch(`${domain}/products.json?limit=250&page=${page}`, { headers: { "User-Agent": "Mozilla/5.0 (flavor backfill)" } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        batch = (await r.json()).products || [];
        break;
      } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 700 * t)); }
    }
    all.push(...batch);
    if (batch.length < 250) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return all;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.\n");
  let totalUpdated = 0, totalWithFlavors = 0;
  for (const [brandId, domain] of Object.entries(STORES)) {
    let products;
    try { products = await fetchAll(domain); }
    catch (e) { console.log(`${brandId}: FETCH FAILED ${e.message}`); continue; }
    let updated = 0, withFlavors = 0;
    for (const p of products) {
      const flavors = flavorsFrom(p);
      if (!flavors.length) continue;
      withFlavors++;
      const base = slugify(p.handle || p.title);
      // The doc's slug is either the base handle or base + "-<brandId>" (set when
      // a slug clashed across brands at import time).
      const res = await Product.updateOne(
        { brand: brandId, slug: { $in: [base, `${base}-${brandId}`] } },
        { $set: { flavors } }
      );
      if (res.modifiedCount || res.matchedCount) updated++;
    }
    console.log(`${brandId.padEnd(16)} products=${products.length}  with-flavors=${withFlavors}  matched&set=${updated}`);
    totalUpdated += updated; totalWithFlavors += withFlavors;
  }
  console.log(`\nDone. Products with flavours: ${totalWithFlavors}, DB docs updated: ${totalUpdated}`);
  const sample = await Product.findOne({ "flavors.1": { $exists: true } }).select("name brand flavors").lean();
  if (sample) console.log(`Sample: ${sample.name} [${sample.brand}] -> ${sample.flavors.length} flavours, first img: ${sample.flavors[0].image?.slice(0, 60)}`);
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
