from apps.core.serialization import to_jsonable


def order_to_dict(order):
    """Full raw document, matching Node's res.json(orderDoc) via Mongoose's
    default toJSON — used only by the checkout/verify response."""
    return to_jsonable(order)


def serialize_order(order):
    """Stripped shape for customer-facing order listings — direct port of
    order.controller.js#serializeOrder. Never leaks payment signatures."""
    return {
        "id": str(order.id),
        "orderNumber": order.orderNumber,
        "items": [
            {"name": item.name, "sku": item.sku, "price": item.price, "quantity": item.quantity}
            for item in order.items
        ],
        "subtotal": order.subtotal,
        "discount": order.discount,
        "gst": order.gst,
        "shipping": order.shipping,
        "total": order.total,
        "paymentProvider": order.paymentProvider,
        "paymentStatus": order.paymentStatus,
        "fulfillmentStatus": order.fulfillmentStatus,
        # Delivery tracking, set by an admin. Safe to expose: it is the
        # customer's own courier reference, not a payment detail.
        "trackingNumber": order.trackingNumber or "",
        "shippingProvider": order.shippingProvider or "",
        "estimatedDeliveryDate": (
            order.estimatedDeliveryDate.isoformat() if order.estimatedDeliveryDate else None
        ),
        "shippingAddress": order.shippingAddress or {},
        "createdAt": order.createdAt.isoformat() if order.createdAt else None,
    }
