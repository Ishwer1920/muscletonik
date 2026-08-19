import math
from datetime import datetime, timezone

from .models import Coupon, CouponRedemption

# Direct port of the pricing pipeline in server/src/services/checkout.service.js.
# All money is server-computed, whole-rupee, never trusted from the client.

# Legacy hardcoded codes. Kept so anything already printed/shared still works;
# anything created in the admin panel lives in the coupons collection and wins.
COUPONS = {
    "TONIK10": {"type": "percent", "value": 10},
    "FIRST15": {"type": "percent", "value": 15},
}

COD_ADVANCE_RATE = 0.2

FREE_SHIPPING_OVER = 599
SHIPPING_FEE = 79
GST_RATE = 0.05


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
    return 0 if subtotal_after_discount > FREE_SHIPPING_OVER else SHIPPING_FEE


def gst_amount(amount):
    return round_money(amount * GST_RATE)


def _as_utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _norm(value):
    return str(value or "").strip().lower()


def item_matches_scope(coupon, product):
    """Does this one product fall inside the coupon's targeting?"""
    scope = coupon.appliesTo or "all"
    if scope == "all":
        return True
    if scope == "brands":
        return _norm(product.brand) in {_norm(b) for b in (coupon.brands or [])}
    if scope == "categories":
        return _norm(product.category) in {_norm(c) for c in (coupon.categories or [])}
    if scope == "products":
        wanted = {_norm(s) for s in (coupon.productSkus or [])}
        # Accept either the stored SKU ("MT-1234"), the bare catalog id, or the slug.
        sku = _norm(product.sku)
        bare = sku[3:] if sku.startswith("mt-") else sku
        return bool(wanted & {sku, bare, _norm(product.slug), _norm(getattr(product, "catalogId", ""))})
    return True


def scope_label(coupon):
    """Human sentence describing what the code covers - reused by the admin
    table and by the storefront's coupon-applied line."""
    scope = coupon.appliesTo or "all"
    if scope == "brands" and coupon.brands:
        return "Only on " + ", ".join(coupon.brands)
    if scope == "categories" and coupon.categories:
        return "Only on " + ", ".join(coupon.categories)
    if scope == "products" and coupon.productSkus:
        count = len(coupon.productSkus)
        return "Only on {0} selected product{1}".format(count, "s" if count != 1 else "")
    return "All products"


def _eligible_subtotal(coupon, line_items):
    """Rupees in the cart the coupon is allowed to discount."""
    total = 0
    for li in line_items:
        if item_matches_scope(coupon, li["product"]):
            total += li["lineTotal"]
    return round_money(total)


def _reject(reason):
    return {
        "ok": False, "reason": reason, "amount": 0, "code": "",
        "freeShipping": False, "coupon": None, "eligibleSubtotal": 0,
    }


def _has_previous_order(user_id):
    from apps.orders.models import Order
    return Order.objects(user=user_id).first() is not None


def evaluate_coupon(code, line_items, user_id=None, subtotal=None):
    """The single decision point for whether a code applies, by how much, and
    if not, why not. Returns a dict the API hands straight to the UI so the
    customer sees "Add Rs.200 more to use this code" instead of a silent no-op.

    line_items: [{"product": <Product>, "quantity": int, "lineTotal": int}]
    """
    normalized = str(code or "").strip().upper()
    if not normalized:
        return _reject("")

    cart_subtotal = subtotal if subtotal is not None else round_money(
        sum(li["lineTotal"] for li in line_items)
    )

    coupon = Coupon.objects(code=normalized).first()
    if not coupon:
        legacy = COUPONS.get(normalized)
        if not legacy:
            return _reject("That coupon code is not valid.")
        amount = (
            round_money(cart_subtotal * legacy["value"] / 100)
            if legacy["type"] == "percent" else round_money(legacy["value"])
        )
        return {
            "ok": True, "reason": "", "amount": min(amount, cart_subtotal), "code": normalized,
            "freeShipping": False, "coupon": None, "eligibleSubtotal": cart_subtotal,
        }

    now = datetime.now(timezone.utc)

    if not coupon.active:
        return _reject("That coupon is no longer active.")

    starts_at = _as_utc(coupon.startsAt)
    if starts_at and starts_at > now:
        return _reject("This code becomes valid on " + starts_at.strftime("%d %b %Y") + ".")

    expires_at = _as_utc(coupon.expiresAt)
    if expires_at and expires_at < now:
        return _reject("That coupon has expired.")

    if coupon.maxUses and coupon.usageCount >= coupon.maxUses:
        return _reject("This coupon has reached its usage limit.")

    eligible = _eligible_subtotal(coupon, line_items)
    if eligible <= 0:
        return _reject("This code does not apply to anything in your cart. " + scope_label(coupon) + ".")

    # minOrder is judged against the cart as a whole, matching how customers
    # read "on orders above Rs.X".
    if coupon.minOrder and cart_subtotal < coupon.minOrder:
        short = round_money(coupon.minOrder - cart_subtotal)
        return _reject(
            "Add Rs." + str(short) + " more to use this code (minimum order Rs."
            + str(round_money(coupon.minOrder)) + ")."
        )

    if user_id:
        if coupon.firstOrderOnly and _has_previous_order(user_id):
            return _reject("This code is for first orders only.")
        if coupon.perUserLimit:
            used = CouponRedemption.objects(coupon=coupon.id, user=user_id).count()
            if used >= coupon.perUserLimit:
                return _reject("You have already used this code the maximum number of times.")

    amount = 0
    free_shipping = False
    if coupon.type == "percent":
        amount = round_money(eligible * (coupon.value or 0) / 100)
        if coupon.maxDiscount:
            amount = min(amount, round_money(coupon.maxDiscount))
    elif coupon.type == "flat":
        amount = min(round_money(coupon.value), eligible)
    elif coupon.type == "free_shipping":
        free_shipping = True

    return {
        "ok": True, "reason": "", "amount": amount, "code": normalized,
        "freeShipping": free_shipping, "coupon": coupon, "eligibleSubtotal": eligible,
    }


def get_coupon_discount(subtotal, code, line_items=None, user_id=None):
    """Backwards-compatible wrapper for callers that only have a subtotal.
    Prefer evaluate_coupon() - it also reports free shipping and the reason a
    code was refused."""
    result = evaluate_coupon(code, line_items or [], user_id=user_id, subtotal=subtotal)
    if not result["ok"]:
        return {"amount": 0, "code": ""}
    return {"amount": result["amount"], "code": result["code"]}


def coupon_public_view(coupon):
    """The subset of a coupon that is safe to show a shopper."""
    if not coupon:
        return None
    return {
        "code": coupon.code,
        "title": coupon.title,
        "type": coupon.type,
        "purpose": coupon.purpose,
        "description": coupon.description,
        "scope": scope_label(coupon),
        "minOrder": round_money(coupon.minOrder),
        "maxDiscount": round_money(coupon.maxDiscount),
        "expiresAt": _as_utc(coupon.expiresAt).isoformat() if coupon.expiresAt else None,
    }


def record_redemption(result, user_id, order=None):
    """Bump the global counter and write the per-customer row. Called once,
    after payment is verified - never at quote time."""
    if not isinstance(result, dict):
        return
    code = result.get("code")
    if not code:
        return
    try:
        Coupon.objects(code=str(code).upper()).update_one(inc__usageCount=1)
    except Exception:
        pass

    coupon = result.get("coupon")
    if not coupon or not user_id:
        return
    try:
        CouponRedemption(
            coupon=coupon.id,
            code=coupon.code,
            user=user_id,
            order=getattr(order, "id", None),
            orderNumber=getattr(order, "orderNumber", "") or "",
            discount=result.get("amount") or 0,
            orderTotal=getattr(order, "total", 0) or 0,
        ).save()
    except Exception:
        pass


def mark_coupon_used(code):
    """Legacy entry point - global counter only, no per-user row."""
    if not code:
        return
    try:
        Coupon.objects(code=str(code).upper()).update_one(inc__usageCount=1)
    except Exception:
        pass
