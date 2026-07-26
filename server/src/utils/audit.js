import { AuditLog } from "../models/audit-log.model.js";

// Append an audit entry for a privileged action. Never throws — auditing must
// not break the operation it records.
export async function writeAudit(req, action, target, details = {}) {
  try {
    await AuditLog.create({
      actor: req.auth?.sub,
      actorEmail: req.auth?.email || "",
      actorRole: req.auth?.role || "",
      action,
      target,
      details,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || ""
    });
  } catch {
    /* ignore */
  }
}
