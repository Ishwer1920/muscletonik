import mongoose from "mongoose";

const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    category: { type: String, default: "general", index: true },
    updatedBy: { type: String, default: "" }
  },
  { timestamps: true }
);

export const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingSchema);
