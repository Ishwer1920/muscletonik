from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.permissions import RequireAuth, RequirePermission
from apps.payments.models import Payment

from .models import Order, OrderFeedback
from .serializers import serialize_order

FULFILLMENT_STATUSES = {
    "pending", "confirmed", "packed", "ready_to_ship", "shipped",
    "out_for_delivery", "delivered", "cancelled", "returned", "refunded",
}
PAYMENT_STATUSES = {"pending", "paid", "failed", "refunded"}


@api_view(["GET"])
@permission_classes([RequireAuth])
def list_my_orders(request):
    orders = Order.objects(user=request.user.sub).order_by("-createdAt")
    return Response({"orders": [serialize_order(o) for o in orders]})


@api_view(["GET", "POST"])
@permission_classes([RequireAuth])
def order_feedback(request, order_number):
    """The post-order pop-up: how was the service, plus an optional comment.

    GET reports whether this order has already been rated, so the pop-up is
    only ever shown once. Product star ratings from the same pop-up go to the
    reviews endpoint instead - they belong to the products, not the order.
    """
    order = Order.objects(orderNumber=str(order_number or "").strip()).first()
    if not order or str(order.user) != str(request.user.sub):
        return Response({"message": "Order not found"}, status=404)

    existing = OrderFeedback.objects(orderNumber=order.orderNumber).first()

    if request.method == "GET":
        return Response({
            "submitted": existing is not None,
            "rating": existing.rating if existing else 0,
            "text": (existing.text if existing else "") or "",
            "items": [
                # catalogId is what the reviews endpoint is keyed on; the SKU
                # is the only place the order keeps it.
                {
                    "catalogId": _catalog_id_from_sku(item.sku),
                    "name": item.name,
                    "sku": item.sku,
                }
                for item in order.items
            ],
        })

    try:
        rating = int(round(float(request.data.get("rating"))))
    except (TypeError, ValueError):
        rating = 0
    if not 1 <= rating <= 5:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Please choose a rating from 1 to 5 stars.", "param": "rating"}
        ]}, status=400)

    text = str(request.data.get("text") or "").strip()[:2000]

    doc = existing or OrderFeedback(orderNumber=order.orderNumber, user=order.user)
    doc.customerName = getattr(request.user, "name", "") or ""
    doc.rating = rating
    doc.text = text
    doc.save()
    return Response({"message": "Thanks for the feedback!", "submitted": True}, status=201)


def _catalog_id_from_sku(sku):
    """"MT-1234" -> 1234. Returns None for anything else."""
    raw = str(sku or "").strip().upper()
    if not raw.startswith("MT-"):
        return None
    try:
        return int(raw[3:])
    except ValueError:
        return None


@api_view(["GET"])
@permission_classes([RequirePermission("orders")])
def list_all_orders(request):
    filters = {}
    if request.query_params.get("paymentProvider"):
        filters["paymentProvider"] = request.query_params["paymentProvider"]
    if request.query_params.get("fulfillmentStatus"):
        filters["fulfillmentStatus"] = request.query_params["fulfillmentStatus"]

    orders = list(Order.objects(**filters).order_by("-createdAt"))
    users = {str(u.id): u for u in User.objects(id__in=[o.user for o in orders])}

    result = []
    for order in orders:
        entry = serialize_order(order)
        user = users.get(str(order.user))
        entry["customer"] = {"name": user.name, "email": user.email, "phone": user.phone} if user else None
        result.append(entry)

    return Response({"count": len(result), "orders": result})


@api_view(["PATCH"])
@permission_classes([RequirePermission("orders")])
def update_order_status(request, order_id):
    try:
        ObjectId(order_id)
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Invalid order id.", "param": "id"}
        ]}, status=400)

    errors = []
    fulfillment_status = request.data.get("fulfillmentStatus")
    if fulfillment_status is not None and fulfillment_status not in FULFILLMENT_STATUSES:
        errors.append({"msg": "Invalid fulfillment status.", "param": "fulfillmentStatus"})
    payment_status = request.data.get("paymentStatus")
    if payment_status is not None and payment_status not in PAYMENT_STATUSES:
        errors.append({"msg": "Invalid payment status.", "param": "paymentStatus"})
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    update = {}
    if fulfillment_status:
        update["fulfillmentStatus"] = fulfillment_status
    if payment_status:
        update["paymentStatus"] = payment_status
    if not update:
        return Response({"message": "Nothing to update."}, status=400)

    order = Order.objects(id=order_id).first()
    if not order:
        return Response({"message": "Order not found."}, status=404)
    for key, value in update.items():
        setattr(order, key, value)
    order.save()

    if payment_status:
        Payment.objects(order=order.id).update(set__status=payment_status)

    return Response({"message": "Order updated.", "order": serialize_order(order)})
