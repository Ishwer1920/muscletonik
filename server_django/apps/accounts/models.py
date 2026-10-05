import mongoengine as me

from apps.core.rbac import ALL_ROLES

# Field-for-field port of server/src/models/user.model.js.


class Address(me.EmbeddedDocument):
    label = me.StringField(default="Home")
    fullName = me.StringField(required=True)
    phone = me.StringField(required=True)
    line1 = me.StringField(required=True)
    line2 = me.StringField(default="")
    city = me.StringField(required=True)
    state = me.StringField(required=True)
    postalCode = me.StringField(required=True)
    country = me.StringField(default="India")
    isDefault = me.BooleanField(default=False)


class CartItem(me.EmbeddedDocument):
    product = me.ObjectIdField(required=True)
    quantity = me.IntField(default=1, min_value=1)


class RotatedRefreshToken(me.EmbeddedDocument):
    """A refresh token that has just been swapped for a newer pair.

    Two tabs (or two parallel requests from one page) can both hit
    /auth/refresh holding the same cookie. Without this, the first request
    wins and every other one gets "Refresh session not recognized" -> the
    admin panel bounces to the login screen for no reason. Keeping the old
    token for a short grace period lets the losers replay the same answer."""

    token = me.StringField(required=True)
    accessToken = me.StringField(default="")
    replacement = me.StringField(default="")
    rotatedAt = me.DateTimeField()


class PasswordResetOtp(me.EmbeddedDocument):
    """A one-time code issued for the forgot-password flow, delivered to
    either the account email or the account mobile number."""

    codeHash = me.StringField(required=True)
    channel = me.StringField(choices=["email", "sms"], default="email")
    destination = me.StringField(default="")   # masked, safe to echo back
    expiresAt = me.DateTimeField()
    attempts = me.IntField(default=0)
    resendCount = me.IntField(default=0)
    lastSentAt = me.DateTimeField()
    verifiedAt = me.DateTimeField(default=None)


class User(me.Document):
    name = me.StringField(required=True)
    email = me.EmailField(required=True, unique=True)
    phone = me.StringField(default="")
    avatarUrl = me.StringField(default="")
    passwordHash = me.StringField(required=True)
    role = me.StringField(choices=ALL_ROLES, default="customer")
    permissions = me.ListField(me.StringField(), default=list)
    emailVerified = me.BooleanField(default=False)
    verificationTokenHash = me.StringField(default="")
    verificationTokenExpiresAt = me.DateTimeField(default=None)
    passwordResetTokenHash = me.StringField(default="")
    passwordResetTokenExpiresAt = me.DateTimeField(default=None)
    refreshTokens = me.ListField(me.StringField(), default=list)
    rotatedRefreshTokens = me.EmbeddedDocumentListField(RotatedRefreshToken, default=list)
    passwordResetOtp = me.EmbeddedDocumentField(PasswordResetOtp, default=None)
    addresses = me.EmbeddedDocumentListField(Address, default=list)
    wishlist = me.ListField(me.ObjectIdField(), default=list)
    cart = me.EmbeddedDocumentListField(CartItem, default=list)
    status = me.StringField(choices=["active", "blocked"], default="active")
    # Referral / welcome coupon code entered at signup, if it checked out.
    referralCode = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "users",
        "indexes": ["email", "phone"],
        "strict": False,  # Mongoose writes a __v version key we don't model
    }

    def save(self, *args, **kwargs):
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        if not self.createdAt:
            self.createdAt = now
        self.updatedAt = now
        return super().save(*args, **kwargs)

    def build_safe_user(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "avatarUrl": self.avatarUrl,
            "role": self.role,
            "emailVerified": self.emailVerified,
        }


class OtpSession(me.Document):
    """A one-time code for passwordless login or signup, keyed by the contact
    (email or 10-digit mobile) the shopper is proving control of.

    Kept in its own collection rather than on the User, because a signup code
    has to exist *before* any User row does, and so it never collides with the
    forgot-password code embedded on the User (passwordResetOtp)."""

    identifier = me.StringField(required=True, unique=True)  # normalized email / phone
    channel = me.StringField(choices=["email", "sms"], default="email")
    destination = me.StringField(default="")                 # masked, safe to echo
    purpose = me.StringField(choices=["login", "signup"], default="login")
    name = me.StringField(default="")                        # captured for a new signup
    codeHash = me.StringField(required=True)
    expiresAt = me.DateTimeField()
    attempts = me.IntField(default=0)
    resendCount = me.IntField(default=0)
    lastSentAt = me.DateTimeField()
    createdAt = me.DateTimeField()

    meta = {
        "collection": "otpsessions",
        "indexes": ["identifier"],
        "strict": False,
    }
