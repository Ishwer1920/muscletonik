import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import { createToken, hashToken } from "../utils/tokens.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";

function buildSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    emailVerified: user.emailVerified
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/"
  };
}

export async function registerUser(payload) {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    const error = new Error("Email already registered");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);
  const verificationToken = createToken();
  const user = await User.create({
    name: payload.name,
    email: payload.email.toLowerCase(),
    phone: payload.phone || "",
    passwordHash,
    verificationTokenHash: hashToken(verificationToken),
    verificationTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
  });

  return { user: buildSafeUser(user), verificationToken };
}

export async function loginUser({ identifier, email, password, rememberMe = false }) {
  const raw = String(identifier || email || "").trim();
  const isEmail = raw.includes("@");
  const query = isEmail
    ? { email: raw.toLowerCase() }
    : { phone: raw.replace(/[\s-]/g, "") };
  const user = await User.findOne(query).select("+passwordHash +refreshTokens");
  if (!user) {
    const error = new Error("Invalid credentials. Check your email/mobile and password.");
    error.statusCode = 401;
    throw error;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const error = new Error("Invalid credentials. Check your email/mobile and password.");
    error.statusCode = 401;
    throw error;
  }

  const payload = { sub: String(user._id), role: user.role, email: user.email, perms: user.permissions || [] };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ ...payload, rememberMe: Boolean(rememberMe) });
  user.refreshTokens = [...(user.refreshTokens || []), refreshToken].slice(-10);
  await user.save();

  return { user: buildSafeUser(user), accessToken, refreshToken };
}

export async function rotateRefreshToken(token) {
  const decoded = verifyRefreshToken(token);
  const user = await User.findById(decoded.sub).select("+refreshTokens");
  if (!user || !(user.refreshTokens || []).includes(token)) {
    const error = new Error("Refresh session not recognized");
    error.statusCode = 401;
    throw error;
  }
  const payload = { sub: String(user._id), role: user.role, email: user.email, perms: user.permissions || [] };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  user.refreshTokens = user.refreshTokens.filter(item => item !== token).concat(refreshToken);
  await user.save();
  return { user: buildSafeUser(user), accessToken, refreshToken };
}

export async function revokeRefreshToken(token) {
  try {
    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.sub).select("+refreshTokens");
    if (user) {
      user.refreshTokens = (user.refreshTokens || []).filter(item => item !== token);
      await user.save();
    }
  } catch (err) {
    return true;
  }
  return true;
}

export async function issuePasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return { accepted: true };
  const token = createToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60);
  await user.save();
  return { accepted: true, token };
}

export async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() }
  }).select("+passwordHash");

  if (!user) {
    const error = new Error("Reset token is invalid or expired");
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = "";
  user.passwordResetTokenExpiresAt = null;
  await user.save();
  return buildSafeUser(user);
}

export async function verifyEmail(token) {
  const tokenHash = hashToken(token);
  const user = await User.findOne({
    verificationTokenHash: tokenHash,
    verificationTokenExpiresAt: { $gt: new Date() }
  });

  if (!user) {
    const error = new Error("Verification token is invalid or expired");
    error.statusCode = 400;
    throw error;
  }

  user.emailVerified = true;
  user.verificationTokenHash = "";
  user.verificationTokenExpiresAt = null;
  await user.save();
  return buildSafeUser(user);
}
