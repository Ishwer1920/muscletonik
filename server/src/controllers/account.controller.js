import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { body, validationResult } from "express-validator";
import { User } from "../models/user.model.js";

// Customer-facing account controller: update own profile + upload own avatar.
// Auth-only (requireAuth attaches req.auth). Kept separate from the admin
// upload controller so customer avatars live in their own folder.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const avatarDir = path.join(rootDir, "uploads", "avatars");
fs.mkdirSync(avatarDir, { recursive: true });

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    emailVerified: user.emailVerified
  };
}

export const updateProfileValidators = [
  body("name").optional().trim().isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters."),
  body("phone").optional({ checkFalsy: true }).isLength({ min: 8, max: 20 }).withMessage("Phone number must be between 8 and 20 digits.")
];

// PATCH /api/auth/profile — update the logged-in user's own name/phone.
export async function updateProfile(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const update = {};
    if (typeof req.body.name === "string" && req.body.name.trim()) update.name = req.body.name.trim();
    if (typeof req.body.phone === "string") update.phone = req.body.phone.trim();
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Nothing to update." });
    }
    const user = await User.findByIdAndUpdate(req.auth.sub, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Profile updated", user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const stamp = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${req.auth.sub}-${stamp}${ext || ".bin"}`);
  }
});

const avatarUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.mimetype)) {
      const err = new Error("Only JPEG, PNG, WEBP, and GIF images are allowed.");
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

export const avatarUploadMiddleware = avatarUpload.single("avatar");

// POST /api/auth/avatar — store the uploaded image and save its URL on the user.
export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "No image was uploaded." });
    const url = `${req.protocol}://${req.get("host")}/uploads/avatars/${req.file.filename}`;

    // Remove the previous avatar file (best-effort) so uploads don't pile up.
    const existing = await User.findById(req.auth.sub).select("avatarUrl");
    if (existing && existing.avatarUrl) {
      const prev = existing.avatarUrl.split("/uploads/avatars/")[1];
      if (prev) fs.promises.unlink(path.join(avatarDir, prev)).catch(() => {});
    }

    const user = await User.findByIdAndUpdate(req.auth.sub, { avatarUrl: url }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(201).json({ message: "Profile photo updated", avatarUrl: url, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}
