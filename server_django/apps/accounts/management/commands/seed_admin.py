from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.accounts.services import hash_password
from apps.core import env


class Command(BaseCommand):
    """Direct port of server/src/services/admin.seed.js#seedAdminUser —
    idempotent upsert-or-promote-to-super_admin, run on every startup."""

    help = "Create or promote the configured admin account to super_admin."

    def handle(self, *args, **options):
        email = env.ADMIN_EMAIL.lower()
        user = User.objects(email=email).first()

        if user:
            if user.role != "super_admin":
                user.role = "super_admin"
                user.save()
            self.stdout.write(f"Admin account present: {email}")
            return

        User(
            name=env.ADMIN_NAME,
            email=email,
            passwordHash=hash_password(env.ADMIN_PASSWORD),
            role="super_admin",
            emailVerified=True,
        ).save()
        self.stdout.write(f"Admin account created: {email}")
