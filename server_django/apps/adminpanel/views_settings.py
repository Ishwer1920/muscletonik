from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.cms.models import SiteSetting
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.serialization import to_jsonable


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def list_settings(request):
    settings = SiteSetting.objects().order_by("category", "key")
    return Response({"settings": [to_jsonable(s) for s in settings]})


def get_setting(request, key):
    setting = SiteSetting.objects(key=key).first()
    if not setting:
        return Response({"message": "Setting not found"}, status=404)
    return Response({"setting": to_jsonable(setting)})


def upsert_setting(request, key):
    body_key = str(request.data.get("key") or key or "").strip()
    if not (2 <= len(body_key) <= 120):
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Key is required.", "param": "key"}
        ]}, status=400)
    if "value" not in request.data:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Value is required.", "param": "value"}
        ]}, status=400)

    category = str(request.data.get("category") or "general").strip()
    value = request.data.get("value")
    before = SiteSetting.objects(key=body_key).first()
    before_dict = to_jsonable(before) if before else None

    email = getattr(request.user, "email", "") or ""
    setting = SiteSetting.objects(key=body_key).modify(
        upsert=True, new=True,
        set__key=body_key, set__category=category, set__value=value, set__updatedBy=email,
    )
    write_audit(request, "setting.update" if before else "setting.create", body_key,
                {"before": before_dict, "after": to_jsonable(setting)})
    return Response({"message": "Setting saved.", "setting": to_jsonable(setting)})


def delete_setting(request, key):
    setting = SiteSetting.objects(key=key).first()
    if not setting:
        return Response({"message": "Setting not found"}, status=404)
    write_audit(request, "setting.delete", setting.key, to_jsonable(setting))
    setting.delete()
    return Response({"message": "Setting deleted."})


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def setting_detail(request, key):
    if request.method == "GET":
        return get_setting(request, key)
    if request.method == "PUT":
        return upsert_setting(request, key)
    return delete_setting(request, key)
