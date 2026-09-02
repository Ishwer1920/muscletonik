"""Customer-facing product reviews.

A shopper can rate a product out of 5 with an optional written review, whether
or not they have bought it (the "Verified purchase" badge is what separates the
two). Submissions land as "pending" and only reach the storefront once an admin
approves them in Admin -> Reviews, so this endpoint can never publish straight
to the product page.

Product.rating / Product.reviewCount are derived from the approved reviews and
recalculated by recalc_product_rating() whenever that set changes - here on
submit, and in the admin moderation views on approve/reject/delete.
"""

from datetime import datetime, timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.permissions import RequireAuth

from .models import Product, Review

MAX_TEXT = 2000


def recalc_product_rating(catalog_id):
    """Recompute a product's rating and review count from its approved reviews.

    Products imported from Shopify/Woo arrive with a seeded rating and review
    count and no Review documents behind them. So this only takes over once
    there is at least one approved review; with none it leaves the seeded
    figures alone rather than wiping a product's social proof the moment its
    first review is rejected.
    """
    try:
        catalog_id = int(catalog_id)
    except (TypeError, ValueError):
        return

    product = Product.objects(catalogId=catalog_id).first()
    if not product:
        return

    ratings = [
        r.rating for r in Review.objects(productId=catalog_id, status="approved").only("rating")
        if r.rating
    ]
    if not ratings:
        return

    product.rating = round(sum(ratings) / len(ratings), 2)
    product.reviewCount = len(ratings)
    product.save()


def _public_view(r):
    return {
        "id": str(r.id),
        "name": r.customerName,
        "rating": r.rating,
        "text": r.text or "",
        "verifiedPurchase": bool(r.verifiedPurchase),
        "reply": r.reply or "",
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }


def _has_bought(user_id, catalog_id):
    """Has this customer ever ordered this product? Drives the verified badge."""
    from apps.orders.models import Order
    sku = "MT-%d" % catalog_id
    return Order.objects(user=user_id, items__sku=sku).first() is not None


@api_view(["GET", "POST"])
@permission_classes([])
def product_reviews(request, catalog_id):
    if request.method == "GET":
        return list_product_reviews(request, catalog_id)
    # Only the write path needs a session; the list stays public.
    RequireAuth().has_permission(request, None)
    return create_product_review(request, catalog_id)


def list_product_reviews(request, catalog_id):
    try:
        catalog_id = int(catalog_id)
    except (TypeError, ValueError):
        return Response({"message": "Product not found"}, status=404)

    approved = list(
        Review.objects(productId=catalog_id, status="approved").order_by("-featured", "-createdAt")
    )
    ratings = [r.rating for r in approved if r.rating]
    breakdown = {str(star): 0 for star in range(1, 6)}
    for value in ratings:
        breakdown[str(int(round(value)))] = breakdown.get(str(int(round(value))), 0) + 1

    payload = {
        "reviews": [_public_view(r) for r in approved],
        "count": len(ratings),
        "average": round(sum(ratings) / len(ratings), 2) if ratings else 0,
        "breakdown": breakdown,
        "mine": None,
    }

    # So the product page can show "your review is awaiting approval" rather
    # than looking like the submission vanished.
    user_id = getattr(getattr(request, "user", None), "sub", None)
    if user_id:
        mine = Review.objects(productId=catalog_id, user=str(user_id)).first()
        if mine:
            payload["mine"] = dict(_public_view(mine), status=mine.status)
    return Response(payload)


def create_product_review(request, catalog_id):
    try:
        catalog_id = int(catalog_id)
    except (TypeError, ValueError):
        return Response({"message": "Product not found"}, status=404)

    product = Product.objects(catalogId=catalog_id).first()
    if not product:
        return Response({"message": "Product not found"}, status=404)

    try:
        rating = int(round(float(request.data.get("rating"))))
    except (TypeError, ValueError):
        rating = 0
    if not 1 <= rating <= 5:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Please choose a rating from 1 to 5 stars.", "param": "rating"}
        ]}, status=400)

    text = str(request.data.get("text") or "").strip()
    if len(text) > MAX_TEXT:
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Review must be %d characters or fewer." % MAX_TEXT, "param": "text"}
        ]}, status=400)

    user_id = str(request.user.sub)
    user = User.objects(id=user_id).only("name", "email").first()
    if not user:
        return Response({"message": "User not found"}, status=404)

    # One review per customer per product: a second submission edits the first
    # and drops it back into moderation rather than stacking up duplicates.
    doc = Review.objects(productId=catalog_id, user=user_id).first() or Review(
        productId=catalog_id, user=user_id
    )
    doc.productName = product.name
    doc.customerName = user.name or "Customer"
    doc.customerEmail = user.email or ""
    doc.rating = rating
    doc.text = text
    doc.verifiedPurchase = _has_bought(user_id, catalog_id)
    doc.status = "pending"
    doc.updatedAt = datetime.now(timezone.utc)
    doc.save()

    # The new review is pending, so this only ever reflects already-approved
    # ones - but a re-submitted review may have just left "approved".
    recalc_product_rating(catalog_id)

    return Response({
        "message": "Thanks! Your review will appear once it has been checked.",
        "review": dict(_public_view(doc), status=doc.status),
    }, status=201)
