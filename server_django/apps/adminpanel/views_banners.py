"""Admin CRUD for the homepage slideshow banners.

Image files are uploaded through the existing POST /admin/uploads/banners
endpoint; this module only stores the resulting URL, matching how product
images are handled.
"""

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.cms import actions
from apps.cms.models import Banner
from apps.core.permissions import RequireAdminPanel, RequirePermission

# Same rule the storefront applies to CMS links: relative paths and http(s)
# only, so a banner can never carry a javascript: URL into the page.
SAFE_SCHEMES = ("http://", "https://", "/")


def _parse_date(value):
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _clean_url(value):
    url = str(value or "").strip()
    if not url:
        return ""
    if url.startswith(SAFE_SCHEMES) or not url.split(":")[0].isalpha():
        return url
    return ""


TEXT_FIELDS = ("title", "subtitle", "alt", "ctaText", "name", "heading",
               "subheading", "paragraph", "offerText", "note", "button2Text",
               "timerLabel", "backgroundColor")
URL_FIELDS = ("image", "imageMobile", "ctaUrl", "mainImage", "productImage", "logo")
DATE_FIELDS = ("startDate", "endDate", "timerStart", "timerEnd")


def _iso_utc(value):
    """See catalog.services._iso_utc — naive Mongo datetimes need the offset
    spelled out or the browser reads them as local time."""
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def banner_view(b):
    return {
        "id": str(b.id),
        "layout": b.layout or "slide",
        "name": b.name,
        "heading": b.heading,
        "subheading": b.subheading,
        "paragraph": b.paragraph,
        "offerText": b.offerText,
        "note": b.note,
        "backgroundColor": b.backgroundColor,
        "overlay": b.overlay,
        "mainImage": b.mainImage,
        "productImage": b.productImage,
        "logo": b.logo,
        "logoSize": b.logoSize,
        "productId": b.productId,
        "buttonActionType": b.buttonActionType,
        "buttonTarget": b.buttonTarget,
        "button2Text": b.button2Text,
        "button2ActionType": b.button2ActionType,
        "button2Target": b.button2Target,
        "timerEnabled": bool(b.timerEnabled),
        "timerStart": _iso_utc(b.timerStart),
        "timerEnd": _iso_utc(b.timerEnd),
        "timerLabel": b.timerLabel,
        "expiredBehavior": b.expiredBehavior,
        "title": b.title,
        "subtitle": b.subtitle,
        "image": b.image,
        "imageMobile": b.imageMobile,
        "alt": b.alt,
        "ctaText": b.ctaText,
        "ctaUrl": b.ctaUrl,
        "displayOrder": b.displayOrder,
        "isActive": b.isActive,
        "startDate": _iso_utc(b.startDate),
        "endDate": _iso_utc(b.endDate),
        # Resolved so the admin can see immediately whether a CTA actually
        # points anywhere — an unresolvable target comes back empty.
        "buttonHref": actions.resolve(b.buttonActionType, b.buttonTarget) or b.ctaUrl or "",
        "button2Href": actions.resolve(b.button2ActionType, b.button2Target),
        "isLive": b.is_live(),
        "createdAt": _iso_utc(b.createdAt),
    }


def _get(banner_id):
    try:
        return Banner.objects(id=ObjectId(banner_id)).first()
    except (InvalidId, TypeError):
        return None


def _validate(data, partial=False):
    errors = []
    layout = str(data.get("layout") or "slide")
    # Only the artwork-only layout needs an image; composed layouts can run on
    # a colour background with text alone.
    if layout == "slide" and (not partial or "image" in data):
        if not _clean_url(data.get("image")):
            errors.append({"msg": "A banner image URL is required.", "param": "image"})
    for key in ("mainImage", "productImage", "logo", "imageMobile"):
        if data.get(key) and not _clean_url(data.get(key)):
            errors.append({"msg": "Image must be a relative path or http(s) URL.", "param": key})
    if (data.get("buttonActionType") == "url" and data.get("buttonTarget")
            and not _clean_url(data.get("buttonTarget"))):
        errors.append({"msg": "Custom URL must start with http(s):// or /.", "param": "buttonTarget"})
    if "title" in data and len(str(data.get("title") or "")) > 160:
        errors.append({"msg": "Title must be 160 characters or fewer.", "param": "title"})
    if "ctaUrl" in data and data.get("ctaUrl") and not _clean_url(data.get("ctaUrl")):
        errors.append({"msg": "CTA link must be a relative path or http(s) URL.", "param": "ctaUrl"})

    start = _parse_date(data.get("startDate")) if "startDate" in data else None
    end = _parse_date(data.get("endDate")) if "endDate" in data else None
    if start and end and end < start:
        errors.append({"msg": "End date must be after the start date.", "param": "endDate"})

    t_start = _parse_date(data.get("timerStart")) if "timerStart" in data else None
    t_end = _parse_date(data.get("timerEnd")) if "timerEnd" in data else None
    if t_start and t_end and t_end < t_start:
        errors.append({"msg": "Timer must end after it starts.", "param": "timerEnd"})
    if str(data.get("timerEnabled")).lower() in ("true", "1") and "timerEnd" in data and not t_end:
        errors.append({"msg": "A countdown needs an end date and time.", "param": "timerEnd"})
    return errors


def _apply(doc, data):
    for field in TEXT_FIELDS:
        if field in data:
            setattr(doc, field, str(data.get(field) or "").strip())
    for field in URL_FIELDS:
        if field in data:
            setattr(doc, field, _clean_url(data.get(field)))

    if "layout" in data and data["layout"] in ("slide", "promo", "festive"):
        doc.layout = data["layout"]

    for field, lo, hi, default in (("overlay", 0, 100, 0), ("logoSize", 24, 480, 120)):
        if field in data:
            try:
                setattr(doc, field, max(lo, min(hi, int(float(data.get(field) or default)))))
            except (TypeError, ValueError):
                setattr(doc, field, default)

    if "productId" in data:
        raw = data.get("productId")
        try:
            doc.productId = int(raw) if str(raw or "").strip() else None
        except (TypeError, ValueError):
            doc.productId = None

    for prefix in ("button", "button2"):
        key = prefix + "ActionType"
        if key in data:
            value = str(data.get(key) or "none").strip().lower()
            if value in ("none", "product", "category", "brand", "collection",
                         "marketplace", "page", "url"):
                setattr(doc, key, value)
        tkey = prefix + "Target"
        if tkey in data:
            setattr(doc, tkey, str(data.get(tkey) or "").strip())

    if "timerEnabled" in data:
        doc.timerEnabled = data["timerEnabled"] is True or str(data["timerEnabled"]).lower() in ("true", "1")
    if "expiredBehavior" in data and data["expiredBehavior"] in ("hide", "expired", "keep"):
        doc.expiredBehavior = data["expiredBehavior"]
    if "displayOrder" in data:
        try:
            doc.displayOrder = int(data.get("displayOrder") or 0)
        except (TypeError, ValueError):
            doc.displayOrder = 0
    if "isActive" in data:
        doc.isActive = data["isActive"] is True or str(data["isActive"]).lower() in ("true", "1")
    for field in DATE_FIELDS:
        if field in data:
            setattr(doc, field, _parse_date(data.get(field)))
    return doc


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def banners_collection(request):
    if request.method == "GET":
        items = Banner.objects().order_by("displayOrder", "createdAt")
        return Response({"banners": [banner_view(b) for b in items]})

    errors = _validate(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    # New banners land at the end of the running order unless told otherwise.
    if "displayOrder" not in request.data:
        last = Banner.objects().order_by("-displayOrder").first()
        request.data["displayOrder"] = (last.displayOrder + 1) if last else 0

    doc = _apply(Banner(createdBy=getattr(request.user, "email", "") or ""), request.data)
    doc.save()
    write_audit(request, "banner.create", str(doc.id), banner_view(doc))
    return Response({"message": "Banner created.", "banner": banner_view(doc)}, status=201)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def banner_detail(request, banner_id):
    doc = _get(banner_id)
    if not doc:
        return Response({"message": "Banner not found"}, status=404)

    if request.method == "GET":
        return Response({"banner": banner_view(doc)})

    if request.method == "DELETE":
        write_audit(request, "banner.delete", str(doc.id), banner_view(doc))
        doc.delete()
        return Response({"message": "Banner deleted."})

    errors = _validate(request.data, partial=(request.method == "PATCH"))
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    before = banner_view(doc)
    _apply(doc, request.data)
    doc.save()
    write_audit(request, "banner.update", str(doc.id), {"before": before, "after": banner_view(doc)})
    return Response({"message": "Banner saved.", "banner": banner_view(doc)})


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def toggle_banner(request, banner_id):
    doc = _get(banner_id)
    if not doc:
        return Response({"message": "Banner not found"}, status=404)
    doc.isActive = not doc.isActive
    doc.save()
    write_audit(request, "banner.toggle", str(doc.id), {"isActive": doc.isActive})
    return Response({"message": "Banner " + ("enabled." if doc.isActive else "disabled."),
                     "banner": banner_view(doc)})


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def banner_options(request):
    """Categories, brands, collections and pages the CTA picker can target."""
    return Response(actions.options())


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def reorder_banners(request):
    """Accepts {"order": [id, id, ...]} and rewrites displayOrder to match."""
    ids = request.data.get("order")
    if not isinstance(ids, list) or not ids:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "order must be a non-empty list of banner ids.", "param": "order"}
        ]}, status=400)

    updated = 0
    for position, banner_id in enumerate(ids):
        doc = _get(banner_id)
        if doc:
            doc.displayOrder = position
            doc.save()
            updated += 1
    write_audit(request, "banner.reorder", "banners", {"count": updated})
    items = Banner.objects().order_by("displayOrder", "createdAt")
    return Response({"message": "Order saved.", "banners": [banner_view(b) for b in items]})
