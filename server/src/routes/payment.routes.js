import { Router } from "express";
import { failureValidators, history, markFailure, refund, refundValidators } from "../controllers/payment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const paymentRouter = Router();

paymentRouter.get("/history", requireAuth, history);
paymentRouter.post("/failure", requireAuth, failureValidators, markFailure);
paymentRouter.post("/refund", requireAuth, refundValidators, refund);
