from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import env
from apps.core.permissions import RequireAuth
from apps.orders.serializers import order_to_dict
from apps.payments.serializers import payment_to_dict

from . import pricing, services
from .pricing import COD_ADVANCE_RATE, split_cod_amounts


def _resolve_mode(payload):
    return "cod_advance" if (payload or {}).get("paymentMode") == "cod" else "full"


def _validate_checkout_body(data):
    errors = []
    items = data.get("items")
    if not isinstance(items, list) or not items:
        errors.append({"msg": "Your cart is empty. Add at least one product before checkout.", "param": "items"})
    coupon_code = data.get("couponCode")
    if coupon_code is not None and not isinstance(coupon_code, str):
        errors.append({"msg": "Coupon code must be text.", "param": "couponCode"})
    shipping_address = data.get("shippingAddress")
    if shipping_address is not None and not isinstance(shipping_address, dict):
        errors.append({"msg": "Shipping address is invalid.", "param": "shippingAddress"})
    return errors


@api_view(["POST"])
@permission_classes([RequireAuth])
def create_session(request):
    errors = _validate_checkout_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    session = services.create_checkout_session(request.user.sub, request.data)
    return Response({
        "sessionId": session["checkoutSessionId"],
        "summary": session["summary"],
        "items": [
            {"id": str(li["product"].id), "name": li["product"].name,
             "weight": li.get("weight", ""),
             "price": li.get("unitPrice", li["product"].sellingPrice),
             "quantity": li["quantity"]}
            for li in session["items"]
        ],
    })


@api_view(["POST"])
@permission_classes([RequireAuth])
def create_order(request):
    errors = _validate_checkout_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    mode = _resolve_mode(request.data)
    session = services.create_checkout_session(request.user.sub, request.data)
    razorpay_order = services.create_razorpay_order(session, mode)
    split = split_cod_amounts(session["summary"]["total"])

    return Response({
        "keyId": env.RAZORPAY_KEY_ID,
        "sessionId": session["checkoutSessionId"],
        "orderId": razorpay_order["id"],
        "amount": razorpay_order["amount"],
        "currency": razorpay_order["currency"],
        "paymentMode": mode,
        "summary": session["summary"],
        "cod": (
            {
                "advance": split["advance"], "balance": split["balance"],
                "ratePercent": round(COD_ADVANCE_RATE * 100),
                # COD carries no convenience fee — it is free.
                "charge": pricing.COD_CHARGE, "free": True,
                "label": "Cash on Delivery – FREE",
            }
            if mode == "cod_advance" else None
        ),
    })


@api_view(["POST"])
@permission_classes([RequireAuth])
def verify_payment(request):
    payload = request.data or {}
    session = services.create_checkout_session(request.user.sub, payload.get("session") or payload)
    mode = _resolve_mode(payload)
    result = services.verify_and_capture_payment(
        user_id=request.user.sub,
        session=session,
        razorpay_order_id=payload.get("razorpayOrderId"),
        razorpay_payment_id=payload.get("razorpayPaymentId"),
        razorpay_signature=payload.get("razorpaySignature"),
        payment_status="paid",
        mode=mode,
        bmi_snapshot=payload.get("bmiSnapshot"),
    )

    return Response({
        "message": "Advance verified and order confirmed" if mode == "cod_advance" else "Payment verified and order created",
        "order": order_to_dict(result["order"]),
        "payment": payment_to_dict(result["payment"]),
        "plans": result["plans"] or [],
    })


@api_view(["POST"])
@permission_classes([RequireAuth])
def place_cod_order(request):
    """Confirm a Cash-on-Delivery order directly — no online payment at all."""
    payload = request.data or {}
    session = services.create_checkout_session(request.user.sub, payload.get("session") or payload)
    result = services.place_cod_order(
        user_id=request.user.sub,
        session=session,
        bmi_snapshot=payload.get("bmiSnapshot"),
    )
    return Response({
        "message": "Order confirmed — pay in cash on delivery.",
        "order": order_to_dict(result["order"]),
        "payment": payment_to_dict(result["payment"]) if result["payment"] else None,
        "plans": result["plans"] or [],
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def validate_coupon(request):
    """Quote a coupon against the cart without creating anything.

    The storefront used to score coupons from a hardcoded {TONIK10: 0.10}
    table in js/cart.js, so every code the admin panel created looked invalid
    to the shopper. This is the same evaluator checkout uses, so the cart page
    and the final bill can never disagree.

    Works signed-out (the cart page) - per-customer limits are only checked
    when we know who is asking, and always re-checked at checkout.
    """
    payload = request.data or {}
    code = payload.get("couponCode") or payload.get("code")
    if not str(code or "").strip():
        return Response({"message": "Enter a coupon code.", "valid": False}, status=400)

    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return Response({
            "valid": False,
            "message": "Add something to your cart before applying a coupon.",
        }, status=400)

    user = getattr(request, "user", None)
    user_id = getattr(user, "sub", None) if getattr(user, "is_authenticated", False) else None

    line_items = services.resolve_line_items(items)
    subtotal = sum(li["lineTotal"] for li in line_items)
    result = pricing.evaluate_coupon(code, line_items, user_id=user_id, subtotal=subtotal)

    if not result["ok"]:
        return Response({
            "valid": False,
            "code": str(code).strip().upper(),
            "message": result["reason"] or "That coupon code is not valid.",
        })

    after_coupon = max(0, subtotal - result["amount"])
    has_physical = any(not li["product"].digital for li in line_items)
    shipping = pricing.shipping_charge(after_coupon) if has_physical else 0
    if result["freeShipping"]:
        shipping = 0
    # Only the exclusive share is charged on top; inclusive tax already sits
    # inside the line prices.
    gst = pricing.gst_breakdown_for_line_items(line_items, result["amount"])

    detail = pricing.coupon_public_view(result.get("coupon"))
    return Response({
        "valid": True,
        "code": result["code"],
        "discount": result["amount"],
        "freeShipping": result["freeShipping"],
        "eligibleSubtotal": result["eligibleSubtotal"],
        "coupon": detail,
        "message": _applied_message(result, detail),
        "summary": {
            "subtotal": subtotal,
            "discount": result["amount"],
            "shipping": shipping,
            "codCharge": pricing.COD_CHARGE,
            "gst": gst["total"],
            "gstAdded": gst["added"],
            "gstIncluded": gst["included"],
            "taxInclusive": gst["included"] > 0 and gst["added"] == 0,
            "total": after_coupon + shipping + gst["added"],
        },
    })


def _applied_message(result, detail):
    if result["freeShipping"]:
        return "Free shipping applied with " + result["code"] + "."
    label = (detail or {}).get("title") or result["code"]
    return "Coupon applied: " + label + " (-Rs." + str(result["amount"]) + ")"
