import re

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog.models import Product
from apps.core.permissions import RequireAdminPanel, RequirePermission

from .paging import build_sort, paging

LOW_STOCK = 5


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("inventory")])
def list_inventory(request):
    page, limit, skip = paging(request)
    search = str(request.query_params.get("search") or "").strip()

    qs = Product.objects()
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        qs = qs.filter(__raw__={"$or": [{f: rx} for f in ("name", "sku", "brand", "category")]})

    state = request.query_params.get("state")
    if request.query_params.get("lowOnly") == "true":
        qs = qs.filter(stock__lte=LOW_STOCK)
    if state == "out":
        qs = qs.filter(stock__lte=0)
    elif state == "low":
        qs = qs.filter(stock__gt=0, stock__lte=LOW_STOCK)
    elif state == "in":
        qs = qs.filter(stock__gt=LOW_STOCK)

    sort = build_sort(request, ["name", "sku", "brand", "category", "stock", "sellingPrice"], "stock")

    total = qs.count()
    items = list(qs.only("name", "sku", "brand", "category", "stock", "sellingPrice", "status")
                 .order_by(sort).skip(skip).limit(limit))

    products_col = Product._get_collection()
    value_agg = list(products_col.aggregate([
        {"$group": {"_id": None, "value": {"$sum": {"$multiply": ["$stock", "$sellingPrice"]}}, "units": {"$sum": "$stock"}}}
    ]))

    def state_of(stock):
        if stock <= 0:
            return "out"
        if stock <= LOW_STOCK:
            return "low"
        return "ok"

    return Response({
        "page": page, "limit": limit, "total": total, "totalPages": max(1, -(-total // limit)),
        "lowStockThreshold": LOW_STOCK,
        "inventoryValue": value_agg[0]["value"] if value_agg else 0,
        "totalUnits": value_agg[0]["units"] if value_agg else 0,
        "items": [
            {
                "id": str(p.id), "name": p.name, "sku": p.sku, "brand": p.brand, "category": p.category,
                "stock": p.stock, "price": p.sellingPrice, "status": p.status, "state": state_of(p.stock),
            }
            for p in items
        ],
    })


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("inventory")])
def adjust_stock(request, product_id):
    # NOT .only(...) — mongoengine validates the *whole* document on save(),
    # so a partially-loaded doc fails on required fields it never fetched.
    product = Product.objects(id=product_id).first()
    if not product:
        return Response({"message": "Product not found"}, status=404)

    before = product.stock
    if request.data.get("stock") is not None:
        product.stock = int(request.data["stock"])
    elif request.data.get("delta") is not None:
        product.stock = max(0, product.stock + int(request.data["delta"]))
    else:
        return Response({"message": "Provide a new stock value or a delta."}, status=400)

    product.save()
    write_audit(request, "inventory.adjust", product.sku, {"before": before, "after": product.stock})
    return Response({"message": "Stock updated.", "id": str(product.id), "stock": product.stock})
