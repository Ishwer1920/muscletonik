from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/coupon.model.js.


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class Coupon(me.Document):
    code = me.StringField(required=True, unique=True)
    title = me.StringField(required=True)
    type = me.StringField(choices=["percent", "flat", "free_shipping"], required=True)
    value = me.FloatField(default=0, min_value=0)
    minOrder = me.FloatField(default=0, min_value=0)
    maxUses = me.IntField(default=0, min_value=0)
    usageCount = me.IntField(default=0, min_value=0)
    expiresAt = me.DateTimeField(default=None)
    active = me.BooleanField(default=True)
    notes = me.StringField(default="")
    createdBy = me.StringField(default="")
    updatedBy = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "coupons",
        "indexes": ["code", {"fields": ["active", "expiresAt"]}],
        "strict": False,
    }

    save = _timestamped_save
