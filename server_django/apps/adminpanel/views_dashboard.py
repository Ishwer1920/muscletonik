from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.utils import write_audit
from apps.catalog.models import Product
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.rbac import ADMIN_PANEL_ROLES, PERMISSIONS, permissions_for_role
from apps.core.serialization import to_jsonable
from apps.orders.models import Order

from . import services

LOW_STOCK_THRESHOLD = 5


def _start_of_today():
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@api_view(["GET"])
@permission_classes([RequireAdminPanel])
def get_admin_me(request):
    user = User.objects(id=request.user.sub).only("name", "email", "role", "permissions").first()
    if not user:
        return Response({"message": "Account not found"}, status=404)
    return Response({
        "user": {
            "id": str(user.id), "name": user.name, "email": user.email, "role": user.role,
            "permissions": permissions_for_role(user.role, user.permissions),
        },
        "allPermissions": PERMISSIONS,
    })


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("dashboard")])
def get_dashboard_stats(request):
    today_start = _start_of_today()
    orders_col = Order._get_collection()
    users_col = User._get_collection()
    products_col = Product._get_collection()

    today_orders = orders_col.count_documents({"createdAt": {"$gte": today_start}})
    today_paid_agg = list(orders_col.aggregate([
        {"$match": {"paymentStatus": "paid", "createdAt": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]))
    status_counts = list(orders_col.aggregate([
        {"$group": {"_id": "$fulfillmentStatus", "count": {"$sum": 1}}},
    ]))
    customer_count = users_col.count_documents({"role": "customer"})
    new_users_today = users_col.count_documents({"role": "customer", "createdAt": {"$gte": today_start}})
    low_stock = products_col.count_documents({"stock": {"$gt": 0, "$lte": LOW_STOCK_THRESHOLD}})
    out_of_stock = products_col.count_documents({"stock": {"$lte": 0}})
    recent_orders = list(orders_col.aggregate([
        {"$sort": {"createdAt": -1}},
        {"$limit": 6},
        {"$lookup": {"from": "users", "localField": "user", "foreignField": "_id", "as": "user"}},
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
    ]))
    best_sellers = list(orders_col.aggregate([
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name", "quantity": {"$sum": "$items.quantity"},
                    "revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}}}},
        {"$sort": {"quantity": -1}},
        {"$limit": 5},
    ]))
    since = datetime.now(timezone.utc) - timedelta(days=6)
    revenue_series_raw = list(orders_col.aggregate([
        {"$match": {"paymentStatus": "paid", "createdAt": {"$gte": since}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
    ]))
    pending_cod_value_agg = list(orders_col.aggregate([
        {"$match": {"paymentProvider": "cod", "paymentStatus": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]))

    status_map = {s["_id"]: s["count"] for s in status_counts}
    pending_statuses = ["pending", "confirmed", "packed", "ready_to_ship", "shipped", "out_for_delivery"]
    pending_orders = sum(status_map.get(s, 0) for s in pending_statuses)

    series_map = {r["_id"]: r for r in revenue_series_raw}
    revenue_series = []
    for i in range(6, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        key = d.strftime("%Y-%m-%d")
        entry = series_map.get(key, {})
        revenue_series.append({
            "date": key,
            "label": d.strftime("%a"),
            "revenue": entry.get("revenue", 0),
            "orders": entry.get("orders", 0),
        })

    return Response({
        "kpis": {
            "todaysRevenue": today_paid_agg[0]["total"] if today_paid_agg else 0,
            "todaysOrders": today_orders,
            "pendingOrders": pending_orders,
            "deliveredOrders": status_map.get("delivered", 0),
            "cancelledOrders": status_map.get("cancelled", 0),
            "refundedOrders": status_map.get("refunded", 0),
            "customers": customer_count,
            "newUsersToday": new_users_today,
            "lowStock": low_stock,
            "outOfStock": out_of_stock,
            "pendingCodValue": pending_cod_value_agg[0]["total"] if pending_cod_value_agg else 0,
        },
        "revenueSeries": revenue_series,
        "bestSellers": [{"name": b["_id"], "quantity": b["quantity"], "revenue": b["revenue"]} for b in best_sellers],
        "recentOrders": [
            {
                "id": str(o["_id"]), "orderNumber": o["orderNumber"],
                "customer": o["user"]["name"] if o.get("user") else "—",
                "total": o["total"], "paymentProvider": o["paymentProvider"],
                "fulfillmentStatus": o["fulfillmentStatus"],
                "createdAt": o["createdAt"].isoformat() if o.get("createdAt") else None,
            }
            for o in recent_orders
        ],
    })


def list_team(request):
    team = User.objects(role__in=ADMIN_PANEL_ROLES).order_by("-createdAt")
    return Response({
        "roles": ADMIN_PANEL_ROLES,
        "allPermissions": PERMISSIONS,
        "team": [
            {
                "id": str(u.id), "name": u.name, "email": u.email, "role": u.role,
                "permissions": u.permissions or [], "status": u.status,
                "createdAt": u.createdAt.isoformat() if u.createdAt else None,
            }
            for u in team
        ],
    })


def create_team_member(request):
    errors = services.validate_create_team_member(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    name, email, password, role = (
        request.data.get("name", "").strip(), request.data.get("email", "").strip().lower(),
        request.data.get("password"), request.data.get("role"),
    )
    if User.objects(email=email).first():
        return Response({"message": "An account with this email already exists."}, status=409)

    from apps.accounts.services import hash_password
    user = User(name=name, email=email, passwordHash=hash_password(password), role=role, emailVerified=True).save()
    write_audit(request, "team.create", email, {"role": role})

    return Response({
        "message": "Team member created.",
        "member": {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role, "status": user.status},
    }, status=201)


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("team")])
def team_collection(request):
    return list_team(request) if request.method == "GET" else create_team_member(request)


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("team")])
def update_team_member(request, user_id):
    try:
        ObjectId(user_id)
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [{"msg": "Invalid user id.", "param": "id"}]}, status=400)

    errors = services.validate_update_team_member(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    # NOT .only(...) — mongoengine validates the *whole* document on save(),
    # so a partially-loaded doc fails on required fields it never fetched.
    target = User.objects(id=user_id).first()
    if not target:
        return Response({"message": "User not found."}, status=404)

    new_role = request.data.get("role")
    if str(target.id) == str(request.user.sub) and new_role and new_role != "super_admin":
        return Response({"message": "You cannot change your own super-admin role."}, status=400)

    before = {"role": target.role, "status": target.status, "permissions": target.permissions}
    if new_role:
        target.role = new_role
    if request.data.get("status"):
        target.status = request.data["status"]
    if isinstance(request.data.get("permissions"), list):
        target.permissions = [p for p in request.data["permissions"] if p in PERMISSIONS]
    target.save()
    write_audit(request, "team.update", target.email, {
        "before": before,
        "after": {"role": target.role, "status": target.status, "permissions": target.permissions},
    })

    return Response({
        "message": "Team member updated.",
        "member": {
            "id": str(target.id), "name": target.name, "email": target.email,
            "role": target.role, "permissions": target.permissions, "status": target.status,
        },
    })


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("audit_logs")])
def list_audit_logs(request):
    logs = AuditLog.objects().order_by("-createdAt").limit(100)
    return Response({"logs": [
        {
            "id": str(log.id), "actor": str(log.actor) if log.actor else None,
            "actorEmail": log.actorEmail, "actorRole": log.actorRole, "action": log.action,
            "target": log.target, "details": to_jsonable(log.details), "ip": log.ip, "userAgent": log.userAgent,
            "createdAt": log.createdAt.isoformat() if log.createdAt else None,
        }
        for log in logs
    ]})
