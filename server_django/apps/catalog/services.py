from apps.cms.models import CmsContent, SiteSetting
from apps.core.serialization import to_jsonable

from . import fixtures, taxonomy
from .models import Product, Review

# Direct port of server/src/services/catalog.service.js.


def map_product(p):
    return {
        "id": p.catalogId,
        "name": p.name,
        "brand": p.brand,
        "category": p.category,
        "price": p.sellingPrice,
        "oldPrice": p.mrp,
        "rating": p.rating,
        "reviews": p.reviewCount,
        "badge": p.badge or "",
        "color": p.color or "#111111",
        "featured": bool(p.featured),
        "deal": bool(p.deal),
        "digital": bool(p.digital),
        "hidden": bool(p.hidden),
        "planType": p.planType or "",
        "short": p.shortDescription or "",
        "protein": p.protein or "",
        "servings": p.servings or 0,
        "calories": p.calories or 0,
        "flavor": p.flavor or "",
        "weight": p.weight or "",
        "desc": p.description or "",
        "ingredients": p.ingredients or "",
        "images": list(p.images or []),
        "galleryImages": list(p.galleryImages or []),
        "flavors": [{"name": f.name, "image": f.image or ""} for f in (p.flavors or []) if f and f.name],
        "stock": p.stock,
        "status": p.status,
    }


def _first_non_empty(*candidates):
    for value in candidates:
        if isinstance(value, list) and len(value):
            return value
    return []


def _apply_hero_overrides(hero):
    first, rest = fixtures.HERO_SLIDES[0], fixtures.HERO_SLIDES[1:]
    if not hero or not first:
        return fixtures.HERO_SLIDES
    alignment = hero.get("alignment")
    return [
        {
            **first,
            "eyebrow": hero.get("eyebrow") or first["eyebrow"],
            "title": hero.get("headline") or first["title"],
            "copy": hero.get("subheadline") or first["copy"],
            "cta1": {
                "label": hero.get("buttonText") or first["cta1"]["label"],
                "href": hero.get("buttonLink") or first["cta1"]["href"],
            },
            "cta2": first["cta2"],
            "accent": "dark" if alignment == "center" else first["accent"],
        },
        *rest,
    ]


def _parse_list(value):
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [v.strip() for v in str(value).split(",") if v.strip()]


def _active_products():
    docs = Product.objects(status="active").order_by("catalogId")
    return [map_product(p) for p in docs]


def get_catalog():
    settings_docs = list(SiteSetting.objects())
    review_docs = list(Review.objects(status="approved").order_by("-featured", "-createdAt").limit(12))
    homepage_docs = list(CmsContent.objects(slug="homepage"))
    brands = taxonomy.get_brands()
    categories = taxonomy.get_categories()

    settings = {doc.key: to_jsonable(doc.value) for doc in settings_docs}
    homepage_raw = homepage_docs[0] if homepage_docs else None
    homepage = to_jsonable(homepage_raw) if homepage_raw else None
    homepage_hero = (homepage.get("hero") if homepage else None) or {}
    homepage_settings = settings.get("homepage") or {}
    fallback_hero_slides = _apply_hero_overrides(homepage_hero)

    return {
        "brands": brands,
        "categories": categories,
        "goals": fixtures.GOALS,
        "products": _active_products(),
        "reviews": (
            [{"name": r.customerName, "tag": r.productName, "rating": r.rating, "text": r.text} for r in review_docs]
            if review_docs else fixtures.REVIEWS
        ),
        "transformations": fixtures.TRANSFORMATIONS,
        "heroSlides": _first_non_empty(
            homepage_hero.get("slides"), homepage_settings.get("heroSlides"), fallback_hero_slides
        ),
        "homepageSections": (homepage.get("sections") if homepage else None) or homepage_settings.get("sections") or [],
        "homepageOrder": (homepage.get("order") if homepage else None) or homepage_settings.get("order") or [],
        "siteContent": {
            **homepage_settings,
            "sections": (homepage.get("sections") if homepage else None) or homepage_settings.get("sections") or [],
            "order": (homepage.get("order") if homepage else None) or homepage_settings.get("order") or [],
            "hero": homepage_hero or homepage_settings.get("hero") or {},
            "brandStrip": (homepage.get("brandStrip") if homepage else None) or homepage_settings.get("brandStrip") or [],
        },
        "siteSettings": settings.get("store") or {},
    }


def _sort_products(items, sort):
    items = list(items)
    if sort == "price-low":
        return sorted(items, key=lambda p: p["price"])
    if sort == "price-high":
        return sorted(items, key=lambda p: p["price"], reverse=True)
    if sort == "discount":
        return sorted(items, key=lambda p: fixtures.discount_pct(p["price"], p["oldPrice"]), reverse=True)
    if sort == "newest":
        return sorted(items, key=lambda p: p["id"], reverse=True)
    return sorted(items, key=lambda p: p["reviews"], reverse=True)


def _to_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def search_products(query):
    categories = _parse_list(query.get("category") or query.get("categories"))
    brands_filter = _parse_list(query.get("brand") or query.get("brands"))
    search = str(query.get("search") or "").strip().lower()
    min_rating = _to_float(query.get("minRating"), 0)
    max_price = _to_float(query.get("maxPrice"), float("inf"))
    sort = str(query.get("sort") or "popularity")
    page = max(1, _to_int(query.get("page"), 1))
    limit = max(1, _to_int(query.get("limit"), 12))

    items = _active_products()
    all_brands = taxonomy.get_brands()
    all_categories = taxonomy.get_categories()

    def keep(product):
        if product["hidden"]:
            return False
        if categories and product["category"] not in categories:
            return False
        if brands_filter and product["brand"] not in brands_filter:
            return False
        if product["rating"] < min_rating:
            return False
        if product["price"] > max_price:
            return False
        if search:
            brand_name = next((b["name"] for b in all_brands if b["id"] == product["brand"]), "")
            category_name = next((c["name"] for c in all_categories if c["id"] == product["category"]), "")
            haystack = " ".join([
                product["name"], brand_name, category_name, product["desc"], product["ingredients"],
            ]).lower()
            if search not in haystack:
                return False
        return True

    filtered = [p for p in items if keep(p)]
    sorted_items = _sort_products(filtered, sort)
    total = len(sorted_items)
    total_pages = max(1, -(-total // limit))
    start = (page - 1) * limit
    return {
        "data": sorted_items[start:start + limit],
        "meta": {"total": total, "page": page, "limit": limit, "totalPages": total_pages},
    }


def get_product_details(catalog_id):
    doc = Product.objects(catalogId=int(catalog_id), status="active").first()
    return map_product(doc) if doc else None


def get_catalog_lookups():
    return {"brands": taxonomy.get_brands(), "categories": taxonomy.get_categories()}
