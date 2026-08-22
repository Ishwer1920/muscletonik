from django.urls import path

from . import views

urlpatterns = [
    path("", views.catalog),
    path("lookups", views.catalog_lookups),
    path("banners", views.banners),
    path("products", views.products),
    path("products/<str:product_id>", views.product_by_id),
]
