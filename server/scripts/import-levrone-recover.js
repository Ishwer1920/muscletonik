// Recover the one live Kevin Levrone product whose page lacks Product JSON-LD
// (Gold Maryland Muscle Machine). Built from its OpenGraph tags. Idempotent.
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";

const PLN_TO_INR = 22;
const toInr = pln => Math.max(9, Math.round(Math.round(pln * PLN_TO_INR) / 10) * 10 - 1);
const decode = s => String(s || "").replace(/\\&#0?39;|&#0?39;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const p = {
  name: "Gold Maryland Muscle Machine 385 g",
  slug: "gold-maryland-muscle-machine-385-g",
  category: "pre-workout",
  pricePln: 119,
  image: "https://levrosupplements.com/125-large_default/gold-maryland-muscle-machine-385-g.jpg",
  description: decode("LEVRONE MARYLAND MUSCLE MACHINE pre-workout supplement is a carefully prepared composition of a number of valuable active ingredients, which was created for recreational exercisers and professional athletes - especially admirers of strength and endurance disciplines. The supplement's formula is a combination of 5 valuable components (AAKG, beta-alanine, betaine, citrulline malate and caffeine) selected in the right proportions and obtained from high-end, tested raw materials. The product allows you to prepare a refreshing pre-workout drink that will work well during grueling workout sessions. The conditioner is recommended for men and women who love intense exercise and are looking for uncompromising support in the fight against increasing fatigue levels."),
  weight: "385 g"
};

async function main() {
  await mongoose.connect(env.mongoUri);
  const existing = await Product.findOne({ slug: p.slug }).select("catalogId").lean();
  if (existing) { console.log("Already present:", p.name); await mongoose.disconnect(); return; }
  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  const catalogId = (maxDoc?.catalogId || 0) + 1;
  const price = toInr(p.pricePln);
  await Product.create({
    catalogId, name: p.name, slug: p.slug, sku: `MT-${catalogId}`,
    barcode: `890200${String(catalogId).padStart(4, "0")}`,
    category: p.category, brand: "kevin-levrone",
    description: p.description, shortDescription: p.description.slice(0, 200),
    color: "#c9a227", images: [p.image], galleryImages: [p.image],
    mrp: price, sellingPrice: price, discountPercent: 0, stock: 25,
    rating: 4.7, reviewCount: 0, newArrival: true, weight: p.weight,
    usageInstructions: "Use as directed on the label.", warnings: "Read the product label before use.",
    tags: ["Kevin Levrone", p.category], seoTitle: `${p.name} - Kevin Levrone`,
    seoDescription: p.description.slice(0, 200), seoKeywords: ["Kevin Levrone", p.category, "kevin levrone"],
    status: "active"
  });
  console.log(`Added #${catalogId}: ${p.name} @ Rs${price}`);
  console.log("Total Kevin Levrone products:", await Product.countDocuments({ brand: "kevin-levrone" }));
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
