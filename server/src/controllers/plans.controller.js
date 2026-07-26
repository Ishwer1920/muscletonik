import { UserPlan } from "../models/user-plan.model.js";
import { normalizeBmiSnapshot } from "../services/checkout.service.js";

// Roles that get plans free. Deliberately narrower than ADMIN_PANEL_ROLES —
// staff and managers still pay, only admins and super admins are comped.
const FREE_PLAN_ROLES = ["admin", "super_admin"];

export function canClaimFreePlans(role) {
  return FREE_PLAN_ROLES.includes(String(role || ""));
}

function toDto(p) {
  return {
    id: String(p._id),
    kind: p.kind,
    orderNumber: p.orderNumber,
    source: p.source || "purchase",
    purchasedAt: p.createdAt,
    snapshot: p.snapshot
  };
}

// The signed-in customer's plans. Source of truth for "saved for lifetime" —
// the client renders from the stored snapshot, so access survives new devices,
// cleared storage and logouts.
export async function myPlans(req, res, next) {
  try {
    const plans = await UserPlan.find({ user: req.auth.sub }).sort({ createdAt: -1 }).lean();
    res.json({
      plans: plans.map(toDto),
      // Lets the UI offer "Unlock free" instead of "Pay" without a second call.
      canClaimFree: canClaimFreePlans(req.auth.role)
    });
  } catch (err) {
    next(err);
  }
}

// Single plan, scoped to the owner so one customer can't read another's by
// guessing an id.
export async function getPlan(req, res, next) {
  try {
    const plan = await UserPlan.findOne({ _id: req.params.id, user: req.auth.sub }).lean();
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan: toDto(plan) });
  } catch (err) {
    next(err);
  }
}

// Comp all plans to an admin / super admin, no payment. Role is read from the
// verified JWT (req.auth), never from the request body.
export async function claimFreePlans(req, res, next) {
  try {
    if (!canClaimFreePlans(req.auth.role)) {
      return res.status(403).json({ message: "Free plans are available to admin accounts only." });
    }

    const snapshot = normalizeBmiSnapshot(req.body && req.body.bmiSnapshot);
    if (!snapshot.bandId || !snapshot.bmi) {
      return res.status(400).json({
        message: "Enter your height and weight first so the plan can be generated."
      });
    }

    // A comped entitlement has no order, so (user, null, kind) is its key.
    // Upsert keeps repeat clicks from stacking duplicates.
    const granted = [];
    for (const kind of ["diet", "workout"]) {
      await UserPlan.findOneAndUpdate(
        { user: req.auth.sub, order: null, kind },
        {
          $setOnInsert: {
            user: req.auth.sub, order: null, orderNumber: "",
            kind, snapshot, source: "admin_comp"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      granted.push(kind);
    }

    res.status(201).json({ message: "Plans unlocked for your admin account.", plans: granted });
  } catch (err) {
    next(err);
  }
}
