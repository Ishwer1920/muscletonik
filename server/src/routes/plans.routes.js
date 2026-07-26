import { Router } from "express";
import { myPlans, getPlan, claimFreePlans } from "../controllers/plans.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const plansRouter = Router();

// Entitlements are personal, so every route is auth-scoped to the caller.
plansRouter.get("/mine", requireAuth, myPlans);
// Must be declared before "/:id" or "claim-free" would be read as an id.
plansRouter.post("/claim-free", requireAuth, claimFreePlans);
plansRouter.get("/:id", requireAuth, getPlan);
