import { body, validationResult } from "express-validator";
import { issuePasswordReset, loginUser, registerUser, resetPassword, revokeRefreshToken, rotateRefreshToken, verifyEmail } from "../services/auth.service.js";
import { sendMail } from "../utils/mailer.js";
import { env } from "../config/env.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

// Shared password policy for account creation / reset: at least 8 characters
// and a mix of letters and numbers. (Login is intentionally length-only so
// existing accounts are never locked out by a policy change.)
const strongPassword = value => {
  const v = String(value || "");
  if (v.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) throw new Error("Password must include both letters and numbers.");
  return true;
};

function setAuthCookies(res, accessToken, refreshToken) {
  const options = { httpOnly: true, sameSite: "lax", secure: env.nodeEnv === "production", path: "/" };
  res.cookie("accessToken", accessToken, options);
  res.cookie("refreshToken", refreshToken, { ...options, maxAge: 1000 * 60 * 60 * 24 * 30 });
}

export const registerValidators = [
  body("name").trim().isLength({ min: 2, max: 60 }).withMessage("Name must be between 2 and 60 characters."),
  // Only trim/lowercase. NOT normalizeEmail(): it strips dots and +tags from
  // gmail addresses, so an account saved here could never be found by login,
  // which matches on the address as typed (lowercased).
  body("email").isEmail().withMessage("Enter a valid email address.").trim().toLowerCase(),
  body("password").custom(strongPassword),
  body("phone").optional({ checkFalsy: true }).isLength({ min: 8, max: 20 }).withMessage("Phone number must be between 8 and 20 digits.")
];

export async function register(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const result = await registerUser(req.body);
    const verificationUrl = `${env.clientOrigin}/verify-email.html?token=${result.verificationToken}`;
    await sendMail({
      to: result.user.email,
      subject: "Verify your Muscle Tonik account",
      html: `<p>Welcome to Muscle Tonik.</p><p>Verify your email here: <a href="${verificationUrl}">${verificationUrl}</a></p>`
    });
    res.status(201).json({
      message: "Account created",
      user: result.user,
      verificationUrl: env.nodeEnv === "production" ? undefined : verificationUrl
    });
  } catch (err) {
    next(err);
  }
}

export const loginValidators = [
  // Accept either an email address or a mobile number in a single field.
  body("identifier").custom((value, { req }) => {
    const raw = String(req.body.identifier || req.body.email || "").trim();
    if (raw.length < 3) throw new Error("Enter your email or mobile number.");
    const isEmail = raw.includes("@");
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw new Error("Enter a valid email address.");
    if (!isEmail && !/^\+?\d[\d\s-]{6,}$/.test(raw)) throw new Error("Enter a valid mobile number.");
    return true;
  }),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  body("rememberMe").optional().isBoolean().withMessage("Remember me must be true or false.")
];

export async function login(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const result = await loginUser(req.body);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ message: "Logged in", user: result.user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) await revokeRefreshToken(token);
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/" });
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: "Refresh token missing" });
    const result = await rotateRefreshToken(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ message: "Session refreshed", user: result.user });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.auth.sub).select("name email phone avatarUrl role emailVerified addresses wishlist cart createdAt updatedAt");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export const forgotValidators = [body("email").isEmail().withMessage("Enter a valid email address.").trim().toLowerCase()];
export async function forgotPassword(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const result = await issuePasswordReset(req.body.email);
    res.json({
      message: "If the account exists, a reset email has been prepared",
      resetToken: env.nodeEnv === "production" ? undefined : result.token
    });
  } catch (err) {
    next(err);
  }
}

export const resetValidators = [
  body("token").isLength({ min: 20 }).withMessage("Reset token is missing or invalid."),
  body("password").custom(strongPassword)
];
export async function resetPasswordHandler(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const user = await resetPassword(req.body);
    res.json({ message: "Password updated", user });
  } catch (err) {
    next(err);
  }
}

export const verifyEmailValidators = [body("token").isLength({ min: 20 }).withMessage("Verification token is missing or invalid.")];
export async function verifyEmailHandler(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const user = await verifyEmail(req.body.token);
    res.json({ message: "Email verified", user });
  } catch (err) {
    next(err);
  }
}

export const changePasswordValidators = [
  body("currentPassword").isLength({ min: 8 }).withMessage("Current password must be at least 8 characters."),
  body("newPassword").custom(strongPassword)
];
export async function changePassword(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const user = await User.findById(req.auth.sub).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await user.save();
    res.json({ message: "Password changed" });
  } catch (err) {
    next(err);
  }
}
