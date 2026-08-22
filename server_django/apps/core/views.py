from datetime import datetime, timezone

from django.views.static import serve
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import env as mt_env


@api_view(["GET"])
@permission_classes([AllowAny])
def healthz(request):
    return Response({
        "ok": True,
        "service": "muscle-tonik",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@api_view(["GET", "POST", "PATCH", "PUT", "DELETE"])
@permission_classes([AllowAny])
def api_not_found(request):
    """Mirror of middleware/not-found.middleware.js — every unmatched /api/*
    path must 404 with JSON, never Django's HTML debug page."""
    return Response(
        {"message": "Route not found", "path": request.path},
        status=404,
    )


def static_frontend(request, path=""):
    """Mirror of express.static(rootDir) — serves index.html for a bare
    directory request, since django.views.static.serve won't do that itself."""
    response = serve(request, path or "index.html", document_root=str(mt_env.REPO_ROOT))
    # serve() sends only Last-Modified, so browsers heuristically cache the
    # frontend JS and keep running a stale copy after an edit. This is the
    # dev-only frontend mount, so force revalidation on every request.
    response["Cache-Control"] = "no-cache, must-revalidate"
    return response
