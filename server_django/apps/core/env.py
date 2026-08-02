import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


NODE_ENV = os.environ.get("NODE_ENV", "development")
IS_PRODUCTION = NODE_ENV == "production"

DJANGO_PORT = _int("DJANGO_PORT", 8000)

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/muscle_tonik")

JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret")
JWT_REFRESH_SECRET = os.environ.get("JWT_REFRESH_SECRET", "dev-refresh-secret")

CLIENT_ORIGIN = os.environ.get("CLIENT_ORIGIN", "http://localhost:4000")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@muscletonik.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Muscle Tonik Admin")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = _int("SMTP_PORT", 587)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "Muscle Tonik <no-reply@muscletonik.local>")

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

# Repo root (one level above server_django/) — where the static frontend and
# /uploads live.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
UPLOADS_DIR = REPO_ROOT / "uploads"
