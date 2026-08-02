from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.catalog.models import Product
from apps.core.permissions import RequireAuth
from apps.orders.models import Order

from .models import Payment
from .serializers import payment_to_dict


@api_view(["GET"])
@permission_classes([RequireAuth])
def history(request):
    payments = Payment.objects(user=request.user.sub).order_by("-createdAt")
    return Response({"payments": [payment_to_dict(p) for p in payments]})


@api_view(["POST"])
@permission_classes([RequireAuth])
def mark_failure(request):
    razorpay_order_id = request.data.get("razorpayOrderId")
    if not razorpay_order_id:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Invalid value", "param": "razorpayOrderId"}
        ]}, status=400)
    reason = request.data.get("reason") or "payment_failed"

    Payment.objects(razorpayOrderId=razorpay_order_id, user=request.user.sub).update(
        set__status="failed", set__metadata={"reason": reason}
    )
    Order.objects(razorpayOrderId=razorpay_order_id, user=request.user.sub).update(
        set__paymentStatus="failed"
    )
    return Response({"message": "Payment failure recorded"})


@api_view(["POST"])
@permission_classes([RequireAuth])
def refund(request):
    order_number = request.data.get("orderNumber")
    if not order_number:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Invalid value", "param": "orderNumber"}
        ]}, status=400)

    order = Order.objects(orderNumber=order_number, user=request.user.sub).first()
    if not order:
        return Response({"message": "Order not found"}, status=404)
    if order.paymentStatus == "refunded":
        return Response({"message": "Order is already refunded"}, status=400)

    for item in order.items:
        Product.objects(id=item.product).update_one(inc__stock=item.quantity)

    order.paymentStatus = "refunded"
    order.fulfillmentStatus = "refunded"
    order.save()

    reason = request.data.get("reason") or "customer_refund"
    Payment.objects(order=order.id).update(set__status="refunded", set__metadata={"refundReason": reason})

    return Response({"message": "Refund processed", "orderNumber": order.orderNumber})
