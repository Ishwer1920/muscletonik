from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.catalog.models import Product
from apps.core.permissions import RequireAuth, RequirePermission
from apps.payments.models import Payment

from .models import Order, OrderFeedback
from .serializers import serialize_order

FULFILLMENT_STATUSES = {
    "pending", "confirmed", "packed", "ready_to_ship", "shipped",
    "out_for_delivery", "delivered", "cancelled", "returned", "refunded",
}
PAYMENT_STATUSES = {"pending", "paid", "failed", "refunded"}

# Delivery details an admin can edit alongside the statuses.
MAX_TRACKING = 120


def _parse_delivery_date(value):
    """Accept "YYYY-MM-DD" (what the admin date input sends) or a full ISO
    timestamp. Returns (datetime|None, ok). An empty string is a deliberate
    clear, so it comes back as (None, True)."""
    from datetime import datetime, timezone
    text = str(value or "").strip()
    if not text:
        return None, True
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None, False
    return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)), True


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


def _product_media_index(orders):
    """Look up every product referenced by these orders in one go, so the admin
    list can show a thumbnail and the full catalogue name for each line item.

    Order items only store a snapshot name (often terse, e.g. "CREATINE
    MONOHYDRATE"); the image and the full product title live on the Product.
    We match on the stored product id first, then fall back to the catalogId
    embedded in the SKU ("MT-7" -> 7) for older items saved before the id was
    reliable. Returns two dicts: {str(objectId): product} and {catalogId: product}.
    """
    object_ids, catalog_ids = set(), set()
    for order in orders:
        for item in order.items:
            if getattr(item, "product", None):
                object_ids.add(item.product)
            cid = _catalog_id_from_sku(item.sku)
            if cid is not None:
                catalog_ids.add(cid)

    by_id, by_catalog = {}, {}
    if object_ids:
        for p in Product.objects(id__in=list(object_ids)):
            by_id[str(p.id)] = p
    if catalog_ids:
        for p in Product.objects(catalogId__in=list(catalog_ids)):
            by_catalog[p.catalogId] = p
    return by_id, by_catalog


def _enrich_items_with_media(order, entry, by_id, by_catalog):
    """Attach image / full name / colour to each serialized item line, matching
    it back to its catalogue product. entry["items"] is in the same order as
    order.items, so we can zip them."""
    for serialized, raw in zip(entry["items"], order.items):
        product = None
        if getattr(raw, "product", None):
            product = by_id.get(str(raw.product))
        if product is None:
            cid = _catalog_id_from_sku(raw.sku)
            if cid is not None:
                product = by_catalog.get(cid)

        # Every photo the admin added for this product: the main images plus
        # any gallery images, de-duplicated and order-preserved. The dashboard
        # shows the first as a thumbnail and opens the whole set in a lightbox.
        images = []
        if product:
            for url in list(product.images or []) + list(product.galleryImages or []):
                if url and url not in images:
                    images.append(url)

        # If the customer chose a flavour, lead with that flavour's own photo so
        # the thumbnail and the first lightbox slide match exactly what shipped.
        flavor = (serialized.get("flavor") or "").strip()
        if flavor and product:
            for f in (product.flavors or []):
                if (f.name or "").strip().lower() == flavor.lower() and f.image:
                    if f.image in images:
                        images.remove(f.image)
                    images.insert(0, f.image)
                    break

        serialized["image"] = images[0] if images else ""
        serialized["images"] = images
        serialized["catalogId"] = (
            product.catalogId if product else _catalog_id_from_sku(raw.sku)
        )
        # The full catalogue title ("Creatine Monohydrate, Unflavored, 250g")
        # vs the terse snapshot stored on the order ("CREATINE MONOHYDRATE").
        serialized["productName"] = product.name if product else raw.name
        serialized["color"] = (product.color if product else "") or "#111111"
        if not serialized.get("weight") and product and product.weight:
            serialized["weight"] = product.weight


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
    by_id, by_catalog = _product_media_index(orders)

    result = []
    for order in orders:
        entry = serialize_order(order)
        _enrich_items_with_media(order, entry, by_id, by_catalog)
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

    delivery_date = None
    if "estimatedDeliveryDate" in request.data:
        delivery_date, ok = _parse_delivery_date(request.data.get("estimatedDeliveryDate"))
        if not ok:
            errors.append({"msg": "Estimated delivery must be a valid date.",
                           "param": "estimatedDeliveryDate"})

    for field in ("trackingNumber", "shippingProvider"):
        if field in request.data and len(str(request.data.get(field) or "")) > MAX_TRACKING:
            errors.append({"msg": "%s is too long (max %d characters)." % (field, MAX_TRACKING),
                           "param": field})

    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    update = {}
    if fulfillment_status:
        update["fulfillmentStatus"] = fulfillment_status
    if payment_status:
        update["paymentStatus"] = payment_status
    # These are editable to empty: clearing a tracking number or a delivery
    # date is a real action, so presence of the key is what counts, not truth.
    if "estimatedDeliveryDate" in request.data:
        update["estimatedDeliveryDate"] = delivery_date
    for field in ("trackingNumber", "shippingProvider"):
        if field in request.data:
            update[field] = str(request.data.get(field) or "").strip()
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
