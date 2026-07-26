// Creates the three digital plan products sold from the BMI calculator.
// Idempotent: upserts by slug, so re-running just refreshes pricing/copy.
//   node scripts/seed-plans.js
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { Product } from "../src/models/product.model.js";
import { SiteSetting } from "../src/models/site-setting.model.js";

const BRAND = {
  id: "muscle-tonik",
  name: "Muscle Tonik",
  initials: "MT",
  color: "#ff7a00",
  desc: "Muscle Tonik — in-house plans"
};

const CATEGORY = { id: "plans", name: "Diet & Workout Plans", icon: "bolt" };

const PLANS = [
  {
    slug: "personalised-diet-plan",
    planType: "diet",
    name: "Personalised Diet Plan",
    price: 199,
    mrp: 499,
    short: "A diet plan built around your BMI — calorie and protein targets plus a full day of eating.",
    desc: "A structured diet plan generated from your own BMI, height and weight. Includes your " +
      "calorie target, protein target, what to focus on, and a complete day of eating designed for " +
      "Indian meal patterns. Delivered instantly as a downloadable PDF and image after payment, and " +
      "saved to your account for life."
  },
  {
    slug: "personalised-workout-plan",
    planType: "workout",
    name: "Personalised Workout Plan",
    price: 199,
    mrp: 499,
    short: "A weekly training split matched to your BMI and goal, with sets, reps and progression.",
    desc: "A weekly training plan matched to your BMI band and goal. Includes your weekly split, " +
      "session-by-session exercises with sets and reps, cardio guidance, and how to progress week to " +
      "week. Delivered instantly as a downloadable PDF and image after payment, and saved to your " +
      "account for life."
  },
  {
    slug: "diet-workout-combo-plan",
    planType: "both",
    name: "Diet + Workout Plan (Combo)",
    price: 299,
    mrp: 998,
    short: "Both plans together — diet and training aligned to the same goal. Best value.",
    desc: "Both the personalised diet plan and the personalised workout plan, generated together " +
      "from the same BMI so your eating and training pull in the same direction. Delivered instantly " +
      "as a downloadable PDF and image after payment, and saved to your account for life."
  }
];

// A neutral placeholder so plan cards and cart rows are never image-less.
const PLAN_IMAGE = "/uploads/plan-cover.svg";

async function mergeSetting(key, additions, keyOf) {
  const doc = await SiteSetting.findOne({ key }).lean();
  const current = doc?.value || [];
  const seen = new Set(current.map(keyOf));
  const merged = [...current];
  for (const a of additions) if (!seen.has(keyOf(a))) merged.push(a);
  await SiteSetting.findOneAndUpdate(
    { key }, { key, category: "catalog", value: merged, updatedBy: "seed-plans" },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log("MongoDB connected.\n");

  await mergeSetting("catalog.brands", [BRAND], b => b.id);
  await mergeSetting("catalog.categories", [CATEGORY], c => c.id);

  const maxDoc = await Product.findOne().sort({ catalogId: -1 }).select("catalogId").lean();
  let nextId = (maxDoc?.catalogId || 0) + 1;

  for (const p of PLANS) {
    const existing = await Product.findOne({ slug: p.slug }).select("catalogId").lean();
    const catalogId = existing?.catalogId || nextId;

    await Product.findOneAndUpdate({ slug: p.slug }, {
      catalogId, slug: p.slug, sku: `MT-${catalogId}`,
      name: p.name, category: CATEGORY.id, brand: BRAND.id,
      description: p.desc, shortDescription: p.short,
      mrp: p.mrp, sellingPrice: p.price,
      discountPercent: Math.round((1 - p.price / p.mrp) * 100),
      images: [PLAN_IMAGE], galleryImages: [PLAN_IMAGE],
      color: BRAND.color, badge: p.planType === "both" ? "Best Value" : "",
      // Digital: no shipping, never stock-reserved. Stock is nominal so any
      // stock check that does run can never fail.
      digital: true, hidden: true, planType: p.planType, stock: 999999,
      rating: 4.8, reviewCount: 0, deal: true,
      usageInstructions: "Delivered as a download immediately after payment and saved to My Plans.",
      warnings: "General wellness guidance only — not medical advice. Consult a doctor or registered dietitian.",
      tags: ["plan", p.planType, "digital"],
      seoTitle: p.name, seoDescription: p.short,
      status: "active"
    }, { upsert: true, setDefaultsOnInsert: true });

    console.log(`${existing ? "updated" : "created"}  id=${catalogId}  ${p.name}  Rs ${p.price}`);
    if (!existing) nextId++;
  }

  console.log("\nPlan products:");
  const rows = await Product.find({ planType: { $ne: "" } })
    .select("catalogId name sellingPrice planType digital hidden").lean();
  rows.forEach(r => console.log(`  id=${r.catalogId} ${r.name.padEnd(34)} Rs ${String(r.sellingPrice).padStart(4)}  ${r.planType}  digital=${r.digital} hidden=${r.hidden}`));

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
