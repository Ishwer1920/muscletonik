from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.permissions import RequireAdminPanel, RequirePermission

from .uploads import banner_image_upload, brand_logo_upload, build_file_url, product_image_upload


def _respond_with_files(request, files, folder):
    return Response({
        "message": "Files uploaded.",
        "files": [
            {**f, "url": build_file_url(request, folder, f["filename"])}
            for f in files
        ],
    }, status=201)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def upload_product_images(request):
    files = product_image_upload(request)
    return _respond_with_files(request, files, "products")


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def upload_banner_images(request):
    files = banner_image_upload(request)
    return _respond_with_files(request, files, "banners")


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def upload_brand_logos(request):
    files = brand_logo_upload(request)
    return _respond_with_files(request, files, "brands")
