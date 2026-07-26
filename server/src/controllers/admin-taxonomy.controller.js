import {
  getTaxonomy,
  addBrand,
  updateBrand,
  removeBrand,
  addCategory,
  removeCategory
} from "../services/taxonomy.service.js";
import { writeAudit } from "../utils/audit.js";

export async function listTaxonomy(req, res, next) {
  try {
    res.json(await getTaxonomy());
  } catch (err) { next(err); }
}

export async function createBrand(req, res, next) {
  try {
    const brand = await addBrand(req.body, req.auth?.email || "");
    await writeAudit(req, "brand.create", brand.id, brand);
    res.status(201).json({ message: "Brand added.", brand });
  } catch (err) { next(err); }
}

export async function updateBrandHandler(req, res, next) {
  try {
    const brand = await updateBrand(req.params.id, req.body, req.auth?.email || "");
    await writeAudit(req, "brand.update", brand.id, brand);
    res.json({ message: "Brand updated.", brand });
  } catch (err) { next(err); }
}

export async function deleteBrand(req, res, next) {
  try {
    const brand = await removeBrand(req.params.id, req.auth?.email || "");
    await writeAudit(req, "brand.delete", brand.id, brand);
    res.json({ message: "Brand deleted.", brand });
  } catch (err) { next(err); }
}

export async function createCategory(req, res, next) {
  try {
    const category = await addCategory(req.body, req.auth?.email || "");
    await writeAudit(req, "category.create", category.id, category);
    res.status(201).json({ message: "Category added.", category });
  } catch (err) { next(err); }
}

export async function deleteCategory(req, res, next) {
  try {
    const category = await removeCategory(req.params.id, req.auth?.email || "");
    await writeAudit(req, "category.delete", category.id, category);
    res.json({ message: "Category deleted.", category });
  } catch (err) { next(err); }
}
