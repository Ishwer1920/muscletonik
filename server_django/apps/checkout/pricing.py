import math
from datetime import datetime, timezone

from .models import Coupon

# Direct port of the pricing pipeline in server/src/services/checkout.service.js.
# All money is server-computed, whole-rupee, never trusted from the client.

COUPONS = {
    "TONIK10": {"type": "percent", "value": 10},
    "FIRST15": {"type": "percent", "value": 15},
}

COD_ADVANCE_RATE = 0.2


def round_money(n):
    """JS's Math.round always rounds .5 up (toward +Infinity); Python's round()
    uses banker's rounding on ties. All amounts here are non-negative, so
    floor(x + 0.5) reproduces Math.round's tie-breaking exactly."""
    try:
        value = float(n)
    except (TypeError, ValueError):
        value = 0
    return max(0, math.floor(value + 0.5))


def split_cod_amounts(total):
    advance = round_money(total * COD_ADVANCE_RATE)
    return {"advance": advance, "balance": round_money(total - advance)}


def shipping_charge(subtotal_after_discount):
    return 0 if subtotal_after_discount > 599 else 79


def gst_amount(amount):
    return round_money(amount * 0.05)


def get_coupon_discount(subtotal, code):
    if not code:
        return {"amount": 0, "code": ""}
    normalized = str(code).upper()
    coupon_doc = Coupon.objects(code=normalized, active=True).first()
    if coupon_doc:
        if coupon_doc.expiresAt:
            expires = coupon_doc.expiresAt
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return {"amount": 0, "code": ""}
        if coupon_doc.maxUses > 0 and coupon_doc.usageCount >= coupon_doc.maxUses:
            return {"amount": 0, "code": ""}
        if subtotal < (coupon_doc.minOrder or 0):
            return {"amount": 0, "code": ""}
        if coupon_doc.type == "percent":
            return {"amount": round_money(subtotal * coupon_doc.value / 100), "code": normalized}
        if coupon_doc.type == "flat":
            return {"amount": round_money(coupon_doc.value), "code": normalized}
        if coupon_doc.type == "free_shipping":
            return {"amount": 0, "code": normalized}

    coupon = COUPONS.get(normalized)
    if not coupon:
        return {"amount": 0, "code": ""}
    if coupon["type"] == "percent":
        return {"amount": round_money(subtotal * coupon["value"] / 100), "code": normalized}
    return {"amount": round_money(coupon["value"]), "code": normalized}


def mark_coupon_used(code):
    if not code:
        return
    try:
        Coupon.objects(code=str(code).upper()).update_one(inc__usageCount=1)
    except Exception:
        pass
