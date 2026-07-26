import { getCatalog, getCatalogLookups, getProductDetails, searchProducts } from "../services/catalog.service.js";

export async function catalog(req, res, next) {
  try {
    res.json(await getCatalog());
  } catch (err) { next(err); }
}

export async function catalogLookups(req, res, next) {
  try {
    res.json(await getCatalogLookups());
  } catch (err) { next(err); }
}

export async function products(req, res, next) {
  try {
    res.json(await searchProducts(req.query));
  } catch (err) { next(err); }
}

export async function productById(req, res, next) {
  try {
    const product = await getProductDetails(req.params.id);
    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }
    res.json(product);
  } catch (err) { next(err); }
}
