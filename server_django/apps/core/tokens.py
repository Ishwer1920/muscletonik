import hashlib
import secrets


def create_token():
    """Opaque token for email verification / password reset — NOT a JWT.
    Direct port of server/src/utils/tokens.js."""
    return secrets.token_hex(32)


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()
