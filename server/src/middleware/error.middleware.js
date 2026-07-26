import { env } from "../config/env.js";

export function errorHandler(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || "Internal server error";

  // Mongoose validation errors -> 400 with field messages
  if (err.name === "ValidationError" && err.errors) {
    status = 400;
    message = Object.values(err.errors).map(e => e.message).join(" ") || "Validation failed";
  }

  // Invalid ObjectId / cast errors -> 400
  if (err.name === "CastError") {
    status = 400;
    message = "Invalid identifier supplied.";
  }

  // Duplicate key (e.g. email already registered) -> 409
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `That ${field} is already in use.`;
  }

  // JWT errors -> 401
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    status = 401;
    message = "Invalid or expired session.";
  }

  // Never leak internal details on unexpected 5xx; log them instead.
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (env.nodeEnv === "production") {
      message = "Something went wrong. Please try again.";
    }
  }

  res.status(status).json({ message });
}
