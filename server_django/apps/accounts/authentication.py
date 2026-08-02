import jwt as pyjwt
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.core.jwt_utils import verify_access_token


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
    priority over the Authorization header. Returns None (unauthenticated,
    no error) when no token is present at all, so public routes still work;
    raises only when a token IS present but fails to verify."""

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        bearer = header[7:] if header.startswith("Bearer ") else None
        token = request.COOKIES.get("accessToken") or bearer

        if not token:
            return None

        try:
            payload = verify_access_token(token)
        except pyjwt.PyJWTError:
            raise AuthenticationFailed("Invalid or expired session")

        claims = AuthClaims(payload)
        return (claims, token)
