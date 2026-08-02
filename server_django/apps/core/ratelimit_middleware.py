import threading
import time

from django.http import JsonResponse

# Port of the express-rate-limit config in server/src/app.js — 300 requests
# per 15-minute fixed window, applied to /api/* only (never static assets,
# or every page load's CSS/JS requests would trip it). Single-process
# in-memory counter, matching the dev-server-parity scope of this project.

WINDOW_SECONDS = 15 * 60
LIMIT = 300

_lock = threading.Lock()
_buckets = {}  # client_key -> (window_start_epoch, count)


def _client_key(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


class ApiRateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        key = _client_key(request)
        now = time.time()

        with _lock:
            window_start, count = _buckets.get(key, (now, 0))
            if now - window_start >= WINDOW_SECONDS:
                window_start, count = now, 0
            count += 1
            _buckets[key] = (window_start, count)

        remaining = max(0, LIMIT - count)
        reset_seconds = max(0, round(WINDOW_SECONDS - (now - window_start)))

        if count > LIMIT:
            response = JsonResponse(
                {"message": "Too many requests. Please slow down and try again shortly."},
                status=429,
            )
        else:
            response = self.get_response(request)

        response["RateLimit-Policy"] = f"{LIMIT};w={WINDOW_SECONDS}"
        response["RateLimit-Limit"] = str(LIMIT)
        response["RateLimit-Remaining"] = str(remaining)
        response["RateLimit-Reset"] = str(reset_seconds)

        # Global no-cache directive on every /api/* response — matches the
        # router-level middleware in server/src/routes/index.js.
        response["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response["Pragma"] = "no-cache"
        return response
