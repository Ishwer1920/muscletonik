import time

import jwt

from . import env

# TTLs come from .env (see apps/core/env.py) so session length can be tuned on
# the VPS without a redeploy. Defaults: 12h access, 30d refresh.
ACCESS_TOKEN_TTL = env.ACCESS_TOKEN_TTL_MINUTES * 60
REFRESH_TOKEN_TTL = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60


def _sign(payload, secret, ttl_seconds):
    now = int(time.time())
    full_payload = {**payload, "iat": now, "exp": now + ttl_seconds}
    return jwt.encode(full_payload, secret, algorithm="HS256")


def sign_access_token(payload):
    return _sign(payload, env.JWT_ACCESS_SECRET, ACCESS_TOKEN_TTL)


def sign_refresh_token(payload):
    return _sign(payload, env.JWT_REFRESH_SECRET, REFRESH_TOKEN_TTL)


def verify_access_token(token):
    return jwt.decode(token, env.JWT_ACCESS_SECRET, algorithms=["HS256"])


def verify_refresh_token(token):
    return jwt.decode(token, env.JWT_REFRESH_SECRET, algorithms=["HS256"])
