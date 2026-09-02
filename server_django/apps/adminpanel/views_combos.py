"""Combo offers - Admin -> Crazy Deals.

A combo is a flat price for a set of products, shown under Crazy Deals. The
pricing rule lives in checkout/pricing.apply_combo_pricing; this module is only
CRUD plus enough validation that a combo can never be saved in a state the
storefront cannot price (unknown product, no items, a price that is not a
saving).
"""

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog.models import Combo, ComboItem, Product
from apps.core.permissions import RequireAdminPanel, RequirePermission

# A combo can hold anything from a pair up to a hundred products.
MIN_ITEMS = 2
MAX_ITEMS = 100


def combo_view(combo, products_by_id=None):
    """Admin shape: the stored items plus each product's live name and price,
    so the editor can show what the bundle is worth without a second call."""
    if products_by_id is None:
        products_by_id = _products_for(combo)

    items = []
    normal_total = 0
    for item in combo.items or []:
        product = products_by_id.get(int(item.catalogId))
        price = float(getattr(product, "sellingPrice", 0) or 0) if product else 0
        quantity = int(item.quantity or 1)
        normal_total += price * quantity
        items.append({
            "catalogId": int(item.catalogId),
            "quantity": quantity,
            "name": getattr(product, "name", "") if product else "(product not found)",
            "price": price,
            "image": (list(getattr(product, "images", []) or []) or [""])[0] if product else "",
            "missing": product is None,
        })

    combo_price = float(combo.comboPrice or 0)
    return {
        "id": str(combo.id),
        "name": combo.name,
        "description": combo.description,
        "image": combo.image,
        "items": items,
        "comboPrice": combo_price,
        "normalTotal": round(normal_total),
        "saving": max(0, round(normal_total - combo_price)),
        "isActive": bool(combo.isActive),
        "displayOrder": int(combo.displayOrder or 0),
    }


def _products_for(*combos):
    ids = set()
    for combo in combos:
        for item in combo.items or []:
            ids.add(int(item.catalogId))
    if not ids:
        return {}
    found = Product.objects(catalogId__in=list(ids))
    return {int(p.catalogId): p for p in found}


def _parse_items(raw):
    """[{catalogId, quantity}] -> [ComboItem], collapsing duplicates."""
    if not isinstance(raw, list):
        return None, "Pick at least two products for the combo."

    merged = {}
    order = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            catalog_id = int(entry.get("catalogId"))
            quantity = int(entry.get("quantity") or 1)
        except (TypeError, ValueError):
            return None, "Each combo item needs a product and a quantity."
        if catalog_id <= 0 or quantity <= 0:
            return None, "Each combo item needs a product and a quantity."
        if catalog_id not in merged:
            order.append(catalog_id)
        merged[catalog_id] = merged.get(catalog_id, 0) + quantity

    if len(merged) < MIN_ITEMS:
        return None, "A combo needs at least %d different products." % MIN_ITEMS
    if len(merged) > MAX_ITEMS:
        return None, "A combo can hold at most %d products." % MAX_ITEMS

    known = {int(p.catalogId) for p in Product.objects(catalogId__in=order).only("catalogId")}
    unknown = [str(c) for c in order if c not in known]
    if unknown:
        return None, "Unknown product id(s): " + ", ".join(unknown)

    return [ComboItem(catalogId=c, quantity=merged[c]) for c in order], None


def _apply(combo, data):
    """Returns an error message, or None when the combo is valid and updated."""
    if "name" in data:
        name = str(data.get("name") or "").strip()
        if not (2 <= len(name) <= 120):
            return "Combo name is required (2-120 characters)."
        combo.name = name
    if not combo.name:
        return "Combo name is required (2-120 characters)."

    for field in ("description", "image"):
        if field in data:
            setattr(combo, field, str(data.get(field) or "").strip())

    if "items" in data:
        items, error = _parse_items(data.get("items"))
        if error:
            return error
        combo.items = items
    if not combo.items:
        return "A combo needs at least two different products."

    if "comboPrice" in data:
        try:
            price = float(data.get("comboPrice"))
        except (TypeError, ValueError):
            return "Combo price must be a number."
        if price <= 0:
            return "Combo price must be more than 0."
        combo.comboPrice = price

    if "isActive" in data:
        combo.isActive = data["isActive"] is True or str(data["isActive"]).lower() in ("true", "1")
    if "displayOrder" in data:
        try:
            combo.displayOrder = int(data.get("displayOrder") or 0)
        except (TypeError, ValueError):
            combo.displayOrder = 0

    # A bundle that costs the same as buying the items separately would show a
    # "saving" of zero on the storefront and never actually price differently,
    # so it is rejected here rather than silently ignored at checkout.
    products = _products_for(combo)
    normal_total = 0
    for item in combo.items:
        product = products.get(int(item.catalogId))
        normal_total += float(getattr(product, "sellingPrice", 0) or 0) * int(item.quantity or 1)
    if combo.comboPrice >= normal_total:
        return ("Combo price must be below the normal total of Rs %d." % round(normal_total))

    return None


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def combos_collection(request):
    if request.method == "GET":
        combos = list(Combo.objects().order_by("displayOrder", "-createdAt"))
        products = _products_for(*combos) if combos else {}
        return Response({"combos": [combo_view(c, products) for c in combos]})

    combo = Combo()
    error = _apply(combo, request.data)
    if error:
        return Response({"message": "Validation failed", "errors": [{"msg": error}]}, status=400)
    combo.save()
    write_audit(request, "combo.create", combo.name, {"price": combo.comboPrice})
    return Response({"message": "Combo created.", "combo": combo_view(combo)}, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def combo_detail(request, combo_id):
    try:
        ObjectId(combo_id)
    except InvalidId:
        return Response({"message": "Combo not found"}, status=404)
    combo = Combo.objects(id=combo_id).first()
    if not combo:
        return Response({"message": "Combo not found"}, status=404)

    if request.method == "DELETE":
        write_audit(request, "combo.delete", combo.name, {})
        combo.delete()
        return Response({"message": "Combo deleted.", "id": combo_id})

    error = _apply(combo, request.data)
    if error:
        return Response({"message": "Validation failed", "errors": [{"msg": error}]}, status=400)
    combo.save()
    write_audit(request, "combo.update", combo.name, {"price": combo.comboPrice})
    return Response({"message": "Combo updated.", "combo": combo_view(combo)})
