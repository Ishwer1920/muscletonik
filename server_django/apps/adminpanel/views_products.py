import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from mongoengine.errors import NotUniqueError
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.audit.utils import write_audit
from apps.catalog.models import Flavor, Product, WeightOption
from apps.core.permissions import RequireAdminPanel, RequirePermission

from .uploads import product_image_upload

EDITABLE = [
    "name", "brand", "category", "description", "shortDescription", "badge", "color",
    "protein", "calories", "servings", "flavor", "ingredients", "mrp", "sellingPrice",
    "stock", "rating", "reviewCount", "featured", "trending", "deal", "bestSeller",
    "newArrival", "weight", "status", "seoTitle", "seoDescription", "images", "galleryImages",
    "gstRate", "taxMode", "crazyDeal", "crazyDealPrice", "nearExpiry", "expiryDate",
    "arrivalDate",
]

# Mongoose auto-casts numeric/boolean strings from multipart form bodies;
# mongoengine does not, so admin product uploads (always multipart) need it
# done explicitly or every FloatField/IntField/BooleanField save fails.
# gstRate is nullable — "" clears the override, handled in _cast_field.
FLOAT_FIELDS = {"mrp", "sellingPrice", "rating", "gstRate", "crazyDealPrice"}
INT_FIELDS = {"calories", "servings", "stock", "reviewCount"}
BOOL_FIELDS = {"featured", "trending", "deal", "bestSeller", "newArrival", "crazyDeal", "nearExpiry"}
DATE_FIELDS = {"expiryDate", "arrivalDate"}


def _parse_date(value):
    """Accept an ISO date/datetime from the admin form; "" clears the field."""
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# Fields where an empty string from the product editor means "clear this",
# not "leave it alone". Without this, a merchandising date or a crazy-deal
# price could be set from the admin but never unset again.
CLEARABLE = {"gstRate", "taxMode", "expiryDate", "arrivalDate", "crazyDealPrice"}


def _cast_field(key, value):
    if key in DATE_FIELDS:
        return _parse_date(value)
    if key in ("gstRate", "taxMode") and (value is None or str(value).strip() == ""):
        # Blank means "no override" — inherit the store default.
        return None if key == "gstRate" else ""
    if key == "crazyDealPrice" and (value is None or str(value).strip() == ""):
        return 0
    if key in FLOAT_FIELDS:
        return float(value)
    if key in INT_FIELDS:
        return int(float(value))
    if key in BOOL_FIELDS:
        return value is True or value == "true" or value == "1"
    return value


def slugify(value):
    value = str(value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def discount_from(mrp, price):
    return round(((mrp - price) / mrp) * 100) if mrp > 0 and price <= mrp else 0


def parse_list(value):
    if not value:
        return []
    if isinstance(value, list):
        # DRF merges request.FILES into request.data under the same key, so
        # a multipart "images" file field can show up here too — filter
        # anything that isn't plain text (uploaded files are handled
        # separately via product_image_upload/request.FILES).
        return [str(v).strip() for v in value if isinstance(v, str) and v.strip()]
    if not isinstance(value, str):
        return []
    text = value.strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
    return [v.strip() for v in re.split(r"[\n,]", text) if v.strip()]


def parse_weight_options(value):
    """Build a clean list of WeightOption from the product editor.

    Accepts either a JSON array (string from a multipart form, or already a
    list from a JSON body) of {label, price, mrp?, stock?, sku?}. Rows without
    a label or a usable price are dropped, so a half-filled row can never save
    a broken pack. Returns [] for empty/garbage input, which clears the field.
    """
    if value is None or value == "":
        return []
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(raw, list):
        return []

    options = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or row.get("weight") or "").strip()
        if not label:
            continue
        try:
            price = float(row.get("price"))
        except (TypeError, ValueError):
            continue
        if price < 0:
            continue
        try:
            mrp = float(row.get("mrp")) if row.get("mrp") not in (None, "") else 0
        except (TypeError, ValueError):
            mrp = 0
        stock = None
        if row.get("stock") not in (None, ""):
            try:
                stock = max(0, int(float(row.get("stock"))))
            except (TypeError, ValueError):
                stock = None
        options.append(WeightOption(
            label=label, price=price, mrp=max(0, mrp),
            stock=stock, sku=str(row.get("sku") or "").strip(),
        ))
    return options


def parse_flavors(value):
    """Build a clean list of Flavor from the product editor.

    Accepts a JSON array (string from a multipart form, or already a list) of
    {name, image?} — or plain name strings. Rows without a name, and duplicate
    names, are dropped. Returns [] for empty/garbage input, which clears the
    field. This is what powers the storefront flavour selector.
    """
    if value is None or value == "":
        return []
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(raw, list):
        return []

    flavors = []
    seen = set()
    for row in raw:
        if isinstance(row, dict):
            name = str(row.get("name") or "").strip()
            image = str(row.get("image") or "").strip()
        else:
            name = str(row or "").strip()
            image = ""
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        flavors.append(Flavor(name=name, image=image))
    return flavors


def normalize_media(data, files):
    uploaded = [f"/uploads/products/{f['filename']}" for f in files]
    image_urls = parse_list(data.get("imageUrls") or data.get("images") or data.get("imageUrl"))
    gallery_urls = parse_list(data.get("galleryUrls") or data.get("galleryImages"))
    images = list(dict.fromkeys(uploaded + image_urls))
    gallery_images = list(dict.fromkeys(uploaded + gallery_urls + image_urls))
    return {"images": images, "galleryImages": gallery_images}


def apply_editable(doc, data):
    for key in EDITABLE:
        if key not in data:
            continue
        blank = data[key] is None or data[key] == ""
        if blank and key not in CLEARABLE:
            continue
        setattr(doc, key, _cast_field(key, data[key]))
    if isinstance(data.get("images"), list):
        doc.images = data["images"]
    if isinstance(data.get("galleryImages"), list):
        doc.galleryImages = data["galleryImages"]
    # Per-pack pricing. Present-but-empty clears it, so a product can be turned
    # back into a single-price item from the editor.
    if "weightOptions" in data:
        doc.weightOptions = parse_weight_options(data.get("weightOptions"))
    # Structured flavour list (powers the storefront selector). Present-but-empty
    # clears it. Keep the flat "flavor" string (search/summary) in sync so the
    # two never drift apart.
    if "flavors" in data:
        doc.flavors = parse_flavors(data.get("flavors"))
        doc.flavor = ", ".join(f.name for f in doc.flavors)
    doc.discountPercent = discount_from(float(doc.mrp or 0), float(doc.sellingPrice or 0))


def admin_view(p):
    return {
        "id": str(p.id), "catalogId": p.catalogId, "sku": p.sku, "name": p.name,
        "brand": p.brand, "category": p.category, "description": p.description,
        "shortDescription": p.shortDescription, "badge": p.badge, "color": p.color,
        "protein": p.protein, "calories": p.calories, "servings": p.servings,
        "flavor": p.flavor, "ingredients": p.ingredients,
        "flavors": [
            {"name": f.name, "image": f.image or ""}
            for f in (p.flavors or []) if f and f.name
        ],
        "images": list(p.images or []), "galleryImages": list(p.galleryImages or []),
        "mrp": p.mrp, "sellingPrice": p.sellingPrice, "discountPercent": p.discountPercent,
        "stock": p.stock, "rating": p.rating, "reviewCount": p.reviewCount,
        "featured": p.featured, "trending": p.trending, "deal": p.deal,
        "bestSeller": p.bestSeller, "newArrival": p.newArrival, "weight": p.weight,
        "weightOptions": [
            {"label": o.label, "price": o.price, "mrp": o.mrp or 0,
             "stock": o.stock, "sku": o.sku or ""}
            for o in (p.weightOptions or []) if o and o.label
        ],
        "status": p.status, "seoTitle": p.seoTitle, "seoDescription": p.seoDescription,
        "gstRate": p.gstRate, "taxMode": p.taxMode or "",
        "crazyDeal": p.crazyDeal, "crazyDealPrice": p.crazyDealPrice,
        "nearExpiry": p.nearExpiry, "newArrival": p.newArrival,
        "expiryDate": p.expiryDate.isoformat() if p.expiryDate else None,
        "arrivalDate": p.arrivalDate.isoformat() if p.arrivalDate else None,
        "createdAt": p.createdAt.isoformat() if p.createdAt else None,
    }


def _validate_product_body(data):
    errors = []
    name = str(data.get("name", "")).strip()
    if not (2 <= len(name) <= 160):
        errors.append({"msg": "Name is required (2–160 chars).", "param": "name"})
    if not str(data.get("brand", "")).strip():
        errors.append({"msg": "Brand is required.", "param": "brand"})
    if not str(data.get("category", "")).strip():
        errors.append({"msg": "Category is required.", "param": "category"})
    try:
        if float(data.get("sellingPrice")) < 0:
            raise ValueError
    except (TypeError, ValueError):
        errors.append({"msg": "Selling price must be ≥ 0.", "param": "sellingPrice"})
    if data.get("mrp") not in (None, "", 0, "0"):
        try:
            if float(data["mrp"]) < 0:
                raise ValueError
        except (TypeError, ValueError):
            errors.append({"msg": "MRP must be ≥ 0.", "param": "mrp"})
    if data.get("stock") not in (None, "", 0, "0"):
        try:
            if int(data["stock"]) < 0:
                raise ValueError
        except (TypeError, ValueError):
            errors.append({"msg": "Stock must be a whole number ≥ 0.", "param": "stock"})
    return errors


def list_products(request):
    page = max(1, int(request.query_params.get("page") or 1))
    limit = min(100, max(1, int(request.query_params.get("limit") or 20)))
    search = str(request.query_params.get("search") or "").strip()

    status = request.query_params.get("status")

    qs = Product.objects()
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        qs = qs.filter(__raw__={"$or": [{f: rx} for f in ("name", "sku", "brand", "category")]})
    if status:
        qs = qs.filter(status=status)

    total = qs.count()
    items = qs.order_by("catalogId").skip((page - 1) * limit).limit(limit)
    return Response({
        "page": page, "limit": limit, "total": total,
        "totalPages": max(1, -(-total // limit)),
        "products": [admin_view(p) for p in items],
    })


@api_view(["GET", "POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def products_collection(request):
    return list_products(request) if request.method == "GET" else create_product(request)


def get_product(request, product_id):
    try:
        ObjectId(product_id)
    except InvalidId:
        return Response({"message": "Product not found"}, status=404)
    p = Product.objects(id=product_id).first()
    if not p:
        return Response({"message": "Product not found"}, status=404)
    return Response({"product": admin_view(p)})


def create_product(request):
    errors = _validate_product_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)

    last = Product.objects().order_by("-catalogId").only("catalogId").first()
    catalog_id = (last.catalogId if last and last.catalogId else 0) + 1

    slug = slugify(request.data.get("name", "")) or f"product-{catalog_id}"
    if Product.objects(slug=slug).first():
        slug = f"{slug}-{catalog_id}"

    doc = Product(catalogId=catalog_id, sku=f"MT-{catalog_id}", slug=slug, status="active")
    apply_editable(doc, request.data)
    files = product_image_upload(request)
    media = normalize_media(request.data, files)
    if media["images"]:
        doc.images = media["images"]
    if media["galleryImages"]:
        doc.galleryImages = media["galleryImages"]

    try:
        doc.save()
    except NotUniqueError:
        return Response({"message": "A product with this name/slug already exists."}, status=409)

    write_audit(request, "product.create", doc.sku, {"name": doc.name, "price": doc.sellingPrice})
    return Response({"message": "Product created.", "product": admin_view(doc)}, status=201)


def update_product(request, product_id):
    errors = _validate_product_body(request.data)
    if errors:
        return Response({"message": "Validation failed", "errors": errors}, status=400)
    doc = Product.objects(id=product_id).first()
    if not doc:
        return Response({"message": "Product not found"}, status=404)

    before = {"name": doc.name, "sellingPrice": doc.sellingPrice, "stock": doc.stock, "status": doc.status}
    apply_editable(doc, request.data)
    files = product_image_upload(request)
    media = normalize_media(request.data, files)
    if media["images"]:
        doc.images = media["images"]
    if media["galleryImages"]:
        doc.galleryImages = media["galleryImages"]

    try:
        doc.save()
    except NotUniqueError:
        return Response({"message": "Duplicate product name/slug."}, status=409)

    write_audit(request, "product.update", doc.sku, {
        "before": before,
        "after": {"name": doc.name, "sellingPrice": doc.sellingPrice, "stock": doc.stock, "status": doc.status},
    })
    return Response({"message": "Product updated.", "product": admin_view(doc)})


def delete_product(request, product_id):
    doc = Product.objects(id=product_id).first()
    if not doc:
        return Response({"message": "Product not found"}, status=404)
    doc.delete()
    write_audit(request, "product.delete", doc.sku, {"name": doc.name})
    return Response({"message": "Product deleted.", "id": str(doc.id)})


@api_view(["GET", "PATCH", "DELETE"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def product_detail(request, product_id):
    if request.method == "GET":
        return get_product(request, product_id)
    if request.method == "PATCH":
        return update_product(request, product_id)
    return delete_product(request, product_id)


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def set_product_merchandising(request, product_id):
    """Toggle the merchandising flags for one product — Admin -> Merchandising.

    Its own endpoint for the same reason as the GST one: update_product()
    validates the entire product body, and these are single-field toggles.
    Only the keys actually supplied are touched.
    """
    doc = Product.objects(id=product_id).first()
    if not doc:
        return Response({"message": "Product not found"}, status=404)

    data = request.data
    before = {
        "crazyDeal": doc.crazyDeal, "nearExpiry": doc.nearExpiry,
        "newArrival": doc.newArrival, "crazyDealPrice": doc.crazyDealPrice,
    }

    for flag in ("crazyDeal", "nearExpiry", "newArrival"):
        if flag in data:
            setattr(doc, flag, data[flag] is True or str(data[flag]).lower() in ("true", "1"))

    if "crazyDealPrice" in data:
        raw = data.get("crazyDealPrice")
        if raw is None or str(raw).strip() == "":
            doc.crazyDealPrice = 0
        else:
            try:
                price = float(raw)
            except (TypeError, ValueError):
                price = -1
            if price < 0:
                return Response({"message": "Validation failed", "errors": [
                    {"msg": "Deal price must be 0 or more.", "param": "crazyDealPrice"}
                ]}, status=400)
            if price > float(doc.sellingPrice or 0):
                return Response({"message": "Validation failed", "errors": [
                    {"msg": "Deal price cannot exceed the selling price.", "param": "crazyDealPrice"}
                ]}, status=400)
            doc.crazyDealPrice = price

    for field in ("expiryDate", "arrivalDate"):
        if field in data:
            setattr(doc, field, _parse_date(data.get(field)))

    doc.save()
    write_audit(request, "product.merchandising", doc.sku, {"before": before, "after": {
        "crazyDeal": doc.crazyDeal, "nearExpiry": doc.nearExpiry,
        "newArrival": doc.newArrival, "crazyDealPrice": doc.crazyDealPrice,
    }})
    return Response({"message": "Product updated.", "product": admin_view(doc)})


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("settings")])
def set_product_gst(request, product_id):
    """Set (or clear) one product's GST override — Admin -> Tax & GST.

    Its own endpoint rather than a PUT through update_product() because that
    path validates the whole product body; this only ever touches gstRate.
    An empty string / null clears either override so the product falls back to
    its brand, then the store default. Both are optional: a request carrying
    only one of them leaves the other untouched.
    """
    doc = Product.objects(id=product_id).first()
    if not doc:
        return Response({"message": "Product not found"}, status=404)

    if "taxMode" in request.data:
        mode = str(request.data.get("taxMode") or "").strip().lower()
        if mode not in ("", "inclusive", "exclusive"):
            return Response({"message": "Validation failed", "errors": [
                {"msg": "Tax mode must be inclusive or exclusive.", "param": "taxMode"}
            ]}, status=400)
        before_mode = doc.taxMode
        doc.taxMode = mode
        if "gstRate" not in request.data:
            doc.save()
            write_audit(request, "product.taxMode", doc.sku, {"before": before_mode, "after": mode})
            return Response({"message": "Tax mode updated.", "product": admin_view(doc)})

    raw = request.data.get("gstRate")
    if raw is None or str(raw).strip() == "":
        rate = None
    else:
        try:
            rate = float(raw)
        except (TypeError, ValueError):
            rate = -1
        if rate < 0 or rate > 100:
            return Response({"message": "Validation failed", "errors": [
                {"msg": "GST rate must be between 0 and 100.", "param": "gstRate"}
            ]}, status=400)

    before = doc.gstRate
    doc.gstRate = rate
    doc.save()
    write_audit(request, "product.gst", doc.sku, {"before": before, "after": rate})
    return Response({"message": "GST updated.", "product": admin_view(doc)})


@api_view(["PATCH"])
@permission_classes([RequireAdminPanel, RequirePermission("products")])
def set_product_status(request, product_id):
    status = request.data.get("status")
    if status not in ("active", "archived"):
        return Response({"message": "Validation failed", "errors": [
            {"msg": "Status must be active or archived.", "param": "status"}
        ]}, status=400)
    doc = Product.objects(id=product_id).first()
    if not doc:
        return Response({"message": "Product not found"}, status=404)
    doc.status = status
    doc.save()
    write_audit(request, "product.status", doc.sku, {"status": doc.status})
    return Response({"message": "Status updated.", "product": admin_view(doc)})
