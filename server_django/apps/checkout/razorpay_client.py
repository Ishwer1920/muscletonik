import razorpay

from apps.core import env
from apps.core.exceptions import ApiError


def create_order(amount_rupees, receipt, notes):
    if not env.RAZORPAY_KEY_ID or not env.RAZORPAY_KEY_SECRET:
        raise ApiError("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.", 503)

    client = razorpay.Client(auth=(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET))
    try:
        return client.order.create({
            "amount": int(amount_rupees * 100),
            "currency": "INR",
            "receipt": receipt[:40],
            "notes": notes,
        })
    except Exception as err:
        description = _extract_description(err)
        raise ApiError(
            f"Could not start the payment. The payment gateway rejected the request "
            f"({description}). Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
            502,
        )


def _extract_description(err):
    args = getattr(err, "args", None)
    if args and isinstance(args[0], dict):
        return args[0].get("error", {}).get("description", str(err))
    return str(err) or "unknown error"
