"""Admin CRUD for website alerts / announcements.

These power the storefront notification bell. Every alert is created by an
admin here — nothing is generated automatically — so the bell can never show a
fabricated notification. Mirrors views_banners so the publish/schedule/toggle
behaviour is identical to the rest of the panel.
"""

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.cms.models import Alert
from apps.core.permissions import RequireAdminPanel, RequirePermission

SAFE_SCHEMES = ("http://", "https://", "/")
ALERT_TYPES = ("new_product", "new_brand", "new_deal", "new_banner", "sale", "update", "general")


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
    """Relative paths and http(s) only, so an alert can never carry a
    javascript: URL into the page (same rule the banner CTAs use)."""
    url = str(value or "").strip()
    if not url:
        return ""
    if url.startswith(SAFE_SCHEMES) or not url.split(":")[0].isalpha():
        return url
    return ""


def _iso_utc(value):
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def alert_view(a):
    return {
        "id": str(a.id),
        "title": a.title,
        "description": a.description,
        "type": a.type or "general",
        "link": a.link,
        "icon": a.icon,
        "image": a.image,
        "status": a.status or "draft",
        "important": bool(a.important),
        "duration": a.duration or 5,
        "displayOrder": a.displayOrder,
        "startDate": _iso_utc(a.startDate),
        "endDate": _iso_utc(a.endDate),
        "isLive": a.is_live(),
        "createdAt": _iso_utc(a.createdAt),
        "updatedAt": _iso_utc(a.updatedAt),
    }


def _get(alert_id):
    try:
        return Alert.objects(id=ObjectId(alert_id)).first()
    except (InvalidId, TypeError):
        return None


def _validate(data, partial=False):
    errors = []
    if not partial or "title" in data:
        title = str(data.get("title") or "").strip()
        if not title:
            errors.append({"msg": "A title is required.", "param": "title"})
        elif len(title) > 160:
            errors.append({"msg": "Title must be 160 characters or fewer.", "param": "title"})
    if "link" in data and data.get("link") and not _clean_url(data.get("link")):
        errors.append({"msg": "Link must be a relative path or http(s) URL.", "param": "link"})
    if "image" in data and data.get("image") and not _clean_url(data.get("image")):
        errors.append({"msg": "Image must be a relative path or http(s) URL.", "param": "image"})
    if "type" in data and str(data.get("type")) not in ALERT_TYPES:
        errors.append({"msg": "Unknown alert type.", "param": "type"})
    start = _parse_date(data.get("startDate")) if "startDate" in data else None
    end = _parse_date(data.get("endDate")) if "endDate" in data else None
    if start and end and end < start:
        errors.append({"msg": "End date must be after the start date.", "param": "endDate"})
    return errors


def _apply(doc, data):
    if "title" in data:
        doc.title = str(data.get("title") or "").strip()
    if "description" in data:
        doc.description = str(data.get("description") or "").strip()
    if "icon" in data:
        doc.icon = str(data.get("icon") or "").strip()[:40]
    if "type" in data and str(data.get("type")) in ALERT_TYPES:
        doc.type = str(data.get("type"))
    if "link" in data:
        doc.link = _clean_url(data.get("link"))
    if "image" in data:
        doc.image = _clean_url(data.get("image"))
    if "status" in data:
        value = str(data.get("status") or "draft").strip().lower()
        doc.status = value if value in ("draft", "published") else "draft"
    if "important" in data:
        doc.important = data["important"] is True or str(data["important"]).lower() in ("true", "1", "on")
    if "duration" in data:
        try:
            doc.duration = max(1, min(60, int(float(data.get("duration") or 5))))
        except (TypeError, ValueError):
            doc.duration = 5
    if "displayOrder" in data:
        try:
            doc.displayOrder = int(data.get("displayOrder") or 0)
        except (TypeError, ValueError):
            doc.displayOrder = 0
    for field in ("startDate", "endDate"):
        if field in data:
            setattr(doc, field, _parse_date(data.get(field)))
    return doc


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def alerts_collection(request):
    if request.method == "GET":
        items = Alert.objects().order_by("-createdAt")
        return Response({"alerts": [alert_view(a) for a in items]})

    errors = _validate(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    doc = _apply(Alert(createdBy=getattr(request.user, "email", "") or ""), request.data)
    doc.save()
    write_audit(request, "alert.create", str(doc.id), alert_view(doc))
    return Response({"message": "Alert created.", "alert": alert_view(doc)}, status=201)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def alert_detail(request, alert_id):
    doc = _get(alert_id)
    if not doc:
        return Response({"message": "Alert not found"}, status=404)

    if request.method == "GET":
        return Response({"alert": alert_view(doc)})

    if request.method == "DELETE":
        write_audit(request, "alert.delete", str(doc.id), alert_view(doc))
        doc.delete()
        return Response({"message": "Alert deleted."})

    errors = _validate(request.data, partial=(request.method == "PATCH"))
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    before = alert_view(doc)
    _apply(doc, request.data)
    doc.save()
    write_audit(request, "alert.update", str(doc.id), {"before": before, "after": alert_view(doc)})
    return Response({"message": "Alert saved.", "alert": alert_view(doc)})


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def toggle_alert(request, alert_id):
    doc = _get(alert_id)
    if not doc:
        return Response({"message": "Alert not found"}, status=404)
    doc.status = "draft" if doc.status == "published" else "published"
    doc.save()
    write_audit(request, "alert.toggle", str(doc.id), {"status": doc.status})
    return Response({"message": "Alert " + ("published." if doc.status == "published" else "unpublished."),
                     "alert": alert_view(doc)})
