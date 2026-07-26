import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { router } from "./routes/index.js";
import { notFound } from "./middleware/not-found.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { env } from "./config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

export const app = express();

app.use(helmet({
  crossOriginResourcePolicy: false,
  // The default Helmet CSP is `script-src 'self'`, which blocks (a) the
  // external Razorpay checkout SDK, (b) the inline event handlers (onclick=…)
  // the UI relies on, and (c) inline <script> blocks. Relax exactly those,
  // keeping everything else at Helmet's secure defaults.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://checkout.razorpay.com", "https://cdn.razorpay.com", "https://*.razorpay.com"],
      "script-src-attr": ["'unsafe-inline'"],
      "frame-src": ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      "connect-src": ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      // Catalog images are hosted on the source stores' CDNs (cdn.shopify.com,
      // muscleharvest.in, …) rather than being mirrored locally, so images must
      // be allowed from any https origin — otherwise every product renders broken.
      "img-src": ["'self'", "data:", "https:"],
      // Don't force-upgrade to https so plain-http/localhost hosting works.
      "upgrade-insecure-requests": null
    }
  }
}));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (env.nodeEnv !== "production") return cb(null, true);
    return cb(null, origin === env.clientOrigin);
  },
  credentials: true
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

// Rate limiting is applied to the API only (see below). It must NOT wrap
// static asset serving — otherwise normal browsing (each page pulls several
// CSS/JS files) quickly trips the limit and the browser receives 429s in
// place of stylesheets/scripts, breaking the page.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." }
});

// Serve a brand favicon for the browser's automatic /favicon.ico request so
// it never 404s (also used by pages that link to it).
app.get("/favicon.ico", (req, res) => {
  res.type("image/svg+xml").send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ff7a00" stroke-width="2.4"><path d="M6 7v10M18 7v10M2 10v4M22 10v4M6 12h12"/></svg>'
  );
});

app.use(express.static(rootDir));
app.use("/uploads", express.static(path.join(rootDir, "uploads")));
app.use("/api", apiLimiter, router);

app.get("/healthz", (req, res) => {
  res.json({ ok: true, service: "muscle-tonik", timestamp: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);
