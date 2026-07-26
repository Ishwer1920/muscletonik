// Fix Kevin Levro (levrosupplements.com / PrestaShop) products: the first import
// captured the "no-image" placeholder instead of the real photo. Re-scrape each
// product page for the real og:image and the flavour names, and update the DB.
// Note: PrestaShop serves ONE photo per product (no per-flavour images), so all
// flavours point at the same image — the flavour list is informational.
//   node scripts/fix-levrone-images.js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";

const SITEMAP = "https://levrosupplements.com/sitemap.xml";
const LINES = /\/(kevin-levrone-black-line|kevin-levrone-gold-line|kevin-levrone-silver-line|levrone-wellness-line|kevin-levrone-wellness-series|merch)\//;

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
          "Referer": "https://levrosupplements.com/gb/"
        }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { if (i === tries) throw e; await new Promise(r => setTimeout(r, 1500 * i)); }
  }
}

function jsonLd(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { try { const j = JSON.parse(m[1]); if (j["@type"] === "Product") return j; } catch {} }
  return null;
}

function realImage(html, ld) {
  const isBad = u => !u || /gb-default|\/img\/p\//.test(u);
  let og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  let ldImg = ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image);
  // prefer a real (non-placeholder) url; upgrade home_default -> large_default
  let pick = !isBad(og) ? og : (!isBad(ldImg) ? ldImg : "");
  if (pick) pick = pick.replace("-home_default/", "-large_default/");
  return pick;
}

// Full flavour list lives in the PrestaShop variant <select aria-label="Flavour">.
function flavourNames(html) {
  const sel = html.match(/<select[^>]*aria-label="Flavou?r"[^>]*>([\s\S]*?)<\/select>/i);
  if (!sel) return [];
  const opts = [...sel[1].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m => clean(m[1]));
  return [...new Set(opts)].filter(Boolean);
}

async function main() {
  console.log("Fetching sitemap...");
  const sm = await get(SITEMAP);
  const urls = [...new Set((sm.match(/https:\/\/levrosupplements\.com\/gb\/[^<]+\.html/g) || []))]
    .filter(u => LINES.test(u) && !/\/blog/.test(u));
  console.log(`Canonical product URLs: ${urls.length}`);

  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.\n");

  let fixedImg = 0, setFlav = 0, miss = 0, done = 0;
  for (const url of urls) {
    let html;
    try { html = await get(url); } catch { miss++; continue; }
    const ld = jsonLd(html);
    const name = clean(ld?.name || (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || "");
    if (!name) { miss++; continue; }
    const img = realImage(html, ld);
    const flavs = flavourNames(html);
    const slug = slugify(name);
    const doc = await Product.findOne({ brand: "kevin-levrone", slug }).select("_id images").lean();
    done++;
    if (!doc) { miss++; continue; }

    const update = {};
    if (img) { update.images = [img]; update.galleryImages = [img]; fixedImg++; }
    if (flavs.length >= 2 && img) { update.flavors = flavs.map(n => ({ name: n, image: img })); setFlav++; }
    if (Object.keys(update).length) await Product.updateOne({ _id: doc._id }, { $set: update });
    if (done % 10 === 0) process.stdout.write(`\r  processed ${done}/${urls.length}  `);
    await new Promise(r => setTimeout(r, 1200));
  }
  console.log(`\n\nDone. pages ${done}, images fixed ${fixedImg}, flavour-lists set ${setFlav}, unmatched ${miss}`);
  const still = await Product.countDocuments({ brand: "kevin-levrone", images: { $elemMatch: { $regex: "gb-default|/img/p/" } } });
  console.log("Kevin Levro still on placeholder:", still);
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
