import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "Home" },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "" },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, default: "India" },
    isDefault: { type: Boolean, default: false }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["customer", "staff", "manager", "admin", "super_admin"], default: "customer" },
    // Optional per-user permission grants layered on top of the role's defaults
    // (see config/permissions.js). Empty for ordinary accounts.
    permissions: { type: [String], default: [] },
    emailVerified: { type: Boolean, default: false },
    verificationTokenHash: { type: String, default: "", select: false },
    verificationTokenExpiresAt: { type: Date, default: null, select: false },
    passwordResetTokenHash: { type: String, default: "", select: false },
    passwordResetTokenExpiresAt: { type: Date, default: null, select: false },
    refreshTokens: [{ type: String, select: false }],
    addresses: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, default: 1, min: 1 }
      }
    ],
    status: { type: String, enum: ["active", "blocked"], default: "active" }
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
