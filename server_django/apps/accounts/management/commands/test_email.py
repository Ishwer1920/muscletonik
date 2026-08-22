"""Diagnose the SMTP configuration.

    python manage.py test_email                 # connect + log in only
    python manage.py test_email you@domain.com  # also send a real test message

Password-reset OTPs are delivered by email, so when SMTP credentials are wrong
the whole forgot-password flow stops working. mailer.send_mail() deliberately
swallows delivery errors (a broken mail server must never 500 a checkout), which
makes a bad password easy to miss — this command surfaces it.
"""

import smtplib
import ssl

from django.core.management.base import BaseCommand

from apps.accounts import mailer
from apps.core import env


class Command(BaseCommand):
    help = "Check the SMTP settings in .env, and optionally send a test email."

    def add_arguments(self, parser):
        parser.add_argument("to", nargs="?", default="", help="Address to send a test email to.")

    def handle(self, *args, **options):
        self.stdout.write("SMTP_HOST : " + (env.SMTP_HOST or "(not set)"))
        self.stdout.write("SMTP_PORT : " + str(env.SMTP_PORT))
        self.stdout.write("SMTP_USER : " + (env.SMTP_USER or "(not set)"))
        self.stdout.write("SMTP_PASS : " + ("set" if env.SMTP_PASS else "(not set)"))
        self.stdout.write("SMTP_FROM : " + (env.SMTP_FROM or "(not set)"))

        if not mailer.has_smtp():
            self.stdout.write(self.style.ERROR(
                "\nSMTP is not configured — password-reset emails cannot be sent.\n"
                "Set SMTP_HOST, SMTP_USER and SMTP_PASS in server_django/.env."
            ))
            return

        try:
            if env.SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(env.SMTP_HOST, env.SMTP_PORT, timeout=20)
            else:
                server = smtplib.SMTP(env.SMTP_HOST, env.SMTP_PORT, timeout=20)
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            server.login(env.SMTP_USER, env.SMTP_PASS)
        except smtplib.SMTPAuthenticationError as exc:
            self.stdout.write(self.style.ERROR(
                "\nAuthentication REJECTED by the mail server: {0}\n"
                "The username or password in .env is wrong, or the mailbox requires an\n"
                "app-specific password. Until this is fixed, password-reset OTP emails\n"
                "will not be delivered.".format(exc)
            ))
            return
        except Exception as exc:            # noqa: BLE001 - report anything the server throws
            self.stdout.write(self.style.ERROR(
                "\nCould not reach the mail server: {0}: {1}".format(type(exc).__name__, exc)
            ))
            return

        self.stdout.write(self.style.SUCCESS("\nConnection and login OK."))

        to = options.get("to")
        if not to:
            self.stdout.write("Pass an address to also send a test message: "
                              "python manage.py test_email you@domain.com")
            server.quit()
            return

        server.quit()
        sent = mailer.send_mail(
            to,
            "Muscle Tonik — SMTP test",
            "<p>This is a test message from your Muscle Tonik server.</p>"
            "<p>If you can read this, password-reset OTP emails will be delivered.</p>",
        )
        if sent:
            self.stdout.write(self.style.SUCCESS("Test email sent to " + to))
        else:
            self.stdout.write(self.style.ERROR(
                "send_mail() reported failure — check the server log for the reason."))
