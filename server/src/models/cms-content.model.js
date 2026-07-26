import mongoose from "mongoose";

const cmsSectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const cmsContentSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "Homepage CMS" },
    version: { type: Number, default: 1 },
    sections: { type: [cmsSectionSchema], default: [] },
    order: { type: [String], default: [] },
    announcement: { type: mongoose.Schema.Types.Mixed, default: {} },
    hero: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Short auto-scrolling image strip on the homepage (replaces the old brand
    // text cards). Array of { image, alt, href }.
    brandStrip: { type: mongoose.Schema.Types.Mixed, default: [] },
    footer: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: "" },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const CmsContent = mongoose.models.CmsContent || mongoose.model("CmsContent", cmsContentSchema);
