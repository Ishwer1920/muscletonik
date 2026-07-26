import { SiteSetting } from "../models/site-setting.model.js";
import { Product } from "../models/product.model.js";
import { BRANDS, CATEGORIES } from "../data/catalog.js";

// Brands and categories used to be fixed lists baked into the seed file. They
// are now editable from the admin panel, so the live lists live in SiteSetting
// (MongoDB) and fall back to the seed defaults until an admin changes them.
// MongoDB stays the single source of truth for the storefront and admin alike.
const BRANDS_KEY = "catalog.brands";
const CATEGORIES_KEY = "catalog.categories";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initialsFrom(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

async function readList(key, fallback) {
  const doc = await SiteSetting.findOne({ key }).lean();
  if (doc && Array.isArray(doc.value) && doc.value.length) return doc.value;
  return fallback;
}

async function writeList(key, list, email = "") {
  await SiteSetting.findOneAndUpdate(
    { key },
    { key, category: "catalog", value: list, updatedBy: email },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return list;
}

export async function getBrands() {
  return readList(BRANDS_KEY, BRANDS);
}

export async function getCategories() {
  return readList(CATEGORIES_KEY, CATEGORIES);
}

export async function getTaxonomy() {
  const [brands, categories] = await Promise.all([getBrands(), getCategories()]);
  return { brands, categories };
}

export async function addBrand({ name, color, desc } = {}, email = "") {
  const clean = String(name || "").trim();
  if (!clean) throw Object.assign(new Error("Brand name is required."), { status: 400 });
  const id = slugify(clean);
  if (!id) throw Object.assign(new Error("Brand name must contain letters or numbers."), { status: 400 });
  const brands = await getBrands();
  if (brands.some(b => b.id === id)) {
    throw Object.assign(new Error("A brand with that name already exists."), { status: 409 });
  }
  const brand = {
    id,
    name: clean,
    initials: initialsFrom(clean),
    color: /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#111111",
    desc: String(desc || "").trim(),
    logo: ""
  };
  await writeList(BRANDS_KEY, [...brands, brand], email);
  return brand;
}

// Partial update of an existing brand. Only the fields present in `patch` are
// touched, so a logo upload can set just `logo` without disturbing name/color.
// Passing an empty-string logo clears the image (falls back to the initials mark).
export async function updateBrand(id, patch = {}, email = "") {
  const brands = await getBrands();
  const index = brands.findIndex(b => b.id === id);
  if (index === -1) throw Object.assign(new Error("Brand not found."), { status: 404 });
  const next = { ...brands[index] };
  if (typeof patch.name === "string" && patch.name.trim()) {
    next.name = patch.name.trim();
    next.initials = initialsFrom(next.name);
  }
  if (typeof patch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.color)) next.color = patch.color;
  if (typeof patch.desc === "string") next.desc = patch.desc.trim();
  if (typeof patch.logo === "string") next.logo = patch.logo.trim();
  const updated = [...brands];
  updated[index] = next;
  await writeList(BRANDS_KEY, updated, email);
  return next;
}

export async function removeBrand(id, email = "") {
  const brands = await getBrands();
  const brand = brands.find(b => b.id === id);
  if (!brand) throw Object.assign(new Error("Brand not found."), { status: 404 });
  const inUse = await Product.countDocuments({ brand: id });
  if (inUse > 0) {
    throw Object.assign(
      new Error(`Cannot delete "${brand.name}" - ${inUse} product(s) still use it. Move or delete those products first.`),
      { status: 409 }
    );
  }
  await writeList(BRANDS_KEY, brands.filter(b => b.id !== id), email);
  return brand;
}

export async function addCategory({ name, icon } = {}, email = "") {
  const clean = String(name || "").trim();
  if (!clean) throw Object.assign(new Error("Category name is required."), { status: 400 });
  const id = slugify(clean);
  if (!id) throw Object.assign(new Error("Category name must contain letters or numbers."), { status: 400 });
  const categories = await getCategories();
  if (categories.some(c => c.id === id)) {
    throw Object.assign(new Error("A category with that name already exists."), { status: 409 });
  }
  const category = { id, name: clean, icon: String(icon || "flask").trim() || "flask" };
  await writeList(CATEGORIES_KEY, [...categories, category], email);
  return category;
}

export async function removeCategory(id, email = "") {
  const categories = await getCategories();
  const category = categories.find(c => c.id === id);
  if (!category) throw Object.assign(new Error("Category not found."), { status: 404 });
  const inUse = await Product.countDocuments({ category: id });
  if (inUse > 0) {
    throw Object.assign(
      new Error(`Cannot delete "${category.name}" - ${inUse} product(s) still use it. Move or delete those products first.`),
      { status: 409 }
    );
  }
  await writeList(CATEGORIES_KEY, categories.filter(c => c.id !== id), email);
  return category;
}
