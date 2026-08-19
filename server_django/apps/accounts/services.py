import secrets
from datetime import datetime, timedelta, timezone

import bcrypt

from apps.core import env
from apps.core.exceptions import ApiError
from apps.core.jwt_utils import sign_access_token, sign_refresh_token, verify_refresh_token
from apps.core.tokens import create_token, hash_token

from .models import PasswordResetOtp, User
from .validation import normalize_phone, phone_variants


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
        "referralCode": user.referralCode or "",
    }


def _auth_payload(user):
    return {"sub": str(user.id), "role": user.role, "email": user.email, "perms": user.permissions or []}


def resolve_referral_code(code):
    """Check a code typed into the signup form. Returns the normalized code if
    it is a live referral/welcome coupon, otherwise "". A bad referral code
    must never block signup - it is a bonus, not a credential."""
    normalized = str(code or "").strip().upper()
    if not normalized:
        return ""
    try:
        from apps.checkout.models import Coupon
        coupon = Coupon.objects(code=normalized, active=True).first()
    except Exception:
        return ""
    if not coupon or coupon.purpose not in ("referral", "welcome", "influencer"):
        return ""
    return coupon.code


def register_user(payload):
    email = str(payload.get("email") or "").strip().lower()
    if User.objects(email=email).first():
        raise ApiError("That email is already registered. Try logging in instead.", 409)

    phone = normalize_phone(payload.get("phone"))
    if phone and User.objects(phone__in=phone_variants(phone)).first():
        raise ApiError("That mobile number is already registered. Try logging in instead.", 409)

    verification_token = create_token()
    user = User(
        name=str(payload.get("name") or "").strip(),
        email=email,
        # Stored normalized so login-by-phone and the OTP lookup can find it.
        phone=phone,
        passwordHash=hash_password(payload["password"]),
        referralCode=resolve_referral_code(payload.get("referralCode")),
        verificationTokenHash=hash_token(verification_token),
        verificationTokenExpiresAt=datetime.now(timezone.utc) + timedelta(hours=24),
    ).save()

    return {"user": build_safe_user(user), "verificationToken": verification_token}


def login_user(identifier, email, password, remember_me=False):
    raw = str(identifier or email or "").strip()
    is_email = "@" in raw
    if is_email:
        user = User.objects(email=raw.lower()).first()
    else:
        # Match every spelling of the number, including rows written before
        # phone numbers were normalized on the way in.
        user = User.objects(phone__in=phone_variants(raw)).first()

    invalid = ApiError("Invalid credentials. Check your email/mobile and password.", 401)
    if not user:
        raise invalid
    if not check_password(password, user.passwordHash):
        raise invalid

    payload = _auth_payload(user)
    access_token = sign_access_token(payload)
    refresh_token = sign_refresh_token({**payload, "rememberMe": bool(remember_me)})
    # Atomic append + trim: never read-modify-write this array, or a second
    # login/refresh landing at the same moment silently drops the other's token.
    User.objects(id=user.id).update_one(
        __raw__={"$push": {"refreshTokens": {"$each": [refresh_token], "$slice": -20}}}
    )

    return {"user": build_safe_user(user), "accessToken": access_token, "refreshToken": refresh_token}


def _replay_rotated(user, token):
    """If this refresh token was rotated moments ago, hand back the very same
    pair the winning request got instead of failing. Parallel refreshes from
    several admin tabs used to knock the session out here."""
    grace = timedelta(seconds=env.REFRESH_ROTATION_GRACE_SECONDS)
    now = datetime.now(timezone.utc)
    for entry in user.rotatedRefreshTokens or []:
        if entry.token != token or not entry.replacement:
            continue
        rotated_at = entry.rotatedAt
        if rotated_at and rotated_at.tzinfo is None:
            rotated_at = rotated_at.replace(tzinfo=timezone.utc)
        if rotated_at and now - rotated_at <= grace:
            return {"accessToken": entry.accessToken, "refreshToken": entry.replacement}
    return None


def rotate_refresh_token(token):
    try:
        decoded = verify_refresh_token(token)
    except Exception:
        raise ApiError("Refresh session not recognized", 401)

    user = User.objects(id=decoded["sub"]).first()
    if not user:
        raise ApiError("Refresh session not recognized", 401)

    if token not in (user.refreshTokens or []):
        replay = _replay_rotated(user, token)
        if replay:
            return {"user": build_safe_user(user), **replay}
        raise ApiError("Refresh session not recognized", 401)

    payload = _auth_payload(user)
    access_token = sign_access_token(payload)
    refresh_token = sign_refresh_token(payload)

    # Atomic claim. A read-modify-write user.save() here loses updates when two
    # requests rotate at once: the second save overwrites the first token list,
    # leaving the browser holding a cookie the DB no longer knows about -> the
    # next call 401s and the panel "logs itself out". $pull and $push cannot
    # touch the same array in one update, so the claim and the append are two
    # steps; only the request whose $pull actually removed the token proceeds.
    now = datetime.now(timezone.utc)
    claimed = User.objects(id=user.id, refreshTokens=token).update_one(
        pull__refreshTokens=token,
        push__rotatedRefreshTokens={
            "token": token,
            "accessToken": access_token,
            "replacement": refresh_token,
            "rotatedAt": now,
        },
    )
    if not claimed:
        # Another request rotated this token between our read and our write.
        user.reload()
        replay = _replay_rotated(user, token)
        if replay:
            return {"user": build_safe_user(user), **replay}
        raise ApiError("Refresh session not recognized", 401)

    User.objects(id=user.id).update_one(
        __raw__={"$push": {"refreshTokens": {"$each": [refresh_token], "$slice": -20}}}
    )
    _prune_rotated_tokens(user.id)
    return {"user": build_safe_user(user), "accessToken": access_token, "refreshToken": refresh_token}


def _prune_rotated_tokens(user_id):
    """Drop replay entries once their grace window has passed."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=env.REFRESH_ROTATION_GRACE_SECONDS)
    try:
        User.objects(id=user_id).update_one(pull__rotatedRefreshTokens__rotatedAt__lt=cutoff)
    except Exception:
        pass


def revoke_refresh_token(token):
    try:
        decoded = verify_refresh_token(token)
        User.objects(id=decoded["sub"]).update_one(
            pull__refreshTokens=token,
            pull__rotatedRefreshTokens__token=token,
        )
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
    user.passwordResetOtp = None
    # A password reset is also a "sign me out everywhere": whoever had the old
    # password may still be holding a valid refresh cookie.
    user.refreshTokens = []
    user.rotatedRefreshTokens = []
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


# ---------------------------------------------------------------------------
# Forgot password, OTP flow
#
# The old flow mailed a long random link and nothing else, so an account with
# a dead or mistyped email had no way back in. Now the customer identifies
# themselves, picks where the code should go (email or the registered mobile),
# types the 6 digits, and only then gets a short-lived reset token.
# ---------------------------------------------------------------------------



def mask_email(value):
    text = str(value or "")
    if "@" not in text:
        return text
    name, domain = text.split("@", 1)
    if len(name) <= 2:
        head = name[:1]
    else:
        head = name[:2]
    return head + "*" * max(3, len(name) - len(head)) + "@" + domain


def mask_phone(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) < 4:
        return digits
    return "*" * (len(digits) - 4) + digits[-4:]


def find_account_for_reset(identifier):
    """Look up by email or mobile - the customer types whichever they remember."""
    raw = str(identifier or "").strip()
    if not raw:
        return None
    if "@" in raw:
        return User.objects(email=raw.lower()).first()
    return User.objects(phone__in=phone_variants(raw)).first()


def reset_channels(user):
    """Where a code can actually be delivered for this account.

    Filtered twice over: the account must have that contact detail on file,
    AND the server must be configured to use that transport. Offering SMS on a
    box with no SMS gateway would just walk the customer into a dead end."""
    from .mailer import has_smtp
    from .sms import has_sms

    channels = []
    if user.email:
        channels.append({
            "id": "email", "label": "Email",
            "destination": mask_email(user.email), "available": has_smtp(),
        })
    if user.phone:
        channels.append({
            "id": "sms", "label": "Mobile number",
            "destination": mask_phone(user.phone), "available": has_sms(),
        })

    usable = [c for c in channels if c["available"]]
    # If nothing is configured, still return the options rather than an empty
    # screen - the send step then fails with a message that names the problem.
    return usable or channels


def _generate_otp():
    upper = 10 ** env.OTP_LENGTH
    return str(secrets.randbelow(upper)).zfill(env.OTP_LENGTH)


def issue_reset_otp(user, channel):
    """Create (or re-issue) the code and hand back what the caller must send.

    Returns {"code", "otp", "resendAfter"}. Enforces a per-account resend
    cooldown and a hard cap on how many codes one reset attempt may burn, so
    the endpoint cannot be used to bill the SMS account dry.
    """
    if channel not in ("email", "sms"):
        raise ApiError("Choose whether to receive the code by email or SMS.", 400)
    if channel == "sms" and not user.phone:
        raise ApiError("This account has no mobile number saved. Use email instead.", 400)
    if channel == "email" and not user.email:
        raise ApiError("This account has no email saved. Use SMS instead.", 400)

    now = datetime.now(timezone.utc)
    existing = user.passwordResetOtp
    resend_count = 0

    if existing:
        last_sent = existing.lastSentAt
        if last_sent and last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        expires = existing.expiresAt
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        still_open = expires and expires > now
        if still_open:
            if last_sent:
                waited = (now - last_sent).total_seconds()
                if waited < env.OTP_RESEND_SECONDS:
                    raise ApiError(
                        "Please wait {0} more seconds before asking for another code.".format(
                            int(env.OTP_RESEND_SECONDS - waited)
                        ),
                        429,
                    )
            resend_count = existing.resendCount or 0
            if resend_count >= env.OTP_MAX_SENDS:
                raise ApiError(
                    "Too many codes requested. Please try again in a little while.", 429
                )

    code = _generate_otp()
    destination = user.email if channel == "email" else user.phone
    user.passwordResetOtp = PasswordResetOtp(
        codeHash=hash_token(code),
        channel=channel,
        destination=mask_email(destination) if channel == "email" else mask_phone(destination),
        expiresAt=now + timedelta(minutes=env.OTP_TTL_MINUTES),
        attempts=0,
        resendCount=resend_count + 1,
        lastSentAt=now,
        verifiedAt=None,
    )
    user.save()

    return {
        "otp": code,
        "channel": channel,
        "destination": user.passwordResetOtp.destination,
        "expiresInMinutes": env.OTP_TTL_MINUTES,
        "resendAfterSeconds": env.OTP_RESEND_SECONDS,
    }


def verify_reset_otp(user, code):
    """Check the typed code and, on success, mint the one-shot reset token that
    /auth/reset-password consumes. The OTP itself is never a password."""
    entry = user.passwordResetOtp
    if not entry or not entry.codeHash:
        raise ApiError("Request a new code to continue.", 400)

    expires = entry.expiresAt
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < datetime.now(timezone.utc):
        user.passwordResetOtp = None
        user.save()
        raise ApiError("That code has expired. Request a new one.", 400)

    if (entry.attempts or 0) >= env.OTP_MAX_ATTEMPTS:
        user.passwordResetOtp = None
        user.save()
        raise ApiError("Too many incorrect attempts. Request a new code.", 429)

    typed = "".join(ch for ch in str(code or "") if ch.isdigit())
    if not secrets.compare_digest(hash_token(typed), entry.codeHash):
        entry.attempts = (entry.attempts or 0) + 1
        user.save()
        remaining = max(0, env.OTP_MAX_ATTEMPTS - entry.attempts)
        raise ApiError(
            "That code is not correct. {0} attempt(s) left.".format(remaining) if remaining
            else "That code is not correct. Request a new code.",
            400,
        )

    token = create_token()
    user.passwordResetTokenHash = hash_token(token)
    user.passwordResetTokenExpiresAt = datetime.now(timezone.utc) + timedelta(minutes=15)
    user.passwordResetOtp = None
    user.save()
    return token
