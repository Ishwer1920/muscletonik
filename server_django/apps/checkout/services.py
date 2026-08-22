import hashlib
import hmac

from apps.accounts.models import User
from apps.catalog.models import Product
from apps.core import env
from apps.core.exceptions import ApiError
from apps.core.tokens import create_token
from apps.orders.models import Order, OrderItem
from apps.payments.models import Payment
from apps.plans.models import PlanSnapshot, UserPlan

from . import pricing
from .razorpay_client import create_order as razorpay_create_order

# Direct port of server/src/services/checkout.service.js.


def _get_products_for_cart(items):
    # MongoDB is the single source of truth; never resync the catalog here.
    ids = [f"MT-{item['productId']}" for item in items]
    return list(Product.objects(sku__in=ids, status="active"))


def resolve_line_items(items):
    """Turn the client's [{id, qty}] rows into priced line items backed by the
    live catalog. Split out of create_checkout_session so the coupon-quote
    endpoint prices a cart exactly the same way checkout does."""
    items = items if isinstance(items, list) else []
    if not items:
        raise ApiError("Your cart is empty", 400)

    normalized = [
        {
            "productId": int(item.get("id") or item.get("productId")),
            "quantity": max(1, int(item.get("qty") or item.get("quantity") or 1)),
        }
        for item in items
    ]

    products = _get_products_for_cart(normalized)
    if len(products) != len(normalized):
        raise ApiError("One or more products in the cart are unavailable", 400)

    line_items = []
    for item in normalized:
        product = next(p for p in products if p.sku == f"MT-{item['productId']}")
        stock = float("inf") if product.digital else (product.stock or 0)
        if stock < item["quantity"]:
            raise ApiError(f"Insufficient stock for {product.name}", 400)
        line_items.append({
            "product": product,
            "quantity": item["quantity"],
            # Crazy Deal price wins when one is set — see pricing.effective_price.
            "lineTotal": pricing.round_money(pricing.effective_price(product) * item["quantity"]),
        })
    return line_items


def create_checkout_session(user_id, payload):
    user = User.objects(id=user_id).only("name", "email", "addresses").first()
    if not user:
        raise ApiError("User not found", 404)

    line_items = resolve_line_items(payload.get("items"))

    subtotal = sum(li["lineTotal"] for li in line_items)
    # Full evaluation, not just a rate lookup: scope (brand/category/product),
    # min order, start/expiry, global cap and this customer's own usage all get
    # a say, and a refused code comes back with the reason to show the shopper.
    coupon = pricing.evaluate_coupon(
        payload.get("couponCode"), line_items, user_id=user_id, subtotal=subtotal
    )
    after_coupon = max(0, subtotal - coupon["amount"])
    has_physical = any(not li["product"].digital for li in line_items)
    shipping = pricing.shipping_charge(after_coupon) if has_physical else 0
    if coupon["ok"] and coupon["freeShipping"]:
        shipping = 0
    # Per-line so a product carrying its own GST override is taxed at its own
    # rate; the coupon is spread across lines inside the helper.
    gst = pricing.gst_for_line_items(line_items, coupon["amount"])
    total = after_coupon + shipping + gst

    shipping_address = payload.get("shippingAddress")
    shipping_address = shipping_address if isinstance(shipping_address, dict) else {}

    return {
        "checkoutSessionId": create_token(),
        "user": user,
        "items": line_items,
        "shippingAddress": shipping_address,
        "coupon": coupon,
        "summary": {
            "subtotal": subtotal, "discount": coupon["amount"], "shipping": shipping,
            "gst": gst, "total": total, "couponCode": coupon["code"] if coupon["ok"] else "",
            "couponApplied": bool(coupon["ok"] and coupon["code"]),
            "couponMessage": coupon["reason"],
            "couponFreeShipping": bool(coupon["ok"] and coupon["freeShipping"]),
            "couponDetail": pricing.coupon_public_view(coupon.get("coupon")),
        },
    }


def normalize_bmi_snapshot(raw):
    def num(value, lo, hi):
        try:
            n = float(value)
        except (TypeError, ValueError):
            return 0
        if lo <= n <= hi:
            return round(n * 10) / 10
        return 0

    src = raw if isinstance(raw, dict) else {}
    return {
        "height": num(src.get("height"), 80, 250),
        "weight": num(src.get("weight"), 20, 400),
        "bmi": num(src.get("bmi"), 5, 100),
        "bandId": src.get("bandId") if src.get("bandId") in ("underweight", "normal", "overweight", "obese") else "",
        "bandLabel": str(src.get("bandLabel") or "")[:40],
        "goal": src.get("goal") if src.get("goal") in ("auto", "gain", "lose", "maintain") else "auto",
        "rangeLow": num(src.get("rangeLow"), 0, 400),
        "rangeHigh": num(src.get("rangeHigh"), 0, 400),
    }


def assert_cod_allowed(session):
    if not any(li["product"].digital for li in session["items"]):
        return
    raise ApiError(
        "Cash on Delivery isn't available for digital plans — they're delivered instantly. "
        "Please pay online to continue.",
        400,
    )


def grant_plan_entitlements(user_id, session, order_doc, bmi_snapshot):
    kinds = set()
    for li in session["items"]:
        plan_type = li["product"].planType
        if plan_type in ("diet", "workout"):
            kinds.add(plan_type)
        elif plan_type == "both":
            kinds.update({"diet", "workout"})
    if not kinds:
        return []

    snapshot = normalize_bmi_snapshot(bmi_snapshot)
    granted = []
    for kind in kinds:
        existing = UserPlan.objects(user=user_id, order=order_doc.id, kind=kind).first()
        if not existing:
            UserPlan(
                user=user_id, order=order_doc.id, orderNumber=order_doc.orderNumber,
                kind=kind, snapshot=PlanSnapshot(**snapshot), source="purchase",
            ).save()
        granted.append(kind)
    return granted


def create_razorpay_order(session, mode="full"):
    if mode == "cod_advance":
        assert_cod_allowed(session)

    split = pricing.split_cod_amounts(session["summary"]["total"])
    chargeable = split["advance"] if mode == "cod_advance" else session["summary"]["total"]

    return razorpay_create_order(
        chargeable,
        session["checkoutSessionId"],
        {
            "checkoutSessionId": session["checkoutSessionId"],
            "couponCode": session["summary"]["couponCode"] or "",
            "paymentMode": mode,
        },
    )


def verify_and_capture_payment(user_id, session, razorpay_order_id, razorpay_payment_id,
                                razorpay_signature, payment_status, mode="full", bmi_snapshot=None):
    if mode == "cod_advance":
        assert_cod_allowed(session)

    expected_signature = hmac.new(
        env.RAZORPAY_KEY_SECRET.encode(),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if expected_signature != razorpay_signature:
        raise ApiError("Payment signature verification failed", 400)

    existing_payment = Payment.objects(razorpayPaymentId=razorpay_payment_id).first()
    if existing_payment:
        existing_order = Order.objects(id=existing_payment.order).first()
        if existing_order:
            plans = grant_plan_entitlements(user_id, session, existing_order, bmi_snapshot)
            return {"order": existing_order, "payment": existing_payment, "plans": plans}

    # mongoengine's dec()/inc() validate the raw delta against the field's own
    # min_value, which rejects any negative delta on a min_value=0 IntField —
    # go straight to the underlying pymongo collection for this atomic op,
    # exactly mirroring Mongoose's Product.updateOne(...) call.
    products_collection = Product._get_collection()

    settled = payment_status == "paid"
    reserved = []
    if settled:
        for li in session["items"]:
            if li["product"].digital:
                continue
            result = products_collection.update_one(
                {"_id": li["product"].id, "stock": {"$gte": li["quantity"]}},
                {"$inc": {"stock": -li["quantity"]}},
            )
            if result.modified_count != 1:
                for done in reserved:
                    products_collection.update_one({"_id": done["id"]}, {"$inc": {"stock": done["quantity"]}})
                raise ApiError(
                    f"Insufficient stock for {li['product'].name}. Please review your cart and try again.",
                    409,
                )
            reserved.append({"id": li["product"].id, "quantity": li["quantity"]})

    is_cod_advance = mode == "cod_advance"
    split = pricing.split_cod_amounts(session["summary"]["total"])
    advance, balance = split["advance"], split["balance"]
    charged_amount = advance if is_cod_advance else session["summary"]["total"]

    try:
        import time
        order_number = f"MT-{int(time.time() * 1000)}"
        order_doc = Order(
            orderNumber=order_number,
            user=user_id,
            items=[
                OrderItem(
                    product=li["product"].id, name=li["product"].name,
                    sku=li["product"].sku, price=li["product"].sellingPrice, quantity=li["quantity"],
                )
                for li in session["items"]
            ],
            subtotal=session["summary"]["subtotal"],
            discount=session["summary"]["discount"],
            gst=session["summary"]["gst"],
            shipping=session["summary"]["shipping"],
            total=session["summary"]["total"],
            paymentStatus="partially_paid" if (settled and is_cod_advance) else payment_status,
            fulfillmentStatus="confirmed" if settled else "pending",
            paymentProvider="cod" if is_cod_advance else "razorpay",
            advancePaid=advance if (settled and is_cod_advance) else 0,
            balanceDue=balance if (settled and is_cod_advance) else 0,
            razorpayOrderId=razorpay_order_id,
            razorpayPaymentId=razorpay_payment_id,
            razorpaySignature=razorpay_signature,
            shippingAddress=session["shippingAddress"] or {},
            billingAddress=session["shippingAddress"] or {},
        ).save()

        metadata = {"couponCode": session["summary"]["couponCode"] or ""}
        if is_cod_advance:
            metadata.update({"orderTotal": session["summary"]["total"], "balanceDue": balance})

        payment_doc = Payment(
            user=user_id, order=order_doc.id, checkoutSessionId=session["checkoutSessionId"],
            provider="razorpay", razorpayOrderId=razorpay_order_id, razorpayPaymentId=razorpay_payment_id,
            razorpaySignature=razorpay_signature, status=payment_status,
            kind="cod_advance" if is_cod_advance else "full", amount=charged_amount,
            currency="INR", metadata=metadata,
        ).save()

        # Records the global count AND a per-customer row, so perUserLimit /
        # firstOrderOnly can be enforced on the next order.
        pricing.record_redemption(session.get("coupon") or {}, user_id, order_doc)
        plans = grant_plan_entitlements(user_id, session, order_doc, bmi_snapshot)

        return {"order": order_doc, "payment": payment_doc, "plans": plans}
    except Exception:
        for done in reserved:
            products_collection.update_one({"_id": done["id"]}, {"$inc": {"stock": done["quantity"]}})
        raise
