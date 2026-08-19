import logging

import jwt as pyjwt
from rest_framework.authentication import BaseAuthentication

from apps.core.jwt_utils import verify_access_token

logger = logging.getLogger(__name__)


class AuthClaims:
    """Stand-in for req.auth in the Node middleware — the decoded access-token
    payload. Exposes is_authenticated so DRF's request.user checks behave."""

    is_authenticated = True

    def __init__(self, payload):
        self.payload = payload
        self.sub = payload.get("sub")
        self.role = payload.get("role")
        self.email = payload.get("email")
        self.perms = payload.get("perms") or []

    def __getitem__(self, key):
        return self.payload[key]


class CookieOrHeaderJWTAuthentication(BaseAuthentication):
    """Mirror of middleware/auth.middleware.js#requireAuth: cookie takes
    priority over the Authorization header."""

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        bearer = header[7:] if header.startswith("Bearer ") else None
        token = request.COOKIES.get("accessToken") or bearer

        if not token:
            return None

        try:
            payload = verify_access_token(token)
        except pyjwt.PyJWTError as exc:
            # An expired or unreadable token means "not signed in", not "you
            # are forbidden". Raising here used to fail the whole request, so
            # a stale cookie made even PUBLIC endpoints like /api/catalog
            # return an error and the storefront rendered nothing. Falling
            # through as anonymous lets public routes work, while protected
            # ones raise NotAuthenticated -> 401 -> the browser silently
            # refreshes and retries.
            logger.debug("Ignoring unusable access token: %s", exc)
            return None

        claims = AuthClaims(payload)
        return (claims, token)

    def authenticate_header(self, request):
        """Without this DRF has no WWW-Authenticate header to send, so it
        downgrades every 401 to a 403. The frontend only retries a refresh on
        401, so an expired session surfaced as a dead 403 that no amount of
        waiting recovered from — the "logged out after a few minutes" bug."""
        return 'Bearer realm="api"'
