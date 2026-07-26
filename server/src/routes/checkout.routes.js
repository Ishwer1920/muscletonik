import { Router } from "express";
import { checkoutValidators, createOrder, createSession, verifyPayment } from "../controllers/checkout.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const checkoutRouter = Router();

checkoutRouter.post("/session", requireAuth, checkoutValidators, createSession);
// Both online and COD go through /order + /verify. COD is not a separate
// endpoint: it is /order with paymentMode:"cod", which charges the 20% advance
// through Razorpay. There is deliberately no zero-payment COD route — that
// would let a client create confirmed orders without paying anything.
checkoutRouter.post("/order", requireAuth, checkoutValidators, createOrder);
checkoutRouter.post("/verify", requireAuth, verifyPayment);
