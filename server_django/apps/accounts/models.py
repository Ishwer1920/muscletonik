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
    addresses = me.EmbeddedDocumentListField(Address, default=list)
    wishlist = me.ListField(me.ObjectIdField(), default=list)
    cart = me.EmbeddedDocumentListField(CartItem, default=list)
    status = me.StringField(choices=["active", "blocked"], default="active")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "users",
        "indexes": ["email"],
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
