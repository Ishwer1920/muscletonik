from django.urls import path

from . import views

urlpatterns = [
    path("", views.list_my_orders),
    path("admin", views.list_all_orders),
    path("admin/<str:order_id>", views.update_order_status),
]
