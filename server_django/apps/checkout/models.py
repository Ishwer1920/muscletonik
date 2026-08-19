from datetime import datetime, timezone

import mongoengine as me

# Port of server/src/models/coupon.model.js, extended with the targeting and
# per-customer limits the admin panel needs (purpose, scope, caps).


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


# What the coupon is FOR. Purely descriptive for reporting/filtering - it does
# not change the maths, except that "referral" and "welcome" codes are the ones
# the signup form is allowed to accept.
COUPON_PURPOSES = [
    "general",     # plain promo code
    "referral",    # given out by an existing customer / affiliate
    "welcome",     # first-time signup incentive
    "seasonal",    # sale or festival campaign
    "influencer",  # creator / partner code
    "loyalty",     # repeat-customer reward
    "clearance",   # move ageing stock
]

# Which products the discount is allowed to touch.
COUPON_SCOPES = ["all", "brands", "categories", "products"]


class Coupon(me.Document):
    code = me.StringField(required=True, unique=True)
    title = me.StringField(required=True)
    type = me.StringField(choices=["percent", "flat", "free_shipping"], required=True)

    # --- what this coupon is for -------------------------------------------
    purpose = me.StringField(choices=COUPON_PURPOSES, default="general")
    description = me.StringField(default="")
    campaign = me.StringField(default="")
    # For referral/influencer codes: whose code this is. Free text (email or
    # name) so a code can be attributed without forcing a user account.
    ownerEmail = me.StringField(default="")

    # --- what it applies to -------------------------------------------------
    appliesTo = me.StringField(choices=COUPON_SCOPES, default="all")
    brands = me.ListField(me.StringField(), default=list)
    categories = me.ListField(me.StringField(), default=list)
    productSkus = me.ListField(me.StringField(), default=list)

    # --- the maths ----------------------------------------------------------
    value = me.FloatField(default=0, min_value=0)
    minOrder = me.FloatField(default=0, min_value=0)
    # Ceiling for percent coupons: "20% off, up to Rs.500". 0 = uncapped.
    maxDiscount = me.FloatField(default=0, min_value=0)

    # --- who may use it, and how often -------------------------------------
    maxUses = me.IntField(default=0, min_value=0)        # 0 = unlimited overall
    perUserLimit = me.IntField(default=0, min_value=0)   # 0 = unlimited per customer
    firstOrderOnly = me.BooleanField(default=False)
    usageCount = me.IntField(default=0, min_value=0)

    # --- when it is live ----------------------------------------------------
    startsAt = me.DateTimeField(default=None)
    expiresAt = me.DateTimeField(default=None)
    active = me.BooleanField(default=True)

    notes = me.StringField(default="")
    createdBy = me.StringField(default="")
    updatedBy = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "coupons",
        "indexes": ["code", "purpose", {"fields": ["active", "expiresAt"]}],
        "strict": False,
    }

    save = _timestamped_save


class CouponRedemption(me.Document):
    """One row per successful use. This is what makes perUserLimit and
    firstOrderOnly enforceable - the aggregate usageCount on the coupon can
    only answer "how many times in total", never "how many times by them"."""

    coupon = me.ObjectIdField(required=True)
    code = me.StringField(required=True)
    user = me.ObjectIdField(required=True)
    order = me.ObjectIdField(default=None)
    orderNumber = me.StringField(default="")
    discount = me.FloatField(default=0, min_value=0)
    orderTotal = me.FloatField(default=0, min_value=0)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "coupon_redemptions",
        "indexes": [
            "code",
            {"fields": ["coupon", "user"]},
            {"fields": ["user", "-createdAt"]},
        ],
        "strict": False,
    }

    save = _timestamped_save
