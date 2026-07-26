import { Router } from "express";
import { catalogRouter } from "./catalog.routes.js";
import { authRouter } from "./auth.routes.js";
import { checkoutRouter } from "./checkout.routes.js";
import { paymentRouter } from "./payment.routes.js";
import { orderRouter } from "./order.routes.js";
import { plansRouter } from "./plans.routes.js";
import { adminRouter } from "./admin.routes.js";

export const router = Router();

// API responses reflect live database state (product lists, orders, catalog).
// Express adds an ETag but no Cache-Control, which lets the browser heuristically
// cache GETs — so a product deleted in the admin panel could reappear from cache
// on refresh. Force every API response to be non-cacheable so the client always
// sees current data.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});

router.use("/catalog", catalogRouter);
router.use("/auth", authRouter);
router.use("/checkout", checkoutRouter);
router.use("/payments", paymentRouter);
router.use("/orders", orderRouter);
router.use("/plans", plansRouter);
router.use("/admin", adminRouter);
