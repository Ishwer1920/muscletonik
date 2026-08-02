import re

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.utils import write_audit
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.orders.models import Order

from .paging import build_sort, date_range_raw, paging


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("customers")])
def list_customers(request):
    page, limit, skip = paging(request)
    search = str(request.query_params.get("search") or "").strip()

    qs = User.objects(role="customer")
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        qs = qs.filter(__raw__={"$or": [{f: rx} for f in ("name", "email", "phone")]})
    status = request.query_params.get("status")
    if status in ("active", "blocked"):
        qs = qs.filter(status=status)
    date_filter = date_range_raw(request)
    if date_filter:
        qs = qs.filter(__raw__=date_filter)
    sort = build_sort(request, ["name", "email", "status", "createdAt"])

    total = qs.count()
    customers = list(qs.only("name", "email", "phone", "status", "createdAt").order_by(sort).skip(skip).limit(limit))

    ids = [c.id for c in customers]
    orders_col = Order._get_collection()
    stats = list(orders_col.aggregate([
        {"$match": {"user": {"$in": ids}}},
        {"$group": {"_id": "$user", "orders": {"$sum": 1},
                    "spent": {"$sum": {"$cond": [{"$eq": ["$paymentStatus", "paid"]}, "$total", 0]}}}},
    ]))
    stat_map = {str(s["_id"]): s for s in stats}

    return Response({
        "page": page, "limit": limit, "total": total, "totalPages": max(1, -(-total // limit)),
        "customers": [
            {
                "id": str(c.id), "name": c.name, "email": c.email, "phone": c.phone or "",
                "status": c.status, "createdAt": c.createdAt.isoformat() if c.createdAt else None,
                "orders": stat_map.get(str(c.id), {}).get("orders", 0),
                "spent": stat_map.get(str(c.id), {}).get("spent", 0),
            }
            for c in customers
        ],
    })


def get_customer(request, customer_id):
    try:
        ObjectId(customer_id)
    except InvalidId:
        return Response({"message": "Customer not found"}, status=404)

    user = User.objects(id=customer_id).only(
        "name", "email", "phone", "status", "addresses", "wishlist", "createdAt", "role"
    ).first()
    if not user or user.role != "customer":
        return Response({"message": "Customer not found"}, status=404)

    orders = Order.objects(user=user.id).order_by("-createdAt").limit(20)
    return Response({
        "customer": {
            "id": str(user.id), "name": user.name, "email": user.email, "phone": user.phone or "",
            "status": user.status,
            "addresses": [a.to_mongo().to_dict() for a in user.addresses],
            "wishlistCount": len(user.wishlist or []),
            "createdAt": user.createdAt.isoformat() if user.createdAt else None,
        },
        "orders": [
            {
                "id": str(o.id), "orderNumber": o.orderNumber, "total": o.total,
                "paymentProvider": o.paymentProvider, "paymentStatus": o.paymentStatus,
                "fulfillmentStatus": o.fulfillmentStatus,
                "createdAt": o.createdAt.isoformat() if o.createdAt else None,
            }
            for o in orders
        ],
    })


def update_customer_status(request, customer_id):
    try:
        ObjectId(customer_id)
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [{"msg": "Invalid customer id.", "param": "id"}]}, status=400)
    status = request.data.get("status")
    if status not in ("active", "blocked"):
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Status must be active or blocked.", "param": "status"}
        ]}, status=400)

    # NOT .only(...) — mongoengine validates the *whole* document on save(),
    # so a partially-loaded doc fails on required fields it never fetched.
    user = User.objects(id=customer_id).first()
    if not user or user.role != "customer":
        return Response({"message": "Customer not found"}, status=404)

    before = user.status
    user.status = status
    user.save()
    write_audit(request, "customer.status", user.email, {"before": before, "after": user.status})
    return Response({"message": "Customer updated.", "status": user.status})


@api_view(["GET", "PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("customers")])
def customer_detail(request, customer_id):
    return get_customer(request, customer_id) if request.method == "GET" else update_customer_status(request, customer_id)
