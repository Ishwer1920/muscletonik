import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/muscle_tonik",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:4000",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "Muscle Tonik <no-reply@muscletonik.local>",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || ""
};
