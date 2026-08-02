from django.urls import include, path, re_path
from django.views.static import serve

from apps.catalog.views import catalog as catalog_home
from apps.core import env as mt_env
from apps.core.views import api_not_found, healthz, static_frontend
from apps.orders.views import list_my_orders

urlpatterns = [
    path("healthz", healthz),
    path("api/auth/", include("apps.accounts.urls")),
    # Bare GET /api/catalog and /api/orders (no trailing slash) are the exact
    # paths the frontend calls, matching Node's router.get("/", ...) mount —
    # Django's URL resolver is slash-sensitive where Express isn't, so these
    # two true bare-root endpoints need an explicit pattern of their own.
    re_path(r"^api/catalog/?$", catalog_home),
    re_path(r"^api/orders/?$", list_my_orders),
    path("api/catalog/", include("apps.catalog.urls")),
    path("api/checkout/", include("apps.checkout.urls")),
    path("api/payments/", include("apps.payments.urls")),
    path("api/orders/", include("apps.orders.urls")),
    path("api/plans/", include("apps.plans.urls")),
    path("api/admin/", include("apps.adminpanel.urls")),
    # Anything under /api/ that no app claimed -> JSON 404 (mirrors
    # not-found.middleware.js), instead of Django's default HTML 404.
    re_path(r"^api/.*$", api_not_found),
    # /uploads/<file> — dev-only static serving, matches
    # server/src/app.js:78 (express.static(uploads)).
    re_path(r"^uploads/(?P<path>.*)$", serve, {"document_root": str(mt_env.UPLOADS_DIR)}),
    # Whole static frontend at the repo root — matches app.js:77
    # (express.static(rootDir)). Dev-only per Django's own docs; fine since
    # the goal is `runserver` parity with `node src/index.js` for local dev.
    re_path(r"^(?P<path>.*)$", static_frontend),
]
