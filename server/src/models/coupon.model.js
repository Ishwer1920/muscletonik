import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["percent", "flat", "free_shipping"], required: true },
    value: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: 0, min: 0 },
    usageCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    notes: { type: String, default: "" },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" }
  },
  { timestamps: true }
);

couponSchema.index({ active: 1, expiresAt: 1 });

export const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
