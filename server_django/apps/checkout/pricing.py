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

# Cash on Delivery is free: choosing COD never adds a convenience fee. Kept as a
# named constant (rather than an inline 0) so the storefront can read it and the
# intent stays obvious if anyone revisits COD pricing later.
COD_CHARGE = 0

FREE_SHIPPING_OVER = 599
SHIPPING_FEE = 79

# ---------------------------------------------------------------------------
# GST
#
# THE SINGLE PLACE GST IS CONFIGURED:
#   Admin panel -> Tax  (stored as SiteSetting key "taxes", field "gstRate")
#     * "Default GST rate" applies to every product that has no override.
#     * A per-product override lives on Product.gstRate (same admin page).
#
# DEFAULT_GST_PERCENT below is only the cold-start fallback used before that
# setting has ever been saved. Change the rate in the admin panel, not here.
# ---------------------------------------------------------------------------
DEFAULT_GST_PERCENT = 5.0

# Whether a price already contains its GST.
#   "exclusive" - GST is added on top at checkout (the original behaviour).
#   "inclusive" - the listed price already contains GST; the tax is extracted
#                 for the invoice but adds nothing to what the customer pays,
#                 which is what "Inclusive of all taxes" means on the total.
# Resolved per product: product override -> brand override -> store default.
DEFAULT_TAX_MODE = "exclusive"
TAX_MODES = ("inclusive", "exclusive")

# Kept so any older import of pricing.GST_RATE still resolves. New code should
# call default_gst_rate() / product_gst_rate() so admin edits are honoured.
GST_RATE = DEFAULT_GST_PERCENT / 100


def _clean_percent(value):
    """A usable 0-100 GST percent, or None if the value is unset/garbage."""
    if value is None or value == "":
        return None
    try:
        percent = float(value)
    except (TypeError, ValueError):
        return None
    if percent < 0 or percent > 100:
        return None
    return percent


def _clean_tax_mode(value):
    """A usable tax mode, or None when unset/garbage (meaning "inherit")."""
    mode = str(value or "").strip().lower()
    return mode if mode in TAX_MODES else None


def default_tax_mode():
    """Store-wide inclusive/exclusive setting from Admin -> Tax & GST."""
    from apps.cms.models import SiteSetting
    try:
        doc = SiteSetting.objects(key="taxes").first()
    except Exception:
        return DEFAULT_TAX_MODE
    value = doc.value if doc else None
    if isinstance(value, dict):
        mode = _clean_tax_mode(value.get("taxMode"))
        if mode is not None:
            return mode
    return DEFAULT_TAX_MODE


def brand_tax_modes():
    """{brand-id: mode} for brands carrying their own inclusive/exclusive
    override, alongside the GST rate override on the same brand record."""
    from apps.catalog import taxonomy
    modes = {}
    try:
        brands = taxonomy.get_brands()
    except Exception:
        return modes
    for brand in brands or []:
        if not isinstance(brand, dict):
            continue
        mode = _clean_tax_mode(brand.get("taxMode"))
        if mode is not None and brand.get("id"):
            modes[str(brand["id"]).strip().lower()] = mode
    return modes


def product_tax_mode(product, default_mode=None, brand_modes=None):
    """Inclusive or exclusive for one product, by the same priority as the
    rate: product override -> brand override -> store default."""
    if default_mode is None:
        default_mode = default_tax_mode()

    own = _clean_tax_mode(getattr(product, "taxMode", None))
    if own is not None:
        return own

    if brand_modes is None:
        brand_modes = brand_tax_modes()
    brand = str(getattr(product, "brand", "") or "").strip().lower()
    if brand and brand in brand_modes:
        return brand_modes[brand]

    return default_mode


def default_gst_rate():
    """Store-wide GST percent from Admin -> Tax, falling back to the constant.

    Read per call rather than cached: the rate changes rarely but must take
    effect the moment it is saved, and every caller is already hitting Mongo.
    """
    from apps.cms.models import SiteSetting
    try:
        doc = SiteSetting.objects(key="taxes").first()
    except Exception:
        return DEFAULT_GST_PERCENT
    value = doc.value if doc else None
    if isinstance(value, dict):
        percent = _clean_percent(value.get("gstRate"))
        if percent is not None:
            return percent
    return DEFAULT_GST_PERCENT


def gst_enabled():
    """Whether GST is charged at all. Admin -> Tax & GST."""
    from apps.cms.models import SiteSetting
    try:
        doc = SiteSetting.objects(key="taxes").first()
    except Exception:
        return True
    value = doc.value if doc else None
    if isinstance(value, dict) and "gstEnabled" in value:
        return bool(value.get("gstEnabled"))
    return True


def brand_gst_rates():
    """{brand-id: percent} for brands carrying their own GST override.

    Brands live in the SiteSetting key/value store (catalog.brands), so the
    override rides along on each brand record rather than needing a new model.
    """
    from apps.catalog import taxonomy
    rates = {}
    try:
        brands = taxonomy.get_brands()
    except Exception:
        return rates
    for brand in brands or []:
        if not isinstance(brand, dict):
            continue
        percent = _clean_percent(brand.get("gstRate"))
        if percent is not None and brand.get("id"):
            rates[str(brand["id"]).strip().lower()] = percent
    return rates


def product_gst_rate(product, default_percent=None, brand_rates=None):
    """GST percent for one product, by the documented priority:

        product override  ->  brand override  ->  global default

    Each step is skipped when it is unset, so a product with no override falls
    to its brand, and a brand with no override falls to the store default.
    """
    if default_percent is None:
        default_percent = default_gst_rate()

    own = _clean_percent(getattr(product, "gstRate", None))
    if own is not None:
        return own

    if brand_rates is None:
        brand_rates = brand_gst_rates()
    brand = str(getattr(product, "brand", "") or "").strip().lower()
    if brand and brand in brand_rates:
        return brand_rates[brand]

    return default_percent


def gst_for_line_items(line_items, discount=0):
    """Total GST for a cart, charged per line at that product's own rate.

    A cart-wide coupon is spread across the lines in proportion to their value,
    so a discount reduces the taxable base of each line fairly instead of being
    taken entirely off whichever line happens to come first. With every product
    on the same rate this returns the same rupee figure as taxing the discounted
    subtotal in one go, so existing single-rate carts are unaffected.
    """
    lines = list(line_items or [])
    if not lines:
        return 0

    if not gst_enabled():
        return 0

    default_percent = default_gst_rate()
    brand_rates = brand_gst_rates()
    subtotal = sum(round_money(li.get("lineTotal", 0)) for li in lines)
    discount = min(round_money(discount), subtotal)

    if subtotal <= 0:
        return 0

    total = 0
    for li in lines:
        line_total = round_money(li.get("lineTotal", 0))
        share = round_money(discount * line_total / subtotal) if discount else 0
        taxable = max(0, line_total - share)
        rate = product_gst_rate(li.get("product"), default_percent, brand_rates)
        total += round_money(taxable * rate / 100)
    return total


def gst_breakdown_for_line_items(line_items, discount=0):
    """Split a cart's GST into what gets added on top and what is already in
    the price, so the caller knows how much to actually charge.

        {"added": <charged on top>, "included": <already in the price>,
         "total": added + included}

    An exclusive line is taxed the usual way. An inclusive line's price is
    treated as tax-inclusive, so the tax is extracted out of it
    (price * rate / (100 + rate)) rather than added to it: the customer pays
    the listed price and the tax is only broken out for the invoice.
    """
    empty = {"added": 0, "included": 0, "total": 0}
    lines = list(line_items or [])
    if not lines or not gst_enabled():
        return empty

    default_percent = default_gst_rate()
    brand_rates = brand_gst_rates()
    default_mode = default_tax_mode()
    brand_modes = brand_tax_modes()

    subtotal = sum(round_money(li.get("lineTotal", 0)) for li in lines)
    discount = min(round_money(discount), subtotal)
    if subtotal <= 0:
        return empty

    added = 0
    included = 0
    for li in lines:
        line_total = round_money(li.get("lineTotal", 0))
        share = round_money(discount * line_total / subtotal) if discount else 0
        taxable = max(0, line_total - share)
        product = li.get("product")
        rate = product_gst_rate(product, default_percent, brand_rates)
        if product_tax_mode(product, default_mode, brand_modes) == "inclusive":
            included += round_money(taxable * rate / (100 + rate)) if rate else 0
        else:
            added += round_money(taxable * rate / 100)
    return {"added": added, "included": included, "total": added + included}


def effective_price(product):
    """What a product actually sells for right now.

    A Crazy Deal price replaces sellingPrice when it is set and genuinely
    lower; anything else falls back to sellingPrice. Used by the cart AND by
    the catalogue serializer so the price on the card is the price charged.
    """
    selling = float(getattr(product, "sellingPrice", 0) or 0)
    if not getattr(product, "crazyDeal", False):
        return selling
    try:
        deal = float(getattr(product, "crazyDealPrice", 0) or 0)
    except (TypeError, ValueError):
        return selling
    return deal if 0 < deal < selling else selling


def find_weight_option(product, label):
    """The product's weight/pack option whose label matches, or None.

    Matching is case/space-insensitive so "2kg" from the client lines up with a
    stored "2 KG". Returns None when the product has no options or none match.
    """
    options = getattr(product, "weightOptions", None) or []
    if not options:
        return None
    wanted = _norm(label)
    if not wanted:
        return None
    for opt in options:
        if _norm(getattr(opt, "label", "")).replace(" ", "") == wanted.replace(" ", ""):
            return opt
    return None


def variant_unit_price(product, label=None):
    """Unit price for one cart line, honouring the chosen pack/weight.

    A product with weight options is priced from the selected option (or the
    first option when the client sent nothing), never from a client figure. A
    product without options falls back to the normal effective price, so every
    existing single-price product is unaffected.
    """
    options = getattr(product, "weightOptions", None) or []
    if not options:
        return effective_price(product)
    chosen = find_weight_option(product, label) or options[0]
    try:
        return float(getattr(chosen, "price", 0) or 0)
    except (TypeError, ValueError):
        return effective_price(product)


# ---------------------------------------------------------------------------
# Combos (Admin -> Merchandising -> Combo offers)
#
# A combo is a flat price for a whole set of products. It applies only while
# the cart still holds exactly what the combo lists - drop one item and every
# remaining line goes back to its normal price, which is the behaviour the
# storefront promises. Buying the same products individually never triggers it,
# because a line only counts toward a combo when the client tagged it with that
# combo's id.
# ---------------------------------------------------------------------------


def _combo_multiple(present, required):
    """How many whole combos the tagged lines make up, or 0 if they do not.

    Exactly N of every required item means N combos. Anything else - a missing
    product, an extra one, a quantity that is not the same multiple across the
    board - means the combo does not hold.
    """
    if set(present) != set(required):
        return 0
    multiple = None
    for catalog_id, needed in required.items():
        have = present.get(catalog_id, 0)
        if needed <= 0 or have <= 0 or have % needed:
            return 0
        n = have // needed
        if multiple is None:
            multiple = n
        elif n != multiple:
            return 0
    return multiple or 0


def apply_combo_pricing(line_items):
    """Re-price intact combo groups in place, at their fixed combo price.

    Each line's share of that price is proportional to what it would have cost
    on its own, so per-product GST rates still apply to a sensible base. Any
    rounding remainder lands on the last line, so the shares always add up to
    the combo price exactly.

    Returns a list describing the combos that were applied, for the summary.
    A line whose combo did not hold has its comboId cleared, so callers can
    tell the customer their bundle was broken.
    """
    from apps.catalog.models import Combo

    groups = {}
    for li in line_items:
        combo_id = li.get("comboId")
        if combo_id:
            groups.setdefault(str(combo_id), []).append(li)
    if not groups:
        return []

    applied = []
    for combo_id, lines in groups.items():
        combo = None
        try:
            combo = Combo.objects(id=combo_id, isActive=True).first()
        except Exception:
            combo = None

        required = {}
        if combo:
            for item in combo.items or []:
                required[int(item.catalogId)] = required.get(int(item.catalogId), 0) + int(item.quantity or 1)

        present = {}
        for li in lines:
            catalog_id = int(getattr(li["product"], "catalogId", 0) or 0)
            present[catalog_id] = present.get(catalog_id, 0) + int(li["quantity"])

        multiple = _combo_multiple(present, required) if combo else 0
        normal_total = sum(round_money(li["lineTotal"]) for li in lines)
        target = round_money(float(combo.comboPrice or 0) * multiple) if multiple else 0

        # No combo, a broken set, or a "deal" that saves nothing: leave the
        # lines at their normal prices and untag them.
        if not multiple or target <= 0 or target >= normal_total or normal_total <= 0:
            for li in lines:
                li["comboId"] = None
                li["combo"] = None
            continue

        allocated = 0
        for index, li in enumerate(lines):
            if index == len(lines) - 1:
                share = target - allocated
            else:
                share = round_money(target * round_money(li["lineTotal"]) / normal_total)
                allocated += share
            li["lineTotal"] = max(0, share)

        summary = {
            "comboId": combo_id,
            "name": combo.name,
            "quantity": multiple,
            "comboPrice": target,
            "normalTotal": normal_total,
            "saving": normal_total - target,
        }
        for li in lines:
            li["combo"] = summary
        applied.append(summary)
    return applied


def describe_applied_combos(line_items):
    """The combos that actually held for this cart, one entry each.

    Read back off the line items rather than returned straight from
    apply_combo_pricing, because the pricing runs inside resolve_line_items
    while the summary is assembled by its callers.
    """
    seen = {}
    for li in line_items or []:
        info = li.get("combo")
        if info and info.get("comboId") not in seen:
            seen[info["comboId"]] = info
    return list(seen.values())


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


def gst_amount(amount, percent=None):
    """Flat GST on a single figure at the store default rate.

    Still used for totals that have no line items to walk (a re-quote from a
    stored order). Carts go through gst_for_line_items() so per-product
    overrides apply.
    """
    if not gst_enabled():
        return 0
    if percent is None:
        percent = default_gst_rate()
    return round_money(amount * percent / 100)


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
