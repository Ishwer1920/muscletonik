import { Router } from "express";
import { listMyOrders, listAllOrders, updateOrderStatus, updateStatusValidators } from "../controllers/order.controller.js";
import { requireAuth, requirePermission } from "../middleware/auth.middleware.js";

export const orderRouter = Router();

// Customer: their own orders.
orderRouter.get("/", requireAuth, listMyOrders);

// Admin: all orders + status management (requires the "orders" permission).
orderRouter.get("/admin", requireAuth, requirePermission("orders"), listAllOrders);
orderRouter.patch("/admin/:id", requireAuth, requirePermission("orders"), updateStatusValidators, updateOrderStatus);
