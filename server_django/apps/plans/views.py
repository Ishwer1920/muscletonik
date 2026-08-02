from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.checkout.services import normalize_bmi_snapshot
from apps.core.permissions import RequireAuth

from .models import PlanSnapshot, UserPlan

# Deliberately narrower than ADMIN_PANEL_ROLES — staff/manager still pay.
FREE_PLAN_ROLES = {"admin", "super_admin"}


def can_claim_free_plans(role):
    return str(role or "") in FREE_PLAN_ROLES


def _to_dto(plan):
    return {
        "id": str(plan.id),
        "kind": plan.kind,
        "orderNumber": plan.orderNumber,
        "source": plan.source or "purchase",
        "purchasedAt": plan.createdAt.isoformat() if plan.createdAt else None,
        "snapshot": plan.snapshot.to_mongo().to_dict() if plan.snapshot else {},
    }


@api_view(["GET"])
@permission_classes([RequireAuth])
def my_plans(request):
    plans = UserPlan.objects(user=request.user.sub).order_by("-createdAt")
    return Response({
        "plans": [_to_dto(p) for p in plans],
        "canClaimFree": can_claim_free_plans(request.user.role),
    })


@api_view(["GET"])
@permission_classes([RequireAuth])
def get_plan(request, plan_id):
    try:
        ObjectId(plan_id)
    except InvalidId:
        return Response({"message": "Plan not found"}, status=404)
    plan = UserPlan.objects(id=plan_id, user=request.user.sub).first()
    if not plan:
        return Response({"message": "Plan not found"}, status=404)
    return Response({"plan": _to_dto(plan)})


@api_view(["POST"])
@permission_classes([RequireAuth])
def claim_free_plans(request):
    if not can_claim_free_plans(request.user.role):
        return Response({"message": "Free plans are available to admin accounts only."}, status=403)

    snapshot = normalize_bmi_snapshot((request.data or {}).get("bmiSnapshot"))
    if not snapshot["bandId"] or not snapshot["bmi"]:
        return Response({
            "message": "Enter your height and weight first so the plan can be generated."
        }, status=400)

    granted = []
    for kind in ("diet", "workout"):
        existing = UserPlan.objects(user=request.user.sub, order=None, kind=kind).first()
        if not existing:
            UserPlan(
                user=request.user.sub, order=None, orderNumber="",
                kind=kind, snapshot=PlanSnapshot(**snapshot), source="admin_comp",
            ).save()
        granted.append(kind)

    return Response({"message": "Plans unlocked for your admin account.", "plans": granted}, status=201)
