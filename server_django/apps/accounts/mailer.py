import logging
import smtplib
from email.message import EmailMessage

from apps.core import env

logger = logging.getLogger(__name__)


def has_smtp():
    return bool(env.SMTP_HOST and env.SMTP_USER and env.SMTP_PASS)


def send_mail(to, subject, html):
    """Direct port of server/src/utils/mailer.js — silently no-ops when SMTP
    isn't configured (matches Node's dev-mode behavior). A configured-but-
    failing SMTP server (bad creds, host down, etc.) is logged and swallowed
    too, since a broken mailbox must never block account creation, checkout,
    or any other flow that happens to send a notification email."""
    if not has_smtp():
        return False

    msg = EmailMessage()
    msg["From"] = env.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    try:
        if env.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(env.SMTP_HOST, env.SMTP_PORT) as server:
                server.login(env.SMTP_USER, env.SMTP_PASS)
                server.send_message(msg)
        else:
            with smtplib.SMTP(env.SMTP_HOST, env.SMTP_PORT) as server:
                server.starttls()
                server.login(env.SMTP_USER, env.SMTP_PASS)
                server.send_message(msg)
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False

    return True
