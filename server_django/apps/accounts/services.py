from datetime import datetime, timedelta, timezone

import bcrypt

from apps.core.exceptions import ApiError
from apps.core.jwt_utils import sign_access_token, sign_refresh_token, verify_refresh_token
from apps.core.tokens import create_token, hash_token

from .models import User


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def check_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def build_safe_user(user):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatarUrl": user.avatarUrl or "",
        "role": user.role,
        "emailVerified": user.emailVerified,
    }


def _auth_payload(user):
    return {"sub": str(user.id), "role": user.role, "email": user.email, "perms": user.permissions or []}


def register_user(payload):
    email = payload["email"].lower()
    if User.objects(email=email).first():
        raise ApiError("Email already registered", 409)

    verification_token = create_token()
    user = User(
        name=payload["name"],
        email=email,
        phone=payload.get("phone") or "",
        passwordHash=hash_password(payload["password"]),
        verificationTokenHash=hash_token(verification_token),
        verificationTokenExpiresAt=datetime.now(timezone.utc) + timedelta(hours=24),
    ).save()

    return {"user": build_safe_user(user), "verificationToken": verification_token}


def login_user(identifier, email, password, remember_me=False):
    raw = str(identifier or email or "").strip()
    is_email = "@" in raw
    query = {"email": raw.lower()} if is_email else {"phone": raw.replace(" ", "").replace("-", "")}
    user = User.objects(**query).first()

    invalid = ApiError("Invalid credentials. Check your email/mobile and password.", 401)
    if not user:
        raise invalid
    if not check_password(password, user.passwordHash):
        raise invalid

    payload = _auth_payload(user)
    access_token = sign_access_token(payload)
    refresh_token = sign_refresh_token({**payload, "rememberMe": bool(remember_me)})
    user.refreshTokens = (user.refreshTokens or [])[-9:] + [refresh_token]
    user.save()

    return {"user": build_safe_user(user), "accessToken": access_token, "refreshToken": refresh_token}


def rotate_refresh_token(token):
    try:
        decoded = verify_refresh_token(token)
    except Exception:
        raise ApiError("Refresh session not recognized", 401)

    user = User.objects(id=decoded["sub"]).first()
    if not user or token not in (user.refreshTokens or []):
        raise ApiError("Refresh session not recognized", 401)

    payload = _auth_payload(user)
    access_token = sign_access_token(payload)
    refresh_token = sign_refresh_token(payload)
    user.refreshTokens = [t for t in user.refreshTokens if t != token] + [refresh_token]
    user.save()

    return {"user": build_safe_user(user), "accessToken": access_token, "refreshToken": refresh_token}


def revoke_refresh_token(token):
    try:
        decoded = verify_refresh_token(token)
        user = User.objects(id=decoded["sub"]).first()
        if user:
            user.refreshTokens = [t for t in (user.refreshTokens or []) if t != token]
            user.save()
    except Exception:
        return True
    return True


def issue_password_reset(email):
    user = User.objects(email=email.lower()).first()
    if not user:
        return {"accepted": True, "token": None}
    token = create_token()
    user.passwordResetTokenHash = hash_token(token)
    user.passwordResetTokenExpiresAt = datetime.now(timezone.utc) + timedelta(hours=1)
    user.save()
    return {"accepted": True, "token": token}


def reset_password(token, password):
    token_hash = hash_token(token)
    user = User.objects(
        passwordResetTokenHash=token_hash,
        passwordResetTokenExpiresAt__gt=datetime.now(timezone.utc),
    ).first()
    if not user:
        raise ApiError("Reset token is invalid or expired", 400)

    user.passwordHash = hash_password(password)
    user.passwordResetTokenHash = ""
    user.passwordResetTokenExpiresAt = None
    user.save()
    return build_safe_user(user)


def verify_email(token):
    token_hash = hash_token(token)
    user = User.objects(
        verificationTokenHash=token_hash,
        verificationTokenExpiresAt__gt=datetime.now(timezone.utc),
    ).first()
    if not user:
        raise ApiError("Verification token is invalid or expired", 400)

    user.emailVerified = True
    user.verificationTokenHash = ""
    user.verificationTokenExpiresAt = None
    user.save()
    return build_safe_user(user)
