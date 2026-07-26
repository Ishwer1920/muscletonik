import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../../../public_html/js/data.js");

export const {
  BRANDS,
  CATEGORIES,
  GOALS,
  PRODUCTS,
  REVIEWS,
  TRANSFORMATIONS,
  HERO_SLIDES,
  getProductById,
  getBrandById,
  getCategoryById,
  formatINR,
  discountPct,
  bestSellingProducts,
  featuredProducts,
  dealProducts
} = shared;

export default shared;