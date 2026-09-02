from django.urls import path

from . import reviews, views

urlpatterns = [
    path("", views.catalog),
    path("lookups", views.catalog_lookups),
    path("banners", views.banners),
    path("products", views.products),
    # Before the <str:product_id> catch-all below. That converter never
    # matches a "/" so the two cannot collide, but keeping the more specific
    # route first makes the intent obvious.
    path("products/<int:catalog_id>/reviews", reviews.product_reviews),
    path("products/<str:product_id>", views.product_by_id),
]
