import copy
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.cms.models import CmsContent, CmsSection, DraftVersion, SiteSetting
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.serialization import to_jsonable

from .content_defaults import DEFAULT_SECTIONS

# Direct port of server/src/controllers/admin-content.controller.js.


def _clone(obj):
    return copy.deepcopy(obj) if obj else {}


def _normalize_sections(value):
    sections = value if isinstance(value, list) else []
    by_id = {s["id"]: _clone(s) for s in DEFAULT_SECTIONS}
    order = list(by_id.keys())
    for section in sections:
        if not section or not section.get("id"):
            continue
        sid = section["id"]
        if sid in by_id:
            base = by_id[sid]
        else:
            fallback = next((s for s in DEFAULT_SECTIONS if s["type"] == section.get("type")), DEFAULT_SECTIONS[0])
            base = _clone(fallback)
            order.append(sid)
        by_id[sid] = {**base, **section, "data": {**(base.get("data") or {}), **(section.get("data") or {})}}
    return [by_id[sid] for sid in order]


_SECTION_FIELDS = ("id", "type", "title", "enabled", "data")


def _to_cms_section(s):
    # Mongoose silently drops non-schema fields on save (strict mode default);
    # mirror that instead of letting stray client keys raise a TypeError here.
    return CmsSection(**{k: s[k] for k in _SECTION_FIELDS if k in s})


def _homepage_to_dict(doc):
    # Node's saved = await CmsContent.findOneAndUpdate(...).lean() keeps _id —
    # match that raw shape exactly, don't strip it.
    return to_jsonable(doc)


def _load_homepage():
    doc = CmsContent.objects(slug="homepage").first()
    if doc:
        return _homepage_to_dict(doc)

    legacy = SiteSetting.objects(key="homepage").first()
    hero_default = next((s["data"] for s in DEFAULT_SECTIONS if s["type"] == "hero"), {})
    if legacy and legacy.value:
        v = legacy.value
        return {
            "slug": "homepage", "name": "Homepage CMS", "version": 1,
            "sections": v.get("sections") or _clone(DEFAULT_SECTIONS),
            "order": v.get("order") or [s["id"] for s in DEFAULT_SECTIONS],
            "announcement": v.get("announcement") or {
                "text": "Free shipping above Rs 999", "background": "#111111", "color": "#ffffff", "visible": True,
            },
            "hero": v.get("hero") or hero_default,
            "brandStrip": v.get("brandStrip") or [],
            "footer": v.get("footer") or {"note": "Premium supplements, direct to your routine."},
        }

    return {
        "slug": "homepage", "name": "Homepage CMS", "version": 1,
        "sections": _clone(DEFAULT_SECTIONS), "order": [s["id"] for s in DEFAULT_SECTIONS],
        "announcement": {"text": "Free shipping above Rs 999", "background": "#111111", "color": "#ffffff", "visible": True},
        "hero": hero_default, "brandStrip": [], "footer": {"note": "Premium supplements, direct to your routine."},
    }


def _sync_legacy_setting(homepage, request):
    email = getattr(request.user, "email", "") or ""
    SiteSetting.objects(key="homepage").modify(
        upsert=True, new=True,
        set__key="homepage", set__category="content",
        set__value={
            "sections": homepage["sections"], "order": homepage["order"],
            "announcement": homepage["announcement"], "hero": homepage["hero"],
            "brandStrip": homepage["brandStrip"], "footer": homepage["footer"],
        },
        set__updatedBy=email,
    )


def _validate_homepage_body(data):
    errors = []
    for field, expected in (("sections", list), ("order", list), ("brandStrip", list)):
        if data.get(field) is not None and not isinstance(data[field], expected):
            errors.append({"msg": f"{field.capitalize()} must be an array.", "param": field})
    for field in ("announcement", "hero", "footer"):
        if data.get(field) is not None and not isinstance(data[field], dict):
            errors.append({"msg": f"{field.capitalize()} must be an object.", "param": field})
    return errors


def get_homepage_builder(request):
    homepage = _load_homepage()
    versions = DraftVersion.objects(contentSlug="homepage").order_by("-createdAt").limit(12)
    return Response({"homepage": homepage, "versions": [to_jsonable(v) for v in versions]})


def save_homepage_builder(request):
    errors = _validate_homepage_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    current = _load_homepage()
    sections = _normalize_sections(request.data.get("sections") or current.get("sections") or DEFAULT_SECTIONS)
    order = request.data.get("order") if (isinstance(request.data.get("order"), list) and request.data["order"]) else [s["id"] for s in sections]
    publish = bool(request.data.get("publish"))
    email = getattr(request.user, "email", "") or ""

    homepage_update = {
        "slug": "homepage", "name": "Homepage CMS",
        "version": int(current.get("version") or 0) + 1,
        "sections": [_to_cms_section(s) for s in sections],
        "order": order,
        "announcement": {**(current.get("announcement") or {}), **(request.data.get("announcement") or {})},
        "hero": {**(current.get("hero") or {}), **(request.data.get("hero") or {})},
        "brandStrip": request.data.get("brandStrip") if isinstance(request.data.get("brandStrip"), list) else (current.get("brandStrip") or []),
        "footer": {**(current.get("footer") or {}), **(request.data.get("footer") or {})},
        "updatedBy": email,
        "publishedAt": datetime.now(timezone.utc) if publish else (
            datetime.fromisoformat(current["publishedAt"]) if current.get("publishedAt") else None
        ),
    }

    saved_doc = CmsContent.objects(slug="homepage").modify(
        upsert=True, new=True,
        **{f"set__{k}": v for k, v in homepage_update.items()},
    )
    saved = _homepage_to_dict(saved_doc)
    _sync_legacy_setting(saved, request)
    DraftVersion(
        contentSlug="homepage", kind="homepage", snapshot=saved, createdBy=email,
        note="Published homepage" if publish else "Saved homepage draft", published=publish,
    ).save()
    write_audit(request, "content.publish" if publish else "content.save", "homepage",
                {"version": saved["version"], "order": saved["order"]})
    return Response({"message": "Homepage published." if publish else "Homepage saved.", "homepage": saved})


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def list_homepage_versions(request):
    versions = DraftVersion.objects(contentSlug="homepage").order_by("-createdAt")
    return Response({"versions": [to_jsonable(v) for v in versions]})


@api_view(["POST"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def rollback_homepage_version(request, version_id):
    try:
        ObjectId(version_id)
    except InvalidId:
        return Response({"message": "Version not found"}, status=404)
    version = DraftVersion.objects(id=version_id).first()
    if not version:
        return Response({"message": "Version not found"}, status=404)

    snapshot = version.snapshot or {}
    email = getattr(request.user, "email", "") or ""
    sections = snapshot.get("sections") or DEFAULT_SECTIONS
    homepage_update = {
        "slug": "homepage", "name": "Homepage CMS",
        "version": int(snapshot.get("version") or 1) + 1,
        "sections": [_to_cms_section(s) for s in sections],
        "order": snapshot.get("order") or [s["id"] for s in sections] or [s["id"] for s in DEFAULT_SECTIONS],
        "announcement": snapshot.get("announcement") or {},
        "hero": snapshot.get("hero") or {},
        "brandStrip": snapshot.get("brandStrip") or [],
        "footer": snapshot.get("footer") or {},
        "updatedBy": email,
        "publishedAt": datetime.now(timezone.utc),
    }
    saved_doc = CmsContent.objects(slug="homepage").modify(
        upsert=True, new=True,
        **{f"set__{k}": v for k, v in homepage_update.items()},
    )
    saved = _homepage_to_dict(saved_doc)
    _sync_legacy_setting(saved, request)
    DraftVersion(
        contentSlug="homepage", kind="homepage", snapshot=saved, createdBy=email,
        note="Rollback from version history", published=True,
    ).save()
    write_audit(request, "content.rollback", "homepage", {"from": str(version.id), "to": saved["version"]})
    return Response({"message": "Homepage rolled back.", "homepage": saved})


def delete_homepage_draft(request):
    doc = CmsContent.objects(slug="homepage").first()
    if not doc:
        return Response({"message": "Homepage not found"}, status=404)
    doc.delete()
    SiteSetting.objects(key="homepage").modify(
        upsert=True, new=True,
        set__key="homepage", set__category="content",
        set__value={"sections": _clone(DEFAULT_SECTIONS), "order": [s["id"] for s in DEFAULT_SECTIONS]},
    )
    write_audit(request, "content.delete", "homepage", {})
    return Response({"message": "Homepage draft reset."})


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def homepage_detail(request):
    if request.method == "GET":
        return get_homepage_builder(request)
    if request.method == "PUT":
        return save_homepage_builder(request)
    return delete_homepage_draft(request)
