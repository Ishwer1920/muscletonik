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
    # The pack/weight the customer chose, e.g. "2 KG". Blank for single-price
    # products. `price` is the unit price for that pack, server-computed.
    weight = me.StringField(default="")
    price = me.FloatField(required=True, min_value=0)
    quantity = me.IntField(required=True, min_value=1)


class OrderFeedback(me.Document):
    """How a customer rated the service after an order.

    Separate from a product Review: this is about the shop (checkout, delivery,
    support), not about anything in the box, so it has no productId and never
    feeds a product's star rating. Written straight from the post-order pop-up.
    """

    orderNumber = me.StringField(required=True, unique=True)
    user = me.ObjectIdField(required=True)
    customerName = me.StringField(default="")
    rating = me.IntField(required=True, min_value=1, max_value=5)
    text = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "order_feedback",
        "indexes": ["orderNumber", "user", "-createdAt"],
        "strict": False,
    }

    save = _timestamped_save


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
    # When the customer should expect it. Set by an admin in Admin -> Orders;
    # null until someone fills it in, so nothing is promised by default.
    estimatedDeliveryDate = me.DateTimeField(null=True, default=None)
    shippingAddress = me.DynamicField(default=dict)
    billingAddress = me.DynamicField(default=dict)
    notes = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {"collection": "orders", "indexes": ["orderNumber"], "strict": False}

    save = _timestamped_save
