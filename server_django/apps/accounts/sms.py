"""Outbound SMS, used by the forgot-password OTP flow.

The project had no SMS capability at all, and which gateway to use is a
commercial decision, so this is a thin adapter: set SMS_PROVIDER in .env and
fill in that provider's keys. With nothing configured it logs the message and
reports failure, which is what keeps local development usable.

    SMS_PROVIDER=msg91|fast2sms|twilio|console
    SMS_API_KEY=...            (msg91 authkey / fast2sms authorization)
    SMS_SENDER_ID=MSCTNK       (6-char DLT-approved header, msg91/fast2sms)
    SMS_TEMPLATE_ID=...        (msg91 DLT template id)
    TWILIO_ACCOUNT_SID=...     (twilio only)
    TWILIO_AUTH_TOKEN=...      (twilio only)
    TWILIO_FROM=+1...          (twilio only)
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from apps.core import env

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10


def has_sms():
    provider = (env.SMS_PROVIDER or "").lower()
    if provider == "console":
        return True
    if provider in ("msg91", "fast2sms"):
        return bool(env.SMS_API_KEY)
    if provider == "twilio":
        return bool(env.TWILIO_ACCOUNT_SID and env.TWILIO_AUTH_TOKEN and env.TWILIO_FROM)
    return False


def _post(url, data, headers=None, as_json=True):
    body = json.dumps(data).encode() if as_json else urllib.parse.urlencode(data).encode()
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json" if as_json else "application/x-www-form-urlencoded")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.status, response.read().decode("utf-8", "replace")


def _e164(phone):
    """MSG91 and Fast2SMS want bare digits with the country code; Twilio wants
    +CC. Our stored numbers are 10 bare digits (see validation.normalize_phone)."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(digits) == 10:
        digits = env.SMS_COUNTRY_CODE + digits
    return digits


def send_sms(phone, message):
    """Best-effort delivery. Returns True only if the gateway accepted it -
    the caller decides what to tell the user, and never crashes on failure."""
    provider = (env.SMS_PROVIDER or "").lower()
    if not has_sms():
        logger.warning("SMS not configured (SMS_PROVIDER=%r); would have sent to %s", provider, phone)
        return False

    number = _e164(phone)

    try:
        if provider == "console":
            # Development: no gateway, just make the code visible in the log.
            logger.info("[SMS console] to %s: %s", number, message)
            return True

        if provider == "msg91":
            status, raw = _post(
                "https://api.msg91.com/api/v5/flow/",
                {
                    "template_id": env.SMS_TEMPLATE_ID,
                    "sender": env.SMS_SENDER_ID,
                    "short_url": "0",
                    "recipients": [{"mobiles": number, "otp": message}],
                },
                headers={"authkey": env.SMS_API_KEY},
            )
        elif provider == "fast2sms":
            status, raw = _post(
                "https://www.fast2sms.com/dev/bulkV2",
                {
                    "route": "dlt",
                    "sender_id": env.SMS_SENDER_ID,
                    "message": env.SMS_TEMPLATE_ID,
                    "variables_values": message,
                    "numbers": number[-10:],
                },
                headers={"authorization": env.SMS_API_KEY},
                as_json=False,
            )
        elif provider == "twilio":
            auth = env.TWILIO_ACCOUNT_SID + ":" + env.TWILIO_AUTH_TOKEN
            import base64
            status, raw = _post(
                "https://api.twilio.com/2010-04-01/Accounts/" + env.TWILIO_ACCOUNT_SID + "/Messages.json",
                {"To": "+" + number, "From": env.TWILIO_FROM, "Body": message},
                headers={"Authorization": "Basic " + base64.b64encode(auth.encode()).decode()},
                as_json=False,
            )
        else:
            logger.warning("Unknown SMS_PROVIDER %r", provider)
            return False

        if 200 <= status < 300:
            return True
        logger.error("SMS gateway %s rejected the message (HTTP %s): %s", provider, status, raw[:400])
        return False

    except (urllib.error.URLError, OSError, ValueError):
        logger.exception("Failed to send SMS to %s via %s", number, provider)
        return False


def send_otp_sms(phone, code, minutes):
    """The OTP body. Keep this wording in sync with the DLT-approved template
    registered with the gateway, or Indian operators will drop the message."""
    text = (
        "{0} is your Muscle Tonik password reset code. It expires in {1} minutes. "
        "Do not share it with anyone.".format(code, minutes)
    )
    # MSG91's flow API takes the raw OTP as a template variable, not the
    # rendered sentence; every other provider takes the full text.
    payload = code if (env.SMS_PROVIDER or "").lower() == "msg91" else text
    return send_sms(phone, payload)
