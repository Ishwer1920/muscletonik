import mongoose from "mongoose";

// A purchased diet/workout plan. This is the entitlement record: it is what
// makes "saved for lifetime" true. The BMI snapshot is stored alongside it so
// the plan can be re-rendered identically years later, even if the customer's
// current weight has changed.
const userPlanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Null for comped plans (admin / super_admin), which have no purchase.
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    orderNumber: { type: String, default: "", index: true },
    // How this entitlement was obtained. "admin_comp" rows are free staff
    // grants and must never be mistaken for revenue in reporting.
    source: { type: String, enum: ["purchase", "admin_comp"], default: "purchase" },
    // "diet" | "workout" — a "both" purchase creates one row of each, so
    // entitlement checks never have to special-case the combo.
    kind: { type: String, enum: ["diet", "workout"], required: true },
    // Frozen inputs + derived values from the moment of purchase.
    snapshot: {
      height: { type: Number, default: 0 },
      weight: { type: Number, default: 0 },
      bmi: { type: Number, default: 0 },
      bandId: { type: String, default: "" },
      bandLabel: { type: String, default: "" },
      goal: { type: String, default: "auto" },
      rangeLow: { type: Number, default: 0 },
      rangeHigh: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

// One entitlement per kind per order, scoped to the user. Keeps the
// post-payment write idempotent under verify-retry, and — because `user` is in
// the key — comped rows (where order is null) don't collide across accounts the
// way a bare (order, kind) index would.
userPlanSchema.index({ user: 1, order: 1, kind: 1 }, { unique: true });

export const UserPlan = mongoose.models.UserPlan || mongoose.model("UserPlan", userPlanSchema);
