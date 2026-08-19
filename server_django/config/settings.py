"""
Django settings for the Muscle Tonik API (Python/Django rewrite of server/).

MongoDB-only: no SQL database, no Django auth/sessions/admin — auth is fully
custom JWT (see apps.accounts.authentication), mirroring the Node backend.
"""

from pathlib import Path

from apps.core import env as mt_env

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-insecure-only-used-for-django-internals-not-jwt-signing"

DEBUG = not mt_env.IS_PRODUCTION

ALLOWED_HOSTS = ["*"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.cms",
    "apps.checkout",
    "apps.payments",
    "apps.orders",
    "apps.plans",
    "apps.audit",
    "apps.adminpanel",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.security_middleware.HelmetHeadersMiddleware",
    "apps.core.ratelimit_middleware.ApiRateLimitMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# No SQL database — everything lives in MongoDB via mongoengine.
DATABASES = {}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.CookieOrHeaderJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [],
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "UNAUTHENTICATED_USER": None,
}

# CORS — mirrors server/src/app.js:43-50 (credentials on; dev reflects any
# origin, production locks to CLIENT_ORIGIN).
CORS_ALLOW_CREDENTIALS = True
if mt_env.IS_PRODUCTION:
    CORS_ALLOWED_ORIGINS = mt_env.allowed_browser_origins()
else:
    CORS_ALLOW_ALL_ORIGINS = True

# Connect to MongoDB at process start — mongoengine's MongoClient connects
# lazily, so this is cheap and safe to call unconditionally (also idempotent
# under the autoreloader, which imports settings twice).
from apps.core.db import connect_db  # noqa: E402

connect_db()
