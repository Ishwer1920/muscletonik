import { Router } from "express";
import {
  getAdminMe,
  getDashboardStats,
  listTeam,
  createTeamMember,
  createTeamValidators,
  updateTeamMember,
  updateTeamValidators,
  listAuditLogs
} from "../controllers/admin.controller.js";
import {
  listCustomers, getCustomer, updateCustomerStatus, customerStatusValidators,
  listInventory, adjustStock, stockValidators,
  getAnalytics, exportOrdersCsv
} from "../controllers/admin-manage.controller.js";
import {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  setProductStatus, productValidators, statusValidators
} from "../controllers/admin-products.controller.js";
import {
  listCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon,
  couponValidators, couponIdValidator
} from "../controllers/admin-coupons.controller.js";
import {
  listReviews, createReview, updateReview, deleteReview,
  reviewValidators, reviewIdValidator
} from "../controllers/admin-reviews.controller.js";
import {
  listSettings, getSetting, upsertSetting, deleteSetting,
  settingValidators
} from "../controllers/admin-site.controller.js";
import {
  getHomepageBuilder,
  saveHomepageBuilder,
  listHomepageVersions,
  rollbackHomepageVersion,
  deleteHomepageDraft,
  homepageValidators
} from "../controllers/admin-content.controller.js";
import {
  listTaxonomy, createBrand, updateBrandHandler, deleteBrand, createCategory, deleteCategory
} from "../controllers/admin-taxonomy.controller.js";
import { productImageUpload, uploadProductImages, bannerImageUpload, uploadBannerImages, brandLogoUpload, uploadBrandLogos } from "../controllers/admin-upload.controller.js";
import { requireAuth, requireAdminPanel, requirePermission } from "../middleware/auth.middleware.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdminPanel);

adminRouter.get("/me", getAdminMe);
adminRouter.get("/stats", requirePermission("dashboard"), getDashboardStats);

adminRouter.get("/team", requirePermission("team"), listTeam);
adminRouter.post("/team", requirePermission("team"), createTeamValidators, createTeamMember);
adminRouter.patch("/team/:id", requirePermission("team"), updateTeamValidators, updateTeamMember);

adminRouter.get("/products", requirePermission("products"), listProducts);
adminRouter.get("/products/:id", requirePermission("products"), getProduct);
adminRouter.post("/products", requirePermission("products"), productImageUpload, productValidators, createProduct);
adminRouter.patch("/products/:id/status", requirePermission("products"), statusValidators, setProductStatus);
adminRouter.patch("/products/:id", requirePermission("products"), productImageUpload, productValidators, updateProduct);
adminRouter.delete("/products/:id", requirePermission("products"), deleteProduct);

adminRouter.get("/taxonomy", requirePermission("products"), listTaxonomy);
adminRouter.post("/taxonomy/brands", requirePermission("products"), createBrand);
adminRouter.patch("/taxonomy/brands/:id", requirePermission("products"), updateBrandHandler);
adminRouter.delete("/taxonomy/brands/:id", requirePermission("products"), deleteBrand);
adminRouter.post("/taxonomy/categories", requirePermission("products"), createCategory);
adminRouter.delete("/taxonomy/categories/:id", requirePermission("products"), deleteCategory);

adminRouter.get("/customers", requirePermission("customers"), listCustomers);
adminRouter.get("/customers/:id", requirePermission("customers"), getCustomer);
adminRouter.patch("/customers/:id", requirePermission("customers"), customerStatusValidators, updateCustomerStatus);

adminRouter.get("/inventory", requirePermission("inventory"), listInventory);
adminRouter.patch("/inventory/:id/stock", requirePermission("inventory"), stockValidators, adjustStock);

adminRouter.get("/analytics", requirePermission("analytics"), getAnalytics);
adminRouter.get("/analytics/export", requirePermission("analytics"), exportOrdersCsv);

adminRouter.get("/coupons", requirePermission("coupons"), listCoupons);
adminRouter.get("/coupons/:id", requirePermission("coupons"), couponIdValidator, getCoupon);
adminRouter.post("/coupons", requirePermission("coupons"), couponValidators, createCoupon);
adminRouter.patch("/coupons/:id", requirePermission("coupons"), couponIdValidator, couponValidators, updateCoupon);
adminRouter.delete("/coupons/:id", requirePermission("coupons"), couponIdValidator, deleteCoupon);

adminRouter.get("/reviews", requirePermission("reviews"), listReviews);
adminRouter.post("/reviews", requirePermission("reviews"), reviewValidators, createReview);
adminRouter.patch("/reviews/:id", requirePermission("reviews"), reviewIdValidator, reviewValidators, updateReview);
adminRouter.delete("/reviews/:id", requirePermission("reviews"), reviewIdValidator, deleteReview);

adminRouter.get("/settings", requirePermission("settings"), listSettings);
adminRouter.get("/settings/:key", requirePermission("settings"), getSetting);
adminRouter.put("/settings/:key", requirePermission("settings"), settingValidators, upsertSetting);
adminRouter.delete("/settings/:key", requirePermission("settings"), deleteSetting);

adminRouter.get("/content/homepage", requirePermission("settings"), getHomepageBuilder);
adminRouter.put("/content/homepage", requirePermission("settings"), homepageValidators, saveHomepageBuilder);
adminRouter.delete("/content/homepage", requirePermission("settings"), deleteHomepageDraft);
adminRouter.get("/content/versions", requirePermission("settings"), listHomepageVersions);
adminRouter.post("/content/versions/:id/rollback", requirePermission("settings"), rollbackHomepageVersion);

adminRouter.post("/uploads/products", requirePermission("products"), productImageUpload, uploadProductImages);
adminRouter.post("/uploads/banners", requirePermission("settings"), bannerImageUpload, uploadBannerImages);
adminRouter.post("/uploads/brands", requirePermission("products"), brandLogoUpload, uploadBrandLogos);

adminRouter.get("/audit", requirePermission("audit_logs"), listAuditLogs);
