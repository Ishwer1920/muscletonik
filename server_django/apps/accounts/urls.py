from django.urls import path

from . import views

urlpatterns = [
    path("register", views.register),
    path("login", views.login),
    path("logout", views.logout),
    path("refresh", views.refresh),
    path("me", views.me),
    path("forgot-password", views.forgot_password),
    path("reset-password", views.reset_password_handler),
    path("verify-email", views.verify_email_handler),
    path("change-password", views.change_password),
    path("profile", views.update_profile),
    path("avatar", views.UploadAvatarView.as_view()),
]
