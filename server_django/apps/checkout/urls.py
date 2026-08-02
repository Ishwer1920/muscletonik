from django.urls import path

from . import views

urlpatterns = [
    path("session", views.create_session),
    path("order", views.create_order),
    path("verify", views.verify_payment),
]
