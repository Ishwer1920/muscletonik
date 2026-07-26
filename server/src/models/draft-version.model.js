import mongoose from "mongoose";

const draftVersionSchema = new mongoose.Schema(
  {
    contentSlug: { type: String, required: true, index: true },
    kind: { type: String, default: "homepage" },
    note: { type: String, default: "" },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: String, default: "" },
    published: { type: Boolean, default: false }
  },
  { timestamps: true }
);

draftVersionSchema.index({ contentSlug: 1, createdAt: -1 });

export const DraftVersion = mongoose.models.DraftVersion || mongoose.model("DraftVersion", draftVersionSchema);
