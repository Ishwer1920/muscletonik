import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    productId: { type: Number, index: true, required: true },
    productName: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: "", trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected", "spam"], default: "pending" },
    featured: { type: Boolean, default: false },
    reply: { type: String, default: "" },
    tags: [{ type: String }]
  },
  { timestamps: true }
);

reviewSchema.index({ status: 1, featured: 1, createdAt: -1 });

export const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
