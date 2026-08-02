from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core import env
from apps.core.permissions import RequireAuth
from apps.orders.serializers import order_to_dict
from apps.payments.serializers import payment_to_dict

from . import services
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
             "price": li["product"].sellingPrice, "quantity": li["quantity"]}
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
            {"advance": split["advance"], "balance": split["balance"], "ratePercent": round(COD_ADVANCE_RATE * 100)}
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
