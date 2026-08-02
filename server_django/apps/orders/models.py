from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/order.model.js.


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class OrderItem(me.EmbeddedDocument):
    product = me.ObjectIdField(required=True)
    name = me.StringField(required=True)
    sku = me.StringField(default="")
    price = me.FloatField(required=True, min_value=0)
    quantity = me.IntField(required=True, min_value=1)


class Order(me.Document):
    orderNumber = me.StringField(required=True, unique=True)
    user = me.ObjectIdField(required=True)
    items = me.EmbeddedDocumentListField(OrderItem, default=list)
    subtotal = me.FloatField(default=0, min_value=0)
    discount = me.FloatField(default=0, min_value=0)
    gst = me.FloatField(default=0, min_value=0)
    shipping = me.FloatField(default=0, min_value=0)
    total = me.FloatField(default=0, min_value=0)
    paymentStatus = me.StringField(
        choices=["pending", "partially_paid", "paid", "failed", "refunded"], default="pending"
    )
    advancePaid = me.FloatField(default=0, min_value=0)
    balanceDue = me.FloatField(default=0, min_value=0)
    fulfillmentStatus = me.StringField(
        choices=["pending", "confirmed", "packed", "ready_to_ship", "shipped",
                 "out_for_delivery", "delivered", "cancelled", "returned", "refunded"],
        default="pending",
    )
    paymentProvider = me.StringField(default="")
    razorpayOrderId = me.StringField(default="")
    razorpayPaymentId = me.StringField(default="")
    razorpaySignature = me.StringField(default="")
    trackingNumber = me.StringField(default="")
    shippingProvider = me.StringField(default="")
    shippingAddress = me.DynamicField(default=dict)
    billingAddress = me.DynamicField(default=dict)
    notes = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {"collection": "orders", "indexes": ["orderNumber"], "strict": False}

    save = _timestamped_save
