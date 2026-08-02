from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/payment.model.js.


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class Payment(me.Document):
    user = me.ObjectIdField(required=True)
    order = me.ObjectIdField(required=True)
    checkoutSessionId = me.StringField(default="")
    provider = me.StringField(default="razorpay")
    razorpayOrderId = me.StringField(default="")
    razorpayPaymentId = me.StringField(default="")
    razorpaySignature = me.StringField(default="")
    status = me.StringField(choices=["created", "pending", "paid", "failed", "refunded"], default="created")
    kind = me.StringField(choices=["full", "cod_advance", "cod_balance"], default="full")
    amount = me.FloatField(required=True, min_value=0)
    currency = me.StringField(default="INR")
    metadata = me.DynamicField(default=dict)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "payments",
        "indexes": ["checkoutSessionId", "razorpayOrderId", "razorpayPaymentId"],
        "strict": False,
    }

    save = _timestamped_save
