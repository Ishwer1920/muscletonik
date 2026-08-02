import csv
import io
from datetime import datetime, timedelta, timezone

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.catalog.models import Product
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.orders.models import Order


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("analytics")])
def get_analytics(request):
    since = (datetime.now(timezone.utc) - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
    orders_col = Order._get_collection()
    products_col = Product._get_collection()

    totals = orders_col.count_documents({})
    paid_agg = list(orders_col.aggregate([
        {"$match": {"paymentStatus": "paid"}},
        {"$group": {"_id": None, "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
    ]))
    series = list(orders_col.aggregate([
        {"$match": {"paymentStatus": "paid", "createdAt": {"$gte": since}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
    ]))
    by_status = list(orders_col.aggregate([{"$group": {"_id": "$fulfillmentStatus", "count": {"$sum": 1}}}]))
    by_provider = list(orders_col.aggregate([
        {"$group": {"_id": "$paymentProvider", "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}}
    ]))
    top_products = list(orders_col.aggregate([
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name", "quantity": {"$sum": "$items.quantity"},
                    "revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}}}},
        {"$sort": {"revenue": -1}}, {"$limit": 8},
    ]))
    inv_value = list(products_col.aggregate([
        {"$group": {"_id": None, "value": {"$sum": {"$multiply": ["$stock", "$sellingPrice"]}}}}
    ]))

    customers = User.objects(role="customer").count()
    paid_revenue = paid_agg[0]["revenue"] if paid_agg else 0
    paid_orders = paid_agg[0]["orders"] if paid_agg else 0

    series_map = {s["_id"]: s for s in series}
    revenue_series = []
    for i in range(29, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        key = d.strftime("%Y-%m-%d")
        entry = series_map.get(key, {})
        revenue_series.append({"date": key, "revenue": entry.get("revenue", 0), "orders": entry.get("orders", 0)})

    return Response({
        "totals": {
            "totalOrders": totals, "paidRevenue": paid_revenue, "paidOrders": paid_orders,
            "avgOrderValue": round(paid_revenue / paid_orders) if paid_orders else 0,
            "customers": customers, "inventoryValue": inv_value[0]["value"] if inv_value else 0,
        },
        "revenueSeries": revenue_series,
        "byStatus": [{"status": s["_id"], "count": s["count"]} for s in by_status],
        "byProvider": [{"provider": p["_id"] or "unknown", "count": p["count"], "revenue": p["revenue"]} for p in by_provider],
        "topProducts": [{"name": t["_id"], "quantity": t["quantity"], "revenue": t["revenue"]} for t in top_products],
    })


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("analytics")])
def export_orders_csv(request):
    orders_col = Order._get_collection()
    orders = list(orders_col.aggregate([
        {"$sort": {"createdAt": -1}},
        {"$limit": 5000},
        {"$lookup": {"from": "users", "localField": "user", "foreignField": "_id", "as": "user"}},
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
    ]))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Order", "Date", "Customer", "Total", "Payment", "PaymentStatus", "Fulfillment"])
    for o in orders:
        writer.writerow([
            o["orderNumber"],
            o["createdAt"].isoformat() if o.get("createdAt") else "",
            o.get("user", {}).get("email", "") if o.get("user") else "",
            o["total"], o["paymentProvider"], o["paymentStatus"], o["fulfillmentStatus"],
        ])

    filename = f"orders-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    response = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
