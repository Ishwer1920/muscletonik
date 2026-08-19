import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from mongoengine.errors import NotUniqueError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog.models import Product
from apps.checkout.models import COUPON_PURPOSES, COUPON_SCOPES, Coupon, CouponRedemption
from apps.checkout.pricing import scope_label
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.serialization import to_jsonable

from .paging import paging


def _parse_date(value):
    """Accept a plain "2026-08-30" as well as a full ISO timestamp - the admin
    form sends a bare <input type="date"> value."""
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _string_list(value):
    """Accept either a real list or a comma-separated string from the form."""
    raw = value if isinstance(value, (list, tuple)) else str(value or "").split(",")
    seen, out = set(), []
    for entry in raw:
        text = str(entry or "").strip()
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    return out


def _as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "yes", "on")


def _number_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _validate_coupon_body(data, partial=False):
    errors = []

    code = data.get("code")
    if not partial or code is not None:
        text = str(code or "").strip()
        if not (3 <= len(text) <= 32):
            errors.append({"msg": "Code must be 3-32 characters.", "param": "code"})
        elif not re.fullmatch(r"[A-Za-z0-9_-]+", text):
            errors.append({
                "msg": "Code can only use letters, numbers, hyphens and underscores.",
                "param": "code",
            })

    title = data.get("title")
    if not partial or title is not None:
        if not (2 <= len(str(title or "").strip()) <= 80):
            errors.append({"msg": "Title must be 2-80 characters.", "param": "title"})

    coupon_type = data.get("type")
    if not partial or coupon_type is not None:
        if coupon_type not in ("percent", "flat", "free_shipping"):
            errors.append({"msg": "Invalid coupon type.", "param": "type"})

    purpose = data.get("purpose")
    if purpose is not None and purpose not in COUPON_PURPOSES:
        errors.append({
            "msg": "Purpose must be one of: " + ", ".join(COUPON_PURPOSES) + ".",
            "param": "purpose",
        })

    scope = data.get("appliesTo")
    if scope is not None and scope not in COUPON_SCOPES:
        errors.append({
            "msg": "Applies-to must be one of: " + ", ".join(COUPON_SCOPES) + ".",
            "param": "appliesTo",
        })

    # A targeted coupon with an empty target list would silently discount
    # nothing, so refuse it here rather than let it look broken at checkout.
    if scope == "brands" and not _string_list(data.get("brands")):
        errors.append({"msg": "Pick at least one brand for a brand coupon.", "param": "brands"})
    if scope == "categories" and not _string_list(data.get("categories")):
        errors.append({"msg": "Pick at least one category for a category coupon.", "param": "categories"})
    if scope == "products" and not _string_list(data.get("productSkus")):
        errors.append({"msg": "Add at least one product for a product coupon.", "param": "productSkus"})

    value = _number_or_none(data.get("value") or 0)
    if coupon_type == "percent":
        if value is None or not (0 < value <= 100):
            errors.append({"msg": "A percentage coupon needs a value between 1 and 100.", "param": "value"})
    elif coupon_type == "flat":
        if value is None or value <= 0:
            errors.append({"msg": "A flat coupon needs a discount amount above zero.", "param": "value"})

    for field in ("minOrder", "maxDiscount", "maxUses", "perUserLimit"):
        raw = data.get(field)
        if raw in (None, ""):
            continue
        number = _number_or_none(raw)
        if number is None or number < 0:
            errors.append({"msg": "Enter a number of 0 or more.", "param": field})

    starts_at, expires_at = data.get("startsAt"), data.get("expiresAt")
    start_dt, end_dt = _parse_date(starts_at), _parse_date(expires_at)
    if starts_at and not start_dt:
        errors.append({"msg": "Start date is not a valid date.", "param": "startsAt"})
    if expires_at and not end_dt:
        errors.append({"msg": "Expiry date is not a valid date.", "param": "expiresAt"})
    if start_dt and end_dt and end_dt < start_dt:
        errors.append({"msg": "Expiry must fall after the start date.", "param": "expiresAt"})

    return errors


def _apply_coupon_fields(coupon, data, partial=False):
    """Copy the editable fields from the request onto the document. On create
    everything is written; on update only keys actually present are touched."""

    def present(key):
        return (not partial) or (key in data)

    if present("code") and data.get("code"):
        coupon.code = str(data["code"]).upper().strip()
    if present("title"):
        coupon.title = str(data.get("title") or "").strip()
    if present("type") and data.get("type"):
        coupon.type = data["type"]

    # What the coupon is for - descriptive, and what the coupon list filters on.
    if present("purpose"):
        coupon.purpose = data.get("purpose") or "general"
    if present("description"):
        coupon.description = str(data.get("description") or "").strip()
    if present("campaign"):
        coupon.campaign = str(data.get("campaign") or "").strip()
    if present("ownerEmail"):
        coupon.ownerEmail = str(data.get("ownerEmail") or "").strip()

    # What it applies to.
    if present("appliesTo"):
        coupon.appliesTo = data.get("appliesTo") or "all"
    if present("brands"):
        coupon.brands = _string_list(data.get("brands"))
    if present("categories"):
        coupon.categories = _string_list(data.get("categories"))
    if present("productSkus"):
        coupon.productSkus = _string_list(data.get("productSkus"))
    # A scope change must clear the lists it no longer uses, or a stale brand
    # list keeps narrowing a coupon that now claims to cover everything.
    if coupon.appliesTo != "brands":
        coupon.brands = []
    if coupon.appliesTo != "categories":
        coupon.categories = []
    if coupon.appliesTo != "products":
        coupon.productSkus = []

    for field in ("value", "minOrder", "maxDiscount"):
        if present(field):
            setattr(coupon, field, float(data.get(field) or 0))
    for field in ("maxUses", "perUserLimit"):
        if present(field):
            setattr(coupon, field, int(float(data.get(field) or 0)))
    if present("firstOrderOnly"):
        coupon.firstOrderOnly = _as_bool(data.get("firstOrderOnly"))

    if present("startsAt"):
        coupon.startsAt = _parse_date(data.get("startsAt"))
    if present("expiresAt"):
        coupon.expiresAt = _parse_date(data.get("expiresAt"))
    if present("active"):
        coupon.active = _as_bool(data.get("active"), default=True)
    if present("notes"):
        coupon.notes = str(data.get("notes") or "")
    return coupon


def _coupon_list_item(c):
    """Node's listCoupons remaps to this shape (id, subset of fields) - but
    get/create/update return the RAW Mongoose document (_id, every field,
    including createdBy/updatedBy) via a plain res.json({coupon}). Two
    different shapes for the same resource, faithfully preserved here."""
    return {
        "id": str(c.id), "code": c.code, "title": c.title, "type": c.type, "value": c.value,
        "purpose": c.purpose, "description": c.description, "campaign": c.campaign,
        "ownerEmail": c.ownerEmail,
        "appliesTo": c.appliesTo, "brands": list(c.brands or []),
        "categories": list(c.categories or []), "productSkus": list(c.productSkus or []),
        "scopeLabel": scope_label(c),
        "minOrder": c.minOrder, "maxDiscount": c.maxDiscount,
        "maxUses": c.maxUses, "perUserLimit": c.perUserLimit,
        "firstOrderOnly": c.firstOrderOnly, "usageCount": c.usageCount,
        "startsAt": c.startsAt.isoformat() if c.startsAt else None,
        "expiresAt": c.expiresAt.isoformat() if c.expiresAt else None, "active": c.active,
        "notes": c.notes, "createdAt": c.createdAt.isoformat() if c.createdAt else None,
    }


def _coupon_raw(c):
    return to_jsonable(c)


def list_coupons(request):
    page, limit, skip = paging(request, max_limit=100)
    search = str(request.query_params.get("search") or "").strip()

    qs = Coupon.objects()
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        qs = qs.filter(__raw__={"$or": [
            {f: rx} for f in ("code", "title", "notes", "description", "campaign", "ownerEmail")
        ]})
    status = request.query_params.get("status")
    if status == "active":
        qs = qs.filter(active=True)
    elif status == "inactive":
        qs = qs.filter(active=False)

    purpose = request.query_params.get("purpose")
    if purpose in COUPON_PURPOSES:
        qs = qs.filter(purpose=purpose)

    total = qs.count()
    coupons = list(qs.order_by("-createdAt").skip(skip).limit(limit))

    coupons_col = Coupon._get_collection()
    summary_agg = list(coupons_col.aggregate([
        {"$group": {"_id": None,
                    "active": {"$sum": {"$cond": ["$active", 1, 0]}},
                    "inactive": {"$sum": {"$cond": ["$active", 0, 1]}},
                    "usage": {"$sum": "$usageCount"}}}
    ]))
    summary = summary_agg[0] if summary_agg else {"active": 0, "inactive": 0, "usage": 0}
    summary = {k: v for k, v in summary.items() if k != "_id"}

    return Response({
        "page": page, "limit": limit, "total": total, "totalPages": max(1, -(-total // limit)),
        "summary": summary, "coupons": [_coupon_list_item(c) for c in coupons],
        "purposes": COUPON_PURPOSES, "scopes": COUPON_SCOPES,
    })


def _validate_coupon_id(coupon_id):
    try:
        ObjectId(coupon_id)
        return None
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Invalid coupon id.", "param": "id"}
        ]}, status=400)


def get_coupon(request, coupon_id):
    invalid = _validate_coupon_id(coupon_id)
    if invalid:
        return invalid
    coupon = Coupon.objects(id=coupon_id).first()
    if not coupon:
        return Response({"message": "Coupon not found"}, status=404)
    return Response({
        "coupon": _coupon_raw(coupon),
        "redemptions": CouponRedemption.objects(coupon=coupon.id).count(),
    })


def create_coupon(request):
    errors = _validate_coupon_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    code = str(request.data.get("code") or "").upper().strip()
    if Coupon.objects(code=code).first():
        return Response({"message": "That coupon code already exists."}, status=409)

    coupon = _apply_coupon_fields(Coupon(), request.data)
    coupon.createdBy = getattr(request.user, "email", "") or ""
    try:
        coupon.save()
    except NotUniqueError:
        return Response({"message": "That coupon code already exists."}, status=409)

    write_audit(request, "coupon.create", coupon.code, to_jsonable(coupon))
    return Response({"message": "Coupon created.", "coupon": _coupon_raw(coupon)}, status=201)


def update_coupon(request, coupon_id):
    invalid = _validate_coupon_id(coupon_id)
    if invalid:
        return invalid

    coupon = Coupon.objects(id=coupon_id).first()
    if not coupon:
        return Response({"message": "Coupon not found"}, status=404)

    # PATCH is genuinely partial: the coupon table flips `active` with a
    # one-key body, so only the keys actually sent get written. Validation
    # still runs against the merged result, so a partial edit can never leave
    # the coupon in a state the create form would have rejected.
    payload = dict(request.data)
    for key in ("code", "title", "type", "appliesTo"):
        payload.setdefault(key, getattr(coupon, key))
    payload.setdefault("value", coupon.value)
    for key in ("brands", "categories", "productSkus"):
        payload.setdefault(key, list(getattr(coupon, key) or []))

    errors = _validate_coupon_body(payload)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    before = to_jsonable(coupon)
    _apply_coupon_fields(coupon, request.data, partial=True)
    coupon.updatedBy = getattr(request.user, "email", "") or ""

    try:
        coupon.save()
    except NotUniqueError:
        return Response({"message": "That coupon code already exists."}, status=409)

    write_audit(request, "coupon.update", coupon.code, {"before": before, "after": to_jsonable(coupon)})
    return Response({"message": "Coupon updated.", "coupon": _coupon_raw(coupon)})


def delete_coupon(request, coupon_id):
    invalid = _validate_coupon_id(coupon_id)
    if invalid:
        return invalid
    coupon = Coupon.objects(id=coupon_id).first()
    if not coupon:
        return Response({"message": "Coupon not found"}, status=404)
    write_audit(request, "coupon.delete", coupon.code, to_jsonable(coupon))
    coupon.delete()
    return Response({"message": "Coupon deleted."})


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("coupons")])
def coupons_collection(request):
    return list_coupons(request) if request.method == "GET" else create_coupon(request)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("coupons")])
def coupon_detail(request, coupon_id):
    if request.method == "GET":
        return get_coupon(request, coupon_id)
    if request.method == "PATCH":
        return update_coupon(request, coupon_id)
    return delete_coupon(request, coupon_id)


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("coupons")])
def coupon_targets(request):
    """Brands, categories and products the coupon form offers as targets, so an
    admin picks from the real catalog instead of typing a name that will never
    match anything at checkout."""
    brands = sorted({b for b in Product.objects(status="active").distinct("brand") if b})
    categories = sorted({c for c in Product.objects(status="active").distinct("category") if c})

    search = str(request.query_params.get("search") or "").strip()
    products = []
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        rows = Product.objects(status="active").filter(
            __raw__={"$or": [{"name": rx}, {"sku": rx}]}
        ).only("name", "sku", "brand", "sellingPrice").limit(25)
        products = [
            {"sku": p.sku, "name": p.name, "brand": p.brand, "price": p.sellingPrice}
            for p in rows
        ]

    return Response({
        "brands": brands,
        "categories": categories,
        "products": products,
        "purposes": COUPON_PURPOSES,
        "scopes": COUPON_SCOPES,
    })
