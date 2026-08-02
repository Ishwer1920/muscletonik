import re
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from mongoengine.errors import NotUniqueError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.checkout.models import Coupon
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.serialization import to_jsonable

from .paging import paging


def _validate_coupon_body(data, partial=False):
    errors = []
    code = data.get("code")
    if not partial or code is not None:
        if not (3 <= len(str(code or "").strip()) <= 32):
            errors.append({"msg": "Code must be 3-32 characters.", "param": "code"})
    title = data.get("title")
    if not partial or title is not None:
        if not (2 <= len(str(title or "").strip()) <= 80):
            errors.append({"msg": "Title must be 2-80 characters.", "param": "title"})
    coupon_type = data.get("type")
    if not partial or coupon_type is not None:
        if coupon_type not in ("percent", "flat", "free_shipping"):
            errors.append({"msg": "Invalid coupon type.", "param": "type"})
    return errors


def _coupon_list_item(c):
    """Node's listCoupons remaps to this shape (id, subset of fields) — but
    get/create/update return the RAW Mongoose document (_id, every field,
    including createdBy/updatedBy) via a plain res.json({coupon}). Two
    different shapes for the same resource, faithfully preserved here."""
    return {
        "id": str(c.id), "code": c.code, "title": c.title, "type": c.type, "value": c.value,
        "minOrder": c.minOrder, "maxUses": c.maxUses, "usageCount": c.usageCount,
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
        qs = qs.filter(__raw__={"$or": [{f: rx} for f in ("code", "title", "notes")]})
    status = request.query_params.get("status")
    if status == "active":
        qs = qs.filter(active=True)
    elif status == "inactive":
        qs = qs.filter(active=False)

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
    return Response({"coupon": _coupon_raw(coupon)})


def create_coupon(request):
    errors = _validate_coupon_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    code = str(request.data.get("code") or "").upper().strip()
    active = request.data.get("active")
    active = not (active is False or active == "false")

    if Coupon.objects(code=code).first():
        return Response({"message": "That coupon code already exists."}, status=409)

    coupon = Coupon(
        code=code, title=request.data.get("title"), type=request.data.get("type"),
        value=float(request.data.get("value") or 0), minOrder=float(request.data.get("minOrder") or 0),
        maxUses=int(request.data.get("maxUses") or 0),
        expiresAt=datetime.fromisoformat(request.data["expiresAt"]) if request.data.get("expiresAt") else None,
        active=active, notes=request.data.get("notes") or "",
        createdBy=getattr(request.user, "email", "") or "",
    ).save()
    write_audit(request, "coupon.create", coupon.code, to_jsonable(coupon))
    return Response({"message": "Coupon created.", "coupon": _coupon_raw(coupon)}, status=201)


def update_coupon(request, coupon_id):
    invalid = _validate_coupon_id(coupon_id)
    if invalid:
        return invalid
    # Node applies the same couponValidators (non-optional code/title/type) to
    # both create AND update routes — full validation here too, not partial.
    errors = _validate_coupon_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    coupon = Coupon.objects(id=coupon_id).first()
    if not coupon:
        return Response({"message": "Coupon not found"}, status=404)

    before = to_jsonable(coupon)
    if request.data.get("code"):
        coupon.code = str(request.data["code"]).upper().strip()
    if request.data.get("title") is not None:
        coupon.title = request.data["title"]
    if request.data.get("type") is not None:
        coupon.type = request.data["type"]
    if request.data.get("value") is not None:
        coupon.value = float(request.data["value"])
    if request.data.get("minOrder") is not None:
        coupon.minOrder = float(request.data["minOrder"])
    if request.data.get("maxUses") is not None:
        coupon.maxUses = int(request.data["maxUses"])
    coupon.expiresAt = datetime.fromisoformat(request.data["expiresAt"]) if request.data.get("expiresAt") else None
    if request.data.get("active") is not None:
        coupon.active = request.data["active"] is True or request.data["active"] == "true"
    if request.data.get("notes") is not None:
        coupon.notes = request.data["notes"]
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
