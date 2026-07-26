import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: "15m" });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: "30d" });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
