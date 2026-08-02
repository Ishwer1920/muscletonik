import time
import uuid
from pathlib import Path

from apps.core import env
from apps.core.exceptions import ApiError

# Direct port of server/src/controllers/admin-upload.controller.js.

UPLOAD_ROOT = env.UPLOADS_DIR
PRODUCT_DIR = UPLOAD_ROOT / "products"
BANNER_DIR = UPLOAD_ROOT / "banners"
BRAND_DIR = UPLOAD_ROOT / "brands"
for _d in (PRODUCT_DIR, BANNER_DIR, BRAND_DIR):
    _d.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _generate_filename(original_name):
    stamp = f"{int(time.time() * 1000)}-{uuid.uuid4().int % 1_000_000_000}"
    ext = Path(original_name or "").suffix.lower() or ".bin"
    return f"{stamp}{ext}"


def _make_uploader(dest_dir, max_bytes, max_files):
    def upload(request, field="images"):
        files = request.FILES.getlist(field)
        if not files:
            return []
        if len(files) > max_files:
            raise ApiError(f"Too many files uploaded (max {max_files}).", 400)

        saved = []
        for f in files:
            if f.content_type not in ALLOWED_TYPES:
                raise ApiError("Only JPEG, PNG, WEBP, and GIF images are allowed.", 400)
            if f.size > max_bytes:
                raise ApiError(f"File too large (max {max_bytes // (1024 * 1024)}MB).", 400)

            filename = _generate_filename(f.name)
            dest = dest_dir / filename
            with open(dest, "wb") as out:
                for chunk in f.chunks():
                    out.write(chunk)
            saved.append({"filename": filename, "originalName": f.name, "size": f.size})
        return saved

    return upload


product_image_upload = _make_uploader(PRODUCT_DIR, 10 * 1024 * 1024, 12)
banner_image_upload = _make_uploader(BANNER_DIR, 15 * 1024 * 1024, 6)
brand_logo_upload = _make_uploader(BRAND_DIR, 5 * 1024 * 1024, 1)


def build_file_url(request, folder, filename):
    scheme = "https" if request.is_secure() else "http"
    return f"{scheme}://{request.get_host()}/uploads/{folder}/{filename}"
