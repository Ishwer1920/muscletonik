// Targeted re-fetch of the Kevin Levro pages that Cloudflare throttled during the
// bulk image fix. Reads scratch_fix15b.txt (URL list at project root), fetches
// each slowly with browser headers, and updates the real product image in the DB
// (matched by slugify(page name)). Also captures flavour names when present.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIST = path.resolve(__dirname, "../../scratch_fix15b.txt");

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const slugify = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function get(url) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
          "Referer": "https://levrosupplements.com/gb/"
        }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) { if (i === 4) throw e; await new Promise(r => setTimeout(r, 1500 * i)); }
  }
}
function jsonLd(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) { try { const j = JSON.parse(m[1]); if (j["@type"] === "Product") return j; } catch {} }
  return null;
}
function realImage(html, ld) {
  const bad = u => !u || /gb-default|\/img\/p\//.test(u);
  const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  const ldImg = ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image);
  let pick = !bad(og) ? og : (!bad(ldImg) ? ldImg : "");
  return pick ? pick.replace("-home_default/", "-large_default/") : "";
}
function flavourNames(html) {
  const dec = html.replace(/&quot;/g, '"').replace(/\\\//g, "/");
  return [...new Set([...dec.matchAll(/"name":"([^"]+)","group":"Flavour"/g)].map(m => clean(m[1])))].filter(Boolean);
}

async function main() {
  const urls = fs.readFileSync(LIST, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  await mongoose.connect(env.mongoUri);
  console.log(`Fixing ${urls.length} pages...\n`);
  let fixed = 0, flav = 0, miss = 0;
  for (const url of urls) {
    let html;
    try { html = await get(url); } catch (e) { console.log("  FETCH FAIL", url.split("/").pop(), e.message); miss++; continue; }
    const ld = jsonLd(html);
    const name = clean(ld?.name || (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || "");
    const img = realImage(html, ld);
    const flavs = flavourNames(html);
    const slug = slugify(name);
    const doc = await Product.findOne({ brand: "kevin-levrone", slug }).select("_id").lean();
    if (!doc || !img) { console.log("  no match/img:", name || url.split("/").pop(), "| img:", img ? "yes" : "no"); miss++; continue; }
    const update = { images: [img], galleryImages: [img] };
    if (flavs.length >= 2) { update.flavors = flavs.map(n => ({ name: n, image: img })); flav++; }
    await Product.updateOne({ _id: doc._id }, { $set: update });
    fixed++;
    console.log(`  fixed: ${name}  (${img.split("/").pop()})${flavs.length >= 2 ? "  +" + flavs.length + " flavours" : ""}`);
    await new Promise(r => setTimeout(r, 1300));
  }
  console.log(`\nDone. fixed ${fixed}, flavour-lists ${flav}, unresolved ${miss}`);
  console.log("Still placeholder:", await Product.countDocuments({ brand: "kevin-levrone", images: { $elemMatch: { $regex: "gb-default|/img/p/" } } }));
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
