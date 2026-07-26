import { Product } from "../models/product.model.js";
import {
  GOALS,
  REVIEWS,
  TRANSFORMATIONS,
  HERO_SLIDES,
  discountPct
} from "../data/catalog.js";
import { getBrands, getCategories } from "./taxonomy.service.js";
import { SiteSetting } from "../models/site-setting.model.js";
import { Review } from "../models/review.model.js";
import { CmsContent } from "../models/cms-content.model.js";

// Map a MongoDB Product document to the exact shape the storefront (js/data.js)
// expects, so the site renders identically whether a product was seeded or
// created/edited in the admin panel. MongoDB is the single source of truth;
// BRANDS/CATEGORIES/GOALS etc. remain reference lookups from the seed file.
function mapProduct(p) {
  return {
    id: p.catalogId,
    name: p.name,
    brand: p.brand,
    category: p.category,
    price: p.sellingPrice,
    oldPrice: p.mrp,
    rating: p.rating,
    reviews: p.reviewCount,
    badge: p.badge || "",
    color: p.color || "#111111",
    featured: Boolean(p.featured),
    deal: Boolean(p.deal),
    digital: Boolean(p.digital),
    hidden: Boolean(p.hidden),
    planType: p.planType || "",
    short: p.shortDescription || "",
    protein: p.protein || "",
    servings: p.servings || 0,
    calories: p.calories || 0,
    flavor: p.flavor || "",
    weight: p.weight || "",
    desc: p.description || "",
    ingredients: p.ingredients || "",
    images: Array.isArray(p.images) ? p.images : [],
    galleryImages: Array.isArray(p.galleryImages) ? p.galleryImages : [],
    flavors: Array.isArray(p.flavors) ? p.flavors.filter(f => f && f.name).map(f => ({ name: f.name, image: f.image || "" })) : [],
    stock: p.stock,
    status: p.status
  };
}

function firstNonEmpty(...candidates) {
  return candidates.find(value => Array.isArray(value) && value.length) || [];
}

// The admin Banners form edits ONE hero (headline, subheadline, button). It used
// to replace the whole carousel with that single slide, which left the hero with
// nothing to scroll. Instead, keep the full default slide list and let the admin
// copy customise the first slide, so the hero scrolls horizontally out of the box.
function applyHeroOverrides(hero) {
  const [first, ...rest] = HERO_SLIDES;
  if (!hero || !first) return HERO_SLIDES;
  return [
    {
      ...first,
      eyebrow: hero.eyebrow || first.eyebrow,
      title: hero.headline || first.title,
      copy: hero.subheadline || first.copy,
      cta1: {
        label: hero.buttonText || first.cta1.label,
        href: hero.buttonLink || first.cta1.href
      },
      cta2: first.cta2,
      accent: hero.alignment === "center" ? "dark" : first.accent
    },
    ...rest
  ];
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

async function activeProducts() {
  const docs = await Product.find({ status: "active" }).sort({ catalogId: 1 }).lean();
  return docs.map(mapProduct);
}

export async function getCatalog() {
  const [settingsDocs, reviewDocs, homepageDocs, brands, categories] = await Promise.all([
    SiteSetting.find().lean().catch(() => []),
    Review.find({ status: "approved" }).sort({ featured: -1, createdAt: -1 }).limit(12).lean().catch(() => []),
    CmsContent.find({ slug: "homepage" }).lean().catch(() => []),
    getBrands().catch(() => []),
    getCategories().catch(() => [])
  ]);
  const settings = settingsDocs.reduce((acc, doc) => {
    acc[doc.key] = doc.value;
    return acc;
  }, {});
  const homepage = homepageDocs[0] || {};
  const fallbackHeroSlides = applyHeroOverrides(homepage.hero);
  return {
    brands,
    categories,
    goals: GOALS,
    products: await activeProducts(),
    reviews: reviewDocs.length ? reviewDocs.map(r => ({
      name: r.customerName,
      tag: r.productName,
      rating: r.rating,
      text: r.text
    })) : REVIEWS,
    transformations: TRANSFORMATIONS,
    // An empty slides array is still truthy, so length-check before letting it
    // shadow the fallback — otherwise clearing every banner in the admin panel
    // would leave the storefront hero blank instead of reverting to the design.
    heroSlides: firstNonEmpty(homepage.hero?.slides, settings.homepage?.heroSlides, fallbackHeroSlides),
    homepageSections: homepage.sections || settings.homepage?.sections || [],
    homepageOrder: homepage.order || settings.homepage?.order || [],
    siteContent: {
      ...(settings.homepage || {}),
      sections: homepage.sections || settings.homepage?.sections || [],
      order: homepage.order || settings.homepage?.order || [],
      hero: homepage.hero || settings.homepage?.hero || {},
      brandStrip: homepage.brandStrip || settings.homepage?.brandStrip || []
    },
    siteSettings: settings.store || {}
  };
}

function sortProducts(list, sort) {
  const copy = [...list];
  switch (sort) {
    case "price-low": return copy.sort((a, b) => a.price - b.price);
    case "price-high": return copy.sort((a, b) => b.price - a.price);
    case "discount": return copy.sort((a, b) => discountPct(b.price, b.oldPrice) - discountPct(a.price, a.oldPrice));
    case "newest": return copy.sort((a, b) => b.id - a.id);
    default: return copy.sort((a, b) => b.reviews - a.reviews);
  }
}

// DB-backed search/filter/sort/paginate, returning the same { data, meta } shape.
export async function searchProducts(query = {}) {
  const categories = parseList(query.category || query.categories);
  const brands = parseList(query.brand || query.brands);
  const search = String(query.search || "").trim().toLowerCase();
  const minRating = Number(query.minRating || 0);
  const maxPrice = Number(query.maxPrice || Number.POSITIVE_INFINITY);
  const sort = String(query.sort || "popularity");
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 12));

  const [list0, allBrands, allCategories] = await Promise.all([
    activeProducts(),
    getBrands().catch(() => []),
    getCategories().catch(() => [])
  ]);
  let list = list0;
  list = list.filter(product => {
    // Hidden products (diet/workout plans) are sold only from the BMI section.
    // They must stay resolvable by id for the cart, but never appear in any
    // browse, search, category or brand listing.
    if (product.hidden) return false;
    if (categories.length && !categories.includes(product.category)) return false;
    if (brands.length && !brands.includes(product.brand)) return false;
    if (product.rating < minRating) return false;
    if (product.price > maxPrice) return false;
    if (search) {
      const brandName = allBrands.find(b => b.id === product.brand)?.name || "";
      const categoryName = allCategories.find(c => c.id === product.category)?.name || "";
      const haystack = `${product.name} ${brandName} ${categoryName} ${product.desc} ${product.ingredients}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sorted = sortProducts(list, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return { data: sorted.slice(start, start + limit), meta: { total, page, limit, totalPages } };
}

export async function getProductDetails(id) {
  const doc = await Product.findOne({ catalogId: Number(id), status: "active" }).lean();
  return doc ? mapProduct(doc) : null;
}

export async function getCatalogLookups() {
  const [brands, categories] = await Promise.all([getBrands(), getCategories()]);
  return { brands, categories };
}
