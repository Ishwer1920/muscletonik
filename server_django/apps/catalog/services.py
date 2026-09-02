from datetime import datetime, timezone

from apps.checkout import pricing
from apps.cms.models import CmsContent, SiteSetting
from apps.core.serialization import to_jsonable

from . import fixtures, taxonomy
from .models import Product, Review

# Direct port of server/src/services/catalog.service.js.


def near_expiry_threshold_days():
    """Days-before-expiry that counts as "near expiry". Admin -> Settings
    (SiteSetting "catalog", field nearExpiryDays); 90 if never configured."""
    doc = SiteSetting.objects(key="catalog").first()
    value = doc.value if doc else None
    if isinstance(value, dict):
        try:
            days = int(value.get("nearExpiryDays"))
            if 1 <= days <= 3650:
                return days
        except (TypeError, ValueError):
            pass
    return 90


def _days_to_expiry(expiry):
    if not expiry:
        return None
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return (expiry - datetime.now(timezone.utc)).days


def is_near_expiry(p, threshold_days=None):
    """Manual tick wins; otherwise derived from expiryDate vs the threshold.
    Already-expired stock is excluded — that is a fulfilment problem, not a
    discount opportunity."""
    if getattr(p, "nearExpiry", False):
        return True
    days = _days_to_expiry(getattr(p, "expiryDate", None))
    if days is None:
        return False
    if threshold_days is None:
        threshold_days = near_expiry_threshold_days()
    return 0 <= days <= threshold_days


def map_product(p, threshold_days=None):
    days_left = _days_to_expiry(getattr(p, "expiryDate", None))
    return {
        "id": p.catalogId,
        "name": p.name,
        "brand": p.brand,
        "category": p.category,
        # On a Crazy Deal the deal price becomes "price" and the normal
        # selling price becomes the struck-through "oldPrice", so the existing
        # discount maths on the card reports the real saving.
        "price": pricing.effective_price(p),
        "oldPrice": (p.sellingPrice if pricing.effective_price(p) < (p.sellingPrice or 0) else p.mrp),
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
        # None means "no override" — the storefront falls back to the store
        # default in taxSettings.gstRate.
        "gstRate": p.gstRate,
        "taxMode": p.taxMode or "",
        # --- merchandising -------------------------------------------------
        "newArrival": bool(p.newArrival),
        "crazyDeal": bool(p.crazyDeal),
        "crazyDealPrice": p.crazyDealPrice or 0,
        "nearExpiry": is_near_expiry(p, threshold_days),
        # Only the coarse figure a shopper needs; the raw batch date stays
        # internal so we are not publishing inventory detail.
        "daysToExpiry": days_left if days_left is not None and days_left >= 0 else None,
        "arrivalDate": p.arrivalDate.isoformat() if p.arrivalDate else None,
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
    # Resolve the threshold once rather than per product (3k+ rows per call).
    threshold = near_expiry_threshold_days()
    return [map_product(p, threshold) for p in docs]


def slideshow_settings():
    """How the homepage slideshow behaves. Admin -> Slideshow.

    intervalSeconds is how long each slide is held before advancing. Clamped
    to a sane 2-60s so a bad value cannot freeze or strobe the hero.
    """
    doc = SiteSetting.objects(key="slideshow").first()
    value = doc.value if doc and isinstance(doc.value, dict) else {}

    try:
        seconds = float(value.get("intervalSeconds"))
    except (TypeError, ValueError):
        seconds = 6.5
    seconds = min(60.0, max(2.0, seconds))

    return {
        "intervalSeconds": seconds,
        "autoplay": value.get("autoplay") is not False,
        "pauseOnHover": value.get("pauseOnHover") is not False,
    }


def _iso_utc(value):
    """ISO-8601 with an explicit UTC offset.

    Mongo hands back naive datetimes, and .isoformat() on those omits the
    zone — JavaScript then reads the string as LOCAL time, so a countdown
    would be hours out for anyone not on UTC. Stamping the offset keeps every
    client on the same instant.
    """
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def live_banners():
    """Active, in-schedule slideshow banners in display order.

    Shape matches what the hero renderer already understands (image / title /
    copy / cta), so the storefront can drop these straight into the slider.
    """
    from apps.cms import actions
    from apps.cms.models import Banner
    out = []
    for b in Banner.objects().order_by("displayOrder", "createdAt"):
        if not b.is_live():
            continue
        # CTA destinations are resolved here, never in the browser: the target
        # is checked against the real catalogue and an unresolvable one yields
        # no button rather than a dead link.
        primary = actions.resolve(b.buttonActionType, b.buttonTarget) or b.ctaUrl or ""
        out.append({
            "id": str(b.id),
            "layout": b.layout or "slide",
            "placement": b.placement or "home",
            "image": b.image or "",
            "imageMobile": b.imageMobile or "",
            "alt": b.alt or b.heading or b.title or "Promotional banner",
            "title": b.title or "",
            "subtitle": b.subtitle or "",
            # --- composed layouts ---
            "heading": b.heading or "",
            "subheadingText": b.subheading or "",
            "paragraph": b.paragraph or "",
            "offerText": b.offerText or "",
            "note": b.note or "",
            "backgroundColor": b.backgroundColor or "",
            "overlay": b.overlay or 0,
            "mainImage": b.mainImage or "",
            "productImage": b.productImage or "",
            "logo": b.logo or "",
            "logoSize": b.logoSize or 120,
            "logoPosition": b.logoPosition or "right",
            "product": actions.product_snapshot(b.productId),
            # --- CTAs ---
            "ctaText": b.ctaText or "",
            "ctaUrl": primary,
            "href": primary,
            "cta2Text": b.button2Text or "",
            "cta2Url": actions.resolve(b.button2ActionType, b.button2Target),
            # --- countdown: an absolute UTC instant, so every client agrees
            # regardless of timezone or clock drift ---
            "timerEnabled": bool(b.timerEnabled),
            "timerEnd": _iso_utc(b.timerEnd),
            "serverNow": datetime.now(timezone.utc).isoformat(),
            "timerLabel": b.timerLabel or "",
            "expiredBehavior": b.expiredBehavior or "keep",
        })
    return out


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
        # Slideshow banners from the Banner collection. Empty list = fall back
        # to the legacy hero slides, so existing setups are untouched.
        "banners": live_banners(),
        "slideshowSettings": slideshow_settings(),
        # Store-wide GST, so cart/checkout can label and estimate at the same
        # rate the server charges. Configured in Admin -> Tax.
        # Brands already ship their own gstRate inside the brands list above,
        # so the storefront can resolve product -> brand -> global itself.
        # Live combo offers for the Crazy Deals collection.
        "combos": live_combos(),
        "taxSettings": {
            "gstRate": pricing.default_gst_rate(),
            "taxMode": pricing.default_tax_mode(),
            "gstEnabled": pricing.gst_enabled(),
        },
    }


def live_combos():
    """Active combos, priced against the live catalogue.

    The normal total is computed here rather than stored, so a combo's
    advertised saving can never drift out of step with the product prices it
    is built from. A combo whose products have gone missing is dropped rather
    than shown with a hole in it.
    """
    from .models import Combo

    combos = list(Combo.objects(isActive=True).order_by("displayOrder", "-createdAt"))
    if not combos:
        return []

    wanted = set()
    for combo in combos:
        for item in combo.items or []:
            wanted.add(int(item.catalogId))
    products = {
        int(p.catalogId): p
        for p in Product.objects(catalogId__in=list(wanted), status="active", hidden__ne=True)
    }

    out = []
    for combo in combos:
        items = []
        normal_total = 0
        complete = bool(combo.items)
        for item in combo.items or []:
            product = products.get(int(item.catalogId))
            if not product:
                complete = False
                break
            quantity = int(item.quantity or 1)
            price = pricing.round_money(pricing.effective_price(product))
            normal_total += price * quantity
            items.append({
                "id": int(product.catalogId),
                "name": product.name,
                "quantity": quantity,
                "price": price,
                "image": (list(product.images or []) or [""])[0],
            })
        combo_price = pricing.round_money(combo.comboPrice)
        # Only offer bundles that are actually cheaper than buying the parts.
        if not complete or not items or combo_price <= 0 or combo_price >= normal_total:
            continue
        out.append({
            "id": str(combo.id),
            "name": combo.name,
            "description": combo.description,
            "image": combo.image,
            "items": items,
            "comboPrice": combo_price,
            "normalTotal": normal_total,
            "saving": normal_total - combo_price,
        })
    return out


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
    # Merchandising collections reuse this endpoint (and its filters, sorting
    # and pagination) instead of each getting a near-identical route.
    collection = str(query.get("collection") or "").strip().lower()
    page = max(1, _to_int(query.get("page"), 1))
    limit = max(1, _to_int(query.get("limit"), 12))

    items = _active_products()
    all_brands = taxonomy.get_brands()
    all_categories = taxonomy.get_categories()

    COLLECTION_FLAGS = {
        "crazy-deals": "crazyDeal",
        "near-expiry": "nearExpiry",
        "new-arrivals": "newArrival",
    }

    def keep(product):
        if product["hidden"]:
            return False
        if collection:
            flag = COLLECTION_FLAGS.get(collection)
            if not flag or not product.get(flag):
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
