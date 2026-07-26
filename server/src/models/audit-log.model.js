import mongoose from "mongoose";

// Append-only record of privileged admin actions. Written by admin controllers;
// never updated or deleted through the API.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    action: { type: String, required: true },   // e.g. "team.create", "team.update_role"
    target: { type: String, default: "" },      // human-readable target (email / id)
    details: { type: Object, default: {} },      // { before, after } etc.
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
