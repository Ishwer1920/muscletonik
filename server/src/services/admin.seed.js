import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";

// Development administrator. The password is stored only as a bcrypt hash and is
// never sent to the frontend. It can be rotated later via the change-password
// flow or by updating these env vars.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@muscletonik.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";
const ADMIN_NAME = process.env.ADMIN_NAME || "Muscle Tonik Admin";

export async function seedAdminUser() {
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    // The primary account is the platform super admin (full RBAC access).
    // Upgrade it if needed, but never overwrite an already-changed password.
    if (existing.role !== "super_admin") {
      existing.role = "super_admin";
      await existing.save();
    }
    return { created: false, email: ADMIN_EMAIL };
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    passwordHash,
    role: "super_admin",
    emailVerified: true
  });
  return { created: true, email: ADMIN_EMAIL };
}
