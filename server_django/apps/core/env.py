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

# Session length. The access token used to live for 15 minutes, which meant a
# quiet admin tab was always one expired-token race away from being bounced to
# /login.html. Both are now tunable from .env without a code change.
ACCESS_TOKEN_TTL_MINUTES = _int("ACCESS_TOKEN_TTL_MINUTES", 720)      # 12 hours
REFRESH_TOKEN_TTL_DAYS = _int("REFRESH_TOKEN_TTL_DAYS", 30)
# How long a just-rotated refresh token keeps working. Covers the window where
# several tabs/requests refresh at the same moment with the same cookie.
REFRESH_ROTATION_GRACE_SECONDS = _int("REFRESH_ROTATION_GRACE_SECONDS", 120)

CLIENT_ORIGIN = os.environ.get("CLIENT_ORIGIN", "http://localhost:4000")

# Extra browser origins allowed to call the API with cookies, comma separated.
# CLIENT_ORIGIN alone was too narrow: the site answers on both the apex and the
# www host, and a visitor who landed on www got no CORS headers at all, so
# register/login/checkout failed before the request ever reached Django.
EXTRA_CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",")
    if o.strip()
]


def allowed_browser_origins():
    """CLIENT_ORIGIN, its www/apex twin, and anything named in
    EXTRA_CORS_ORIGINS - deduplicated, order preserved."""
    origins = []

    def add(value):
        value = (value or "").strip().rstrip("/")
        if value and value not in origins:
            origins.append(value)

    add(CLIENT_ORIGIN)
    if "://" in CLIENT_ORIGIN:
        scheme, host = CLIENT_ORIGIN.split("://", 1)
        host = host.rstrip("/")
        add(f"{scheme}://{host[4:]}" if host.startswith("www.") else f"{scheme}://www.{host}")
    for origin in EXTRA_CORS_ORIGINS:
        add(origin)
    return origins

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@muscletonik.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Muscle Tonik Admin")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = _int("SMTP_PORT", 587)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "Muscle Tonik <no-reply@muscletonik.local>")

# --- SMS gateway (forgot-password OTP over mobile) -------------------------
# "console" just logs the code, which is what local development wants. See
# apps/accounts/sms.py for the per-provider keys.
SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "")
SMS_API_KEY = os.environ.get("SMS_API_KEY", "")
SMS_SENDER_ID = os.environ.get("SMS_SENDER_ID", "MSCTNK")
SMS_TEMPLATE_ID = os.environ.get("SMS_TEMPLATE_ID", "")
SMS_COUNTRY_CODE = os.environ.get("SMS_COUNTRY_CODE", "91")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM", "")

# --- password reset OTP ----------------------------------------------------
OTP_LENGTH = _int("OTP_LENGTH", 6)
OTP_TTL_MINUTES = _int("OTP_TTL_MINUTES", 10)
OTP_MAX_ATTEMPTS = _int("OTP_MAX_ATTEMPTS", 5)
OTP_MAX_SENDS = _int("OTP_MAX_SENDS", 5)
OTP_RESEND_SECONDS = _int("OTP_RESEND_SECONDS", 60)

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

# Repo root (one level above server_django/) — where the static frontend and
# /uploads live.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
UPLOADS_DIR = REPO_ROOT / "uploads"
