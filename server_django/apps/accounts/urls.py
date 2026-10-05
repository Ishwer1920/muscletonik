from django.urls import path

from . import views

urlpatterns = [
    path("register", views.register),
    path("login", views.login),
    path("otp/request", views.auth_otp_request),
    path("otp/verify", views.auth_otp_verify),
    path("logout", views.logout),
    path("refresh", views.refresh),
    path("me", views.me),
    path("forgot-password", views.forgot_password),
    path("forgot-password/lookup", views.forgot_password_lookup),
    path("forgot-password/otp", views.forgot_password_send_otp),
    path("forgot-password/verify", views.forgot_password_verify_otp),
    path("reset-password", views.reset_password_handler),
    path("verify-email", views.verify_email_handler),
    path("change-password", views.change_password),
    path("profile", views.update_profile),
    path("avatar", views.UploadAvatarView.as_view()),
]
