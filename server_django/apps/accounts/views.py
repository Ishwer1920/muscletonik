import os
import time
import uuid

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import env as mt_env
from apps.core.exceptions import ApiError
from apps.core.permissions import RequireAuth

from . import services, validation
from .mailer import send_mail
from .sms import send_otp_sms
from .models import User


REFRESH_COOKIE_MAXAGE = mt_env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60
ACCESS_COOKIE_MAXAGE = mt_env.ACCESS_TOKEN_TTL_MINUTES * 60


def _cookie_kwargs():
    return {
        "httponly": True,
        "samesite": "Lax",
        "secure": mt_env.IS_PRODUCTION,
        "path": "/",
    }


def set_auth_cookies(response, access_token, refresh_token):
    # Both cookies carry an explicit max-age. The access cookie used to be a
    # browser-session cookie, so closing the tab threw the session away even
    # though the refresh token was still valid for weeks.
    response.set_cookie("accessToken", access_token, max_age=ACCESS_COOKIE_MAXAGE, **_cookie_kwargs())
    response.set_cookie("refreshToken", refresh_token, max_age=REFRESH_COOKIE_MAXAGE, **_cookie_kwargs())


def clear_auth_cookies(response):
    response.delete_cookie("accessToken", path="/")
    response.delete_cookie("refreshToken", path="/")


def _validation_response(errors):
    return Response({"message": "Validation failed", "errors": errors}, status=400)


def safe_user_full(user):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone or "",
        "avatarUrl": user.avatarUrl or "",
        "role": user.role,
        "emailVerified": user.emailVerified,
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    errors = validation.validate_register(request.data)
    if errors:
        return _validation_response(errors)

    result = services.register_user(request.data)
    verification_url = f"{mt_env.CLIENT_ORIGIN}/verify-email.html?token={result['verificationToken']}"
    send_mail(
        result["user"]["email"],
        "Verify your Muscle Tonik account",
        f'<p>Welcome to Muscle Tonik.</p><p>Verify your email here: <a href="{verification_url}">{verification_url}</a></p>',
    )
    body = {"message": "Account created", "user": result["user"]}
    if result["user"].get("referralCode"):
        body["message"] = "Account created. Referral code " + result["user"]["referralCode"] + " saved."
    if not mt_env.IS_PRODUCTION:
        body["verificationUrl"] = verification_url
    return Response(body, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    errors = validation.validate_login(request.data)
    if errors:
        return _validation_response(errors)

    result = services.login_user(
        request.data.get("identifier"),
        request.data.get("email"),
        request.data.get("password"),
        request.data.get("rememberMe", False),
    )
    response = Response({"message": "Logged in", "user": result["user"]})
    set_auth_cookies(response, result["accessToken"], result["refreshToken"])
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def logout(request):
    token = request.COOKIES.get("refreshToken")
    if token:
        services.revoke_refresh_token(token)
    response = Response({"message": "Logged out"})
    clear_auth_cookies(response)
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh(request):
    token = request.COOKIES.get("refreshToken")
    if not token:
        return Response({"message": "Refresh token missing"}, status=401)
    result = services.rotate_refresh_token(token)
    response = Response({"message": "Session refreshed", "user": result["user"]})
    set_auth_cookies(response, result["accessToken"], result["refreshToken"])
    return response


@api_view(["GET"])
@permission_classes([RequireAuth])
def me(request):
    user = User.objects(id=request.user.sub).first()
    if not user:
        return Response({"message": "User not found"}, status=404)
    return Response({"user": {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatarUrl": user.avatarUrl,
        "role": user.role,
        "emailVerified": user.emailVerified,
        "addresses": [a.to_mongo().to_dict() for a in user.addresses],
        "wishlist": [str(pid) for pid in user.wishlist],
        "cart": [{"product": str(c.product), "quantity": c.quantity} for c in user.cart],
        "createdAt": user.createdAt.isoformat() if user.createdAt else None,
        "updatedAt": user.updatedAt.isoformat() if user.updatedAt else None,
    }})


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    errors = validation.validate_email_field(request.data)
    if errors:
        return _validation_response(errors)
    result = services.issue_password_reset(request.data.get("email"))
    body = {"message": "If the account exists, a reset email has been prepared"}
    if not mt_env.IS_PRODUCTION:
        body["resetToken"] = result.get("token")
    return Response(body)


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password_handler(request):
    errors = validation.validate_reset(request.data)
    if errors:
        return _validation_response(errors)
    user = services.reset_password(request.data.get("token"), request.data.get("password"))
    return Response({"message": "Password updated", "user": user})


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email_handler(request):
    errors = validation.validate_verify_email(request.data)
    if errors:
        return _validation_response(errors)
    user = services.verify_email(request.data.get("token"))
    return Response({"message": "Email verified", "user": user})


@api_view(["POST"])
@permission_classes([RequireAuth])
def change_password(request):
    errors = validation.validate_change_password(request.data)
    if errors:
        return _validation_response(errors)

    user = User.objects(id=request.user.sub).first()
    if not user:
        return Response({"message": "User not found"}, status=404)
    if not services.check_password(request.data.get("currentPassword"), user.passwordHash):
        return Response({"message": "Current password is incorrect"}, status=400)
    user.passwordHash = services.hash_password(request.data.get("newPassword"))
    user.save()
    return Response({"message": "Password changed"})


@api_view(["PATCH"])
@permission_classes([RequireAuth])
def update_profile(request):
    errors = validation.validate_update_profile(request.data)
    if errors:
        return _validation_response(errors)

    update = {}
    name = request.data.get("name")
    if isinstance(name, str) and name.strip():
        update["name"] = name.strip()
    phone = request.data.get("phone")
    if isinstance(phone, str):
        update["phone"] = phone.strip()

    if not update:
        return Response({"message": "Nothing to update."}, status=400)

    user = User.objects(id=request.user.sub).first()
    if not user:
        return Response({"message": "User not found"}, status=404)
    for key, value in update.items():
        setattr(user, key, value)
    user.save()
    return Response({"message": "Profile updated", "user": safe_user_full(user)})


AVATAR_DIR = mt_env.UPLOADS_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
AVATAR_MAX_BYTES = 5 * 1024 * 1024


class UploadAvatarView(APIView):
    permission_classes = [RequireAuth]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get("avatar")
        if not file:
            return Response({"message": "No image was uploaded."}, status=400)
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise ApiError("Only JPEG, PNG, WEBP, and GIF images are allowed.", 400)
        if file.size > AVATAR_MAX_BYTES:
            raise ApiError("Image must be 5MB or smaller.", 400)

        ext = os.path.splitext(file.name or "")[1].lower() or ".bin"
        stamp = f"{int(time.time() * 1000)}-{uuid.uuid4().int % 1_000_000_000}"
        filename = f"{request.user.sub}-{stamp}{ext}"
        dest = AVATAR_DIR / filename
        with open(dest, "wb") as out:
            for chunk in file.chunks():
                out.write(chunk)

        scheme = "https" if request.is_secure() else "http"
        url = f"{scheme}://{request.get_host()}/uploads/avatars/{filename}"

        existing = User.objects(id=request.user.sub).first()
        if existing and existing.avatarUrl:
            marker = "/uploads/avatars/"
            if marker in existing.avatarUrl:
                prev_name = existing.avatarUrl.split(marker)[1]
                prev_path = AVATAR_DIR / prev_name
                if prev_path.exists():
                    try:
                        prev_path.unlink()
                    except OSError:
                        pass

        user = User.objects(id=request.user.sub).first()
        if not user:
            return Response({"message": "User not found"}, status=404)
        user.avatarUrl = url
        user.save()
        return Response({"message": "Profile photo updated", "avatarUrl": url, "user": safe_user_full(user)}, status=201)


# ---------------------------------------------------------------------------
# Forgot password, OTP flow: lookup -> send code -> verify -> set new password
# ---------------------------------------------------------------------------

GENERIC_LOOKUP_FAILURE = (
    "We could not find an account with that email or mobile number."
)


def _otp_debug(body, code):
    """Outside production the code is echoed back so the flow can be tested
    without a working mail server or SMS account. Never in production."""
    if not mt_env.IS_PRODUCTION:
        body["devCode"] = code
    return body


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_lookup(request):
    """Step 1. Identify the account and report where a code can be sent.

    This deliberately confirms whether an account exists, because the customer
    has to choose between their email and their mobile before anything is
    sent. That is the same trade-off every Indian storefront OTP flow makes;
    the endpoint is rate limited and reveals only masked destinations.
    """
    identifier = str(request.data.get("identifier") or "").strip()
    if len(identifier) < 3:
        return _validation_response([
            {"msg": "Enter your registered email or mobile number.", "param": "identifier"}
        ])

    user = services.find_account_for_reset(identifier)
    if not user:
        return Response({"message": GENERIC_LOOKUP_FAILURE}, status=404)

    channels = services.reset_channels(user)
    if not channels:
        return Response({
            "message": "This account has no email or mobile number on file. Please contact support.",
        }, status=400)

    # The account holder's real name is deliberately NOT returned. Anyone can
    # call this endpoint with a guessed address, and echoing the name would
    # hand out personal data to whoever asks. Masked destinations are enough
    # for the customer to recognise their own account.
    return Response({
        "message": "Choose where you want the verification code sent.",
        "identifier": identifier,
        "channels": channels,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_send_otp(request):
    """Step 2. Generate the code and deliver it on the chosen channel."""
    identifier = str(request.data.get("identifier") or "").strip()
    channel = str(request.data.get("channel") or "").strip().lower()

    user = services.find_account_for_reset(identifier)
    if not user:
        return Response({"message": GENERIC_LOOKUP_FAILURE}, status=404)

    issued = services.issue_reset_otp(user, channel)
    code = issued["otp"]
    minutes = issued["expiresInMinutes"]

    if channel == "sms":
        delivered = send_otp_sms(user.phone, code, minutes)
        sent_to = "your mobile number ending " + issued["destination"][-4:]
    else:
        delivered = send_mail(
            user.email,
            "Your Muscle Tonik password reset code",
            "<p>Hi " + (user.name or "there") + ",</p>"
            "<p>Your password reset code is:</p>"
            '<p style="font-size:26px;font-weight:700;letter-spacing:4px;">' + code + "</p>"
            "<p>It expires in " + str(minutes) + " minutes. If you did not request this, "
            "you can ignore this email.</p>",
        )
        sent_to = issued["destination"]

    body = {
        "channel": channel,
        "destination": issued["destination"],
        "expiresInMinutes": minutes,
        "resendAfterSeconds": issued["resendAfterSeconds"],
        "delivered": bool(delivered),
    }

    if not delivered:
        # The code is valid either way. Say so plainly rather than pretending
        # a message went out that the gateway never accepted.
        body["message"] = (
            "We could not deliver the code right now. Please try the other option, "
            "or contact support if this keeps happening."
        )
        return Response(_otp_debug(body, code), status=502)

    body["message"] = "Verification code sent to " + sent_to + "."
    return Response(_otp_debug(body, code))


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_verify_otp(request):
    """Step 3. Trade a correct code for a short-lived reset token."""
    identifier = str(request.data.get("identifier") or "").strip()
    code = str(request.data.get("code") or "").strip()

    if not code:
        return _validation_response([{"msg": "Enter the code you received.", "param": "code"}])

    user = services.find_account_for_reset(identifier)
    if not user:
        return Response({"message": GENERIC_LOOKUP_FAILURE}, status=404)

    token = services.verify_reset_otp(user, code)
    return Response({
        "message": "Code verified. Choose a new password.",
        "resetToken": token,
    })
