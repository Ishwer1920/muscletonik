import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const uploadRoot = path.join(rootDir, "uploads");
const productUploadDir = path.join(uploadRoot, "products");
const bannerUploadDir = path.join(uploadRoot, "banners");
const brandUploadDir = path.join(uploadRoot, "brands");

fs.mkdirSync(productUploadDir, { recursive: true });
fs.mkdirSync(bannerUploadDir, { recursive: true });
fs.mkdirSync(brandUploadDir, { recursive: true });

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// One uploader factory per destination folder. Banners are wide artwork and run
// larger than a product shot, so they get their own size ceiling.
function createUploader(destination, { fileSize, files }) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destination),
      filename: (_req, file, cb) => {
        const stamp = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${stamp}${ext || ".bin"}`);
      }
    }),
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_TYPES.has(file.mimetype)) {
        const err = new Error("Only JPEG, PNG, WEBP, and GIF images are allowed.");
        err.statusCode = 400;
        return cb(err);
      }
      cb(null, true);
    },
    limits: { fileSize, files }
  });
}

function normalizeUrl(req, folder, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${folder}/${filename}`;
}

function respondWithFiles(req, res, folder) {
  const files = (req.files || []).map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    url: normalizeUrl(req, folder, file.filename)
  }));
  res.status(201).json({ message: "Files uploaded.", files });
}

export const productImageUpload = createUploader(productUploadDir, {
  fileSize: 10 * 1024 * 1024,
  files: 12
}).array("images", 12);

export async function uploadProductImages(req, res) {
  respondWithFiles(req, res, "products");
}

export const bannerImageUpload = createUploader(bannerUploadDir, {
  fileSize: 15 * 1024 * 1024,
  files: 6
}).array("images", 6);

export async function uploadBannerImages(req, res) {
  respondWithFiles(req, res, "banners");
}

// A brand logo is a single small mark, so cap it tighter than a product shot.
export const brandLogoUpload = createUploader(brandUploadDir, {
  fileSize: 5 * 1024 * 1024,
  files: 1
}).array("images", 1);

export async function uploadBrandLogos(req, res) {
  respondWithFiles(req, res, "brands");
}
