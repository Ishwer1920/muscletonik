import smtplib
from email.message import EmailMessage

from apps.core import env


def has_smtp():
    return bool(env.SMTP_HOST and env.SMTP_USER and env.SMTP_PASS)


def send_mail(to, subject, html):
    """Direct port of server/src/utils/mailer.js — silently no-ops when SMTP
    isn't configured (matches Node's dev-mode behavior)."""
    if not has_smtp():
        return False

    msg = EmailMessage()
    msg["From"] = env.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    if env.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(env.SMTP_HOST, env.SMTP_PORT) as server:
            server.login(env.SMTP_USER, env.SMTP_PASS)
            server.send_message(msg)
    else:
        with smtplib.SMTP(env.SMTP_HOST, env.SMTP_PORT) as server:
            server.starttls()
            server.login(env.SMTP_USER, env.SMTP_PASS)
            server.send_message(msg)

    return True
