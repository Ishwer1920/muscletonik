import { body, validationResult } from "express-validator";
import { SiteSetting } from "../models/site-setting.model.js";
import { CmsContent } from "../models/cms-content.model.js";
import { DraftVersion } from "../models/draft-version.model.js";
import { writeAudit } from "../utils/audit.js";

const DEFAULT_SECTIONS = [
  { id: "announcement", type: "announcement", title: "Announcement Bar", enabled: true, data: { text: "Free shipping above Rs 999", background: "#111111", color: "#ffffff" } },
  { id: "header", type: "header", title: "Header", enabled: true, data: { note: "Built from the global storefront header." } },
  { id: "hero", type: "hero", title: "Hero Banner", enabled: true, data: { headline: "Fuel Your Strength", subheadline: "Build your legacy with premium supplements.", buttonText: "Shop now", buttonLink: "/marketplace.html", alignment: "left", backgroundImage: "", backgroundVideo: "", overlay: 55, gradient: "linear-gradient(135deg,#111111,#2b2b2b)" } },
  { id: "categories", type: "categories", title: "Categories", enabled: true, data: { heading: "Categories", subheading: "Shop by goal" } },
  { id: "featured", type: "featured", title: "Featured Products", enabled: true, data: { heading: "Featured Products", subheading: "Hand-picked for performance", count: 8, sort: "popularity", columns: 4, showPrices: true, showRatings: true, showWishlist: true, showQuickView: true, showStock: true } },
  { id: "deals", type: "deals", title: "Deals", enabled: true, data: { heading: "Deals of the day", subheading: "High value picks", columns: 4 } },
  { id: "brands", type: "brands", title: "Brands", enabled: true, data: { heading: "Brands", subheading: "Trusted supplement names" } },
  { id: "collections", type: "collections", title: "Collections", enabled: true, data: { heading: "Collections", subheading: "Goal-based collections" } },
  { id: "testimonials", type: "testimonials", title: "Testimonials", enabled: true, data: { heading: "Testimonials", subheading: "What customers say" } },
  { id: "newsletter", type: "newsletter", title: "Newsletter", enabled: true, data: { heading: "Get 10% Off Your First Order", copy: "Join for early access to new launches and restocks." } },
  { id: "footer", type: "footer", title: "Footer", enabled: true, data: { note: "Premium supplements, direct to your routine." } }
];

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function normalizeSections(value) {
  const sections = Array.isArray(value) ? value : [];
  const byId = new Map(DEFAULT_SECTIONS.map(s => [s.id, clone(s)]));
  sections.forEach(section => {
    if (!section || !section.id) return;
    const base = byId.get(section.id) || clone(DEFAULT_SECTIONS.find(s => s.type === section.type) || DEFAULT_SECTIONS[0]);
    byId.set(section.id, {
      ...base,
      ...section,
      data: { ...(base.data || {}), ...(section.data || {}) }
    });
  });
  return Array.from(byId.values());
}

async function loadHomepage() {
  const [doc, legacy] = await Promise.all([
    CmsContent.findOne({ slug: "homepage" }).lean(),
    SiteSetting.findOne({ key: "homepage" }).lean()
  ]);
  if (doc) return doc;
  if (legacy?.value) return {
    slug: "homepage",
    name: "Homepage CMS",
    version: 1,
    sections: legacy.value.sections || clone(DEFAULT_SECTIONS),
    order: legacy.value.order || DEFAULT_SECTIONS.map(s => s.id),
    announcement: legacy.value.announcement || { text: "Free shipping above Rs 999", background: "#111111", color: "#ffffff", visible: true },
    hero: legacy.value.hero || DEFAULT_SECTIONS.find(s => s.type === "hero")?.data || {},
    brandStrip: legacy.value.brandStrip || [],
    footer: legacy.value.footer || { note: "Premium supplements, direct to your routine." }
  };
  return {
    slug: "homepage",
    name: "Homepage CMS",
    version: 1,
    sections: clone(DEFAULT_SECTIONS),
    order: DEFAULT_SECTIONS.map(s => s.id),
    announcement: { text: "Free shipping above Rs 999", background: "#111111", color: "#ffffff", visible: true },
    hero: DEFAULT_SECTIONS.find(s => s.type === "hero")?.data || {},
    brandStrip: [],
    footer: { note: "Premium supplements, direct to your routine." }
  };
}

async function syncLegacySetting(homepage, req) {
  await SiteSetting.findOneAndUpdate(
    { key: "homepage" },
    {
      key: "homepage",
      category: "content",
      value: {
        sections: homepage.sections,
        order: homepage.order,
        announcement: homepage.announcement,
        hero: homepage.hero,
        brandStrip: homepage.brandStrip,
        footer: homepage.footer
      },
      updatedBy: req.auth?.email || ""
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export const homepageValidators = [
  body("sections").optional().isArray().withMessage("Sections must be an array."),
  body("order").optional().isArray().withMessage("Order must be an array."),
  body("announcement").optional().isObject().withMessage("Announcement must be an object."),
  body("hero").optional().isObject().withMessage("Hero must be an object."),
  body("brandStrip").optional().isArray().withMessage("Brand strip must be an array."),
  body("footer").optional().isObject().withMessage("Footer must be an object.")
];

export async function getHomepageBuilder(req, res, next) {
  try {
    const [homepage, versions] = await Promise.all([
      loadHomepage(),
      DraftVersion.find({ contentSlug: "homepage" }).sort({ createdAt: -1 }).limit(12).lean()
    ]);
    res.json({ homepage, versions });
  } catch (err) { next(err); }
}

export async function saveHomepageBuilder(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const current = await loadHomepage();
    const sections = normalizeSections(req.body.sections || current.sections || DEFAULT_SECTIONS);
    const order = Array.isArray(req.body.order) && req.body.order.length ? req.body.order : sections.map(s => s.id);
    const homepage = {
      slug: "homepage",
      name: "Homepage CMS",
      version: Number(current.version || 0) + 1,
      sections,
      order,
      announcement: { ...(current.announcement || {}), ...(req.body.announcement || {}) },
      hero: { ...(current.hero || {}), ...(req.body.hero || {}) },
      brandStrip: Array.isArray(req.body.brandStrip) ? req.body.brandStrip : (current.brandStrip || []),
      footer: { ...(current.footer || {}), ...(req.body.footer || {}) },
      updatedBy: req.auth?.email || "",
      publishedAt: req.body.publish ? new Date() : current.publishedAt || null
    };
    const saved = await CmsContent.findOneAndUpdate(
      { slug: "homepage" },
      homepage,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await syncLegacySetting(saved, req);
    await DraftVersion.create({
      contentSlug: "homepage",
      kind: "homepage",
      snapshot: saved,
      createdBy: req.auth?.email || "",
      note: req.body.publish ? "Published homepage" : "Saved homepage draft",
      published: !!req.body.publish
    });
    await writeAudit(req, req.body.publish ? "content.publish" : "content.save", "homepage", { version: saved.version, order: saved.order });
    res.json({ message: req.body.publish ? "Homepage published." : "Homepage saved.", homepage: saved });
  } catch (err) { next(err); }
}

export async function listHomepageVersions(req, res, next) {
  try {
    const versions = await DraftVersion.find({ contentSlug: "homepage" }).sort({ createdAt: -1 }).lean();
    res.json({ versions });
  } catch (err) { next(err); }
}

export async function rollbackHomepageVersion(req, res, next) {
  try {
    const version = await DraftVersion.findById(req.params.id);
    if (!version) return res.status(404).json({ message: "Version not found" });
    const snapshot = version.snapshot || {};
    const saved = await CmsContent.findOneAndUpdate(
      { slug: "homepage" },
      {
        slug: "homepage",
        name: "Homepage CMS",
        version: Number(snapshot.version || 1) + 1,
        sections: snapshot.sections || DEFAULT_SECTIONS,
        order: snapshot.order || snapshot.sections?.map(s => s.id) || DEFAULT_SECTIONS.map(s => s.id),
        announcement: snapshot.announcement || {},
        hero: snapshot.hero || {},
        brandStrip: snapshot.brandStrip || [],
        footer: snapshot.footer || {},
        updatedBy: req.auth?.email || "",
        publishedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await syncLegacySetting(saved, req);
    await DraftVersion.create({
      contentSlug: "homepage",
      kind: "homepage",
      snapshot: saved,
      createdBy: req.auth?.email || "",
      note: "Rollback from version history",
      published: true
    });
    await writeAudit(req, "content.rollback", "homepage", { from: String(version._id), to: saved.version });
    res.json({ message: "Homepage rolled back.", homepage: saved });
  } catch (err) { next(err); }
}

export async function deleteHomepageDraft(req, res, next) {
  try {
    const doc = await CmsContent.findOne({ slug: "homepage" });
    if (!doc) return res.status(404).json({ message: "Homepage not found" });
    await doc.deleteOne();
    await SiteSetting.findOneAndUpdate(
      { key: "homepage" },
      { key: "homepage", category: "content", value: { sections: clone(DEFAULT_SECTIONS), order: DEFAULT_SECTIONS.map(s => s.id) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeAudit(req, "content.delete", "homepage", {});
    res.json({ message: "Homepage draft reset." });
  } catch (err) { next(err); }
}
