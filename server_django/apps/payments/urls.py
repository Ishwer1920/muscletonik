from django.urls import path

from . import views

urlpatterns = [
    path("history", views.history),
    path("failure", views.mark_failure),
    path("refund", views.refund),
]
