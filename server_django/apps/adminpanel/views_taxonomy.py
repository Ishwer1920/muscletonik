from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog import taxonomy
from apps.core.permissions import RequireAdminPanel, RequirePermission


@api_view(["GET"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def list_taxonomy(request):
    return Response(taxonomy.get_taxonomy())


@api_view(["POST"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def create_brand(request):
    email = getattr(request.user, "email", "") or ""
    brand = taxonomy.add_brand(request.data.get("name"), request.data.get("color"), request.data.get("desc"), email)
    write_audit(request, "brand.create", brand["id"], brand)
    return Response({"message": "Brand added.", "brand": brand}, status=201)


def update_brand(request, brand_id):
    email = getattr(request.user, "email", "") or ""
    brand = taxonomy.update_brand(brand_id, request.data, email)
    write_audit(request, "brand.update", brand["id"], brand)
    return Response({"message": "Brand updated.", "brand": brand})


def delete_brand(request, brand_id):
    email = getattr(request.user, "email", "") or ""
    brand = taxonomy.remove_brand(brand_id, email)
    write_audit(request, "brand.delete", brand["id"], brand)
    return Response({"message": "Brand deleted.", "brand": brand})


@api_view(["PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def brand_detail(request, brand_id):
    return update_brand(request, brand_id) if request.method == "PATCH" else delete_brand(request, brand_id)


@api_view(["POST"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def create_category(request):
    email = getattr(request.user, "email", "") or ""
    category = taxonomy.add_category(request.data.get("name"), request.data.get("icon"), email)
    write_audit(request, "category.create", category["id"], category)
    return Response({"message": "Category added.", "category": category}, status=201)


@api_view(["DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def delete_category(request, category_id):
    email = getattr(request.user, "email", "") or ""
    category = taxonomy.remove_category(category_id, email)
    write_audit(request, "category.delete", category["id"], category)
    return Response({"message": "Category deleted.", "category": category})
