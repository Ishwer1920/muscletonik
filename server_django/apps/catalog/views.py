from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import services


@api_view(["GET"])
@permission_classes([AllowAny])
def catalog(request):
    return Response(services.get_catalog())


@api_view(["GET"])
@permission_classes([AllowAny])
def catalog_lookups(request):
    return Response(services.get_catalog_lookups())


@api_view(["GET"])
@permission_classes([AllowAny])
def products(request):
    result = services.search_products(request.query_params)
    return Response(result)


@api_view(["GET"])
@permission_classes([AllowAny])
def banners(request):
    """Public feed of live slideshow banners — cheap enough to poll on its own
    without pulling the whole catalogue."""
    return Response({
        "banners": services.live_banners(),
        "slideshowSettings": services.slideshow_settings(),
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def product_by_id(request, product_id):
    try:
        product = services.get_product_details(product_id)
    except (TypeError, ValueError):
        product = None
    if not product:
        return Response({"message": "Product not found"}, status=404)
    return Response(product)
