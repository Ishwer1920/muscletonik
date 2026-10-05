import re

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog.models import Review
from apps.catalog.reviews import recalc_product_rating
from apps.core.permissions import RequireAdminPanel, RequirePermission
from apps.core.serialization import to_jsonable

from .paging import paging

STATUSES = ("pending", "approved", "rejected", "spam")


def _validate_review_body(data, partial=False):
    errors = []
    if not partial or data.get("productId") is not None:
        try:
            if int(data.get("productId")) < 1:
                raise ValueError
        except (TypeError, ValueError):
            errors.append({"msg": "Product id is required.", "param": "productId"})
    if not partial or data.get("productName") is not None:
        if not (2 <= len(str(data.get("productName") or "").strip()) <= 200):
            errors.append({"msg": "Product name is required.", "param": "productName"})
    if not partial or data.get("customerName") is not None:
        if not (2 <= len(str(data.get("customerName") or "").strip()) <= 80):
            errors.append({"msg": "Customer name is required.", "param": "customerName"})
    if not partial or data.get("rating") is not None:
        try:
            if not (1 <= int(data.get("rating")) <= 5):
                raise ValueError
        except (TypeError, ValueError):
            errors.append({"msg": "Rating must be 1-5.", "param": "rating"})
    # The written part is optional - a star rating on its own is a review.
    if len(str(data.get("text") or "").strip()) > 2000:
        errors.append({"msg": "Review must be 2000 characters or fewer.", "param": "text"})
    if data.get("status") is not None and data.get("status") not in STATUSES:
        errors.append({"msg": "Invalid status.", "param": "status"})
    return errors


def _review_list_item(r):
    """listReviews remaps to this shape; create/update return the raw
    Mongoose document (_id, every field) via a plain res.json({review})."""
    return {
        "id": str(r.id), "productId": r.productId, "productName": r.productName,
        "customerName": r.customerName, "customerEmail": r.customerEmail, "rating": r.rating,
        "text": r.text, "imageUrl": r.imageUrl, "status": r.status, "featured": r.featured,
        "reply": r.reply, "tags": list(r.tags or []),
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }


def list_reviews(request):
    page, limit, skip = paging(request, max_limit=100)
    search = str(request.query_params.get("search") or "").strip()

    qs = Review.objects()
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        qs = qs.filter(__raw__={"$or": [{f: rx} for f in ("productName", "customerName", "text", "reply")]})
    status = request.query_params.get("status")
    if status:
        qs = qs.filter(status=status)
    featured = request.query_params.get("featured")
    if featured == "true":
        qs = qs.filter(featured=True)
    elif featured == "false":
        qs = qs.filter(featured=False)
    min_rating = request.query_params.get("minRating")
    if min_rating:
        qs = qs.filter(rating__gte=float(min_rating))

    total = qs.count()
    reviews = list(qs.order_by("-createdAt").skip(skip).limit(limit))

    reviews_col = Review._get_collection()
    summary_agg = list(reviews_col.aggregate([
        {"$group": {"_id": None,
                    **{s: {"$sum": {"$cond": [{"$eq": ["$status", s]}, 1, 0]}} for s in STATUSES}}}
    ]))
    summary = {s: 0 for s in STATUSES}
    if summary_agg:
        summary.update({s: summary_agg[0][s] for s in STATUSES})

    return Response({
        "page": page, "limit": limit, "total": total, "totalPages": max(1, -(-total // limit)),
        "summary": summary, "reviews": [_review_list_item(r) for r in reviews],
    })


def create_review(request):
    errors = _validate_review_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    featured = request.data.get("featured")
    review = Review(
        productId=int(request.data["productId"]), productName=request.data["productName"],
        customerName=request.data["customerName"], customerEmail=request.data.get("customerEmail") or "",
        rating=int(request.data["rating"]), text=request.data.get("text") or "",
        imageUrl=request.data.get("imageUrl") or "", status=request.data.get("status") or "pending",
        featured=(featured is True or featured == "true"), reply=request.data.get("reply") or "",
        tags=request.data.get("tags") if isinstance(request.data.get("tags"), list) else [],
    ).save()
    recalc_product_rating(review.productId)
    write_audit(request, "review.create", review.productName, to_jsonable(review))
    return Response({"message": "Review created.", "review": to_jsonable(review)}, status=201)


def update_review(request, review_id):
    try:
        ObjectId(review_id)
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [{"msg": "Invalid review id.", "param": "id"}]}, status=400)

    # A PATCH is a partial update: the admin's quick actions send just
    # {"status": ...}, and the edit form sends the full object. Validate only
    # the fields actually present, so a status-only change isn't rejected for a
    # "missing" productId/name/rating it never intended to touch. Any field
    # that IS present is still fully validated.
    errors = _validate_review_body(request.data, partial=True)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    review = Review.objects(id=review_id).first()
    if not review:
        return Response({"message": "Review not found"}, status=404)

    before = to_jsonable(review)
    for field in ("productName", "customerName", "customerEmail", "text", "imageUrl", "status", "reply"):
        if request.data.get(field) is not None:
            setattr(review, field, request.data[field])
    if request.data.get("productId") is not None:
        review.productId = int(request.data["productId"])
    if request.data.get("rating") is not None:
        review.rating = int(request.data["rating"])
    if request.data.get("featured") is not None:
        review.featured = request.data["featured"] is True or request.data["featured"] == "true"
    if isinstance(request.data.get("tags"), list):
        review.tags = request.data["tags"]
    review.save()
    recalc_product_rating(review.productId)
    write_audit(request, "review.update", review.productName, {"before": before, "after": to_jsonable(review)})
    return Response({"message": "Review updated.", "review": to_jsonable(review)})


def delete_review(request, review_id):
    try:
        ObjectId(review_id)
    except InvalidId:
        return Response({"message": "Validation failed", "errors": [{"msg": "Invalid review id.", "param": "id"}]}, status=400)
    review = Review.objects(id=review_id).first()
    if not review:
        return Response({"message": "Review not found"}, status=404)
    write_audit(request, "review.delete", review.productName, to_jsonable(review))
    product_id = review.productId
    review.delete()
    recalc_product_rating(product_id)
    return Response({"message": "Review deleted."})


@api_view(["GET", "POST"])
@permission_classes([RequireAdminPanel, RequirePermission("reviews")])
def reviews_collection(request):
    return list_reviews(request) if request.method == "GET" else create_review(request)


@api_view(["PATCH", "DELETE"])
@permission_classes([RequireAdminPanel, RequirePermission("reviews")])
def review_detail(request, review_id):
    return update_review(request, review_id) if request.method == "PATCH" else delete_review(request, review_id)
