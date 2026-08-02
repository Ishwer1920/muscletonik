from django.urls import path

from . import views

urlpatterns = [
    path("mine", views.my_plans),
    path("claim-free", views.claim_free_plans),
    path("<str:plan_id>", views.get_plan),
]
