"""Banner CTA routing.

A banner stores an action *type* plus a *target* (a product id, a brand id, a
URL...). This module is the one place that turns that pair into a link the
storefront can follow, so a destination is never hardcoded in the frontend and
an admin can repoint a button without a deploy.

Resolution happens server-side deliberately: the target is validated against
the real catalogue here, so a deleted product or a `javascript:` URL can never
reach the page.
"""

import re

# Pages an admin may link to. An allowlist rather than free text, so a typo
# cannot produce a dead link and a hostile value cannot escape the site.
KNOWN_PAGES = {
    "home": "index.html",
    "marketplace": "marketplace.html",
    "offers": "offers.html",
    "brands": "brands.html",
    "categories": "category.html",
    "cart": "cart.html",
    "wishlist": "wishlist.html",
    "dashboard": "dashboard.html",
    "my-plans": "my-plans.html",
    "bmi": "index.html#bmi",
}

# The merchandising collections the marketplace understands.
KNOWN_COLLECTIONS = {"crazy-deals", "new-arrivals", "near-expiry"}

_SAFE_URL = re.compile(r"^(https?://|/)", re.IGNORECASE)


def resolve(action_type, target):
    """Return the href for one CTA, or "" when it cannot be resolved.

    An empty string means "render no button" — better than a link that 404s.
    """
    action = (action_type or "none").strip().lower()
    value = str(target or "").strip()

    if action in ("none", ""):
        return ""

    if action == "marketplace":
        return "marketplace.html"

    if action == "product":
        # Validated against the catalogue: a banner pointing at a deleted or
        # archived product renders no button rather than a broken link.
        from apps.catalog.models import Product
        try:
            catalog_id = int(value)
        except (TypeError, ValueError):
            return ""
        exists = Product.objects(catalogId=catalog_id, status="active").only("catalogId").first()
        return "product.html?id={0}".format(catalog_id) if exists else ""

    if action == "category":
        from apps.catalog import taxonomy
        ids = {str(c.get("id")) for c in (taxonomy.get_categories() or []) if isinstance(c, dict)}
        return "marketplace.html?category={0}".format(value) if value in ids else ""

    if action == "brand":
        from apps.catalog import taxonomy
        ids = {str(b.get("id")) for b in (taxonomy.get_brands() or []) if isinstance(b, dict)}
        return "marketplace.html?brand={0}".format(value) if value in ids else ""

    if action == "collection":
        return "marketplace.html?collection={0}".format(value) if value in KNOWN_COLLECTIONS else ""

    if action == "page":
        return KNOWN_PAGES.get(value, "")

    if action == "url":
        # Relative paths and http(s) only — no javascript:, data:, etc.
        return value if _SAFE_URL.match(value) else ""

    return ""


def options():
    """Everything the admin CTA picker needs, so it never hardcodes a list."""
    from apps.catalog import taxonomy
    return {
        "actionTypes": [
            {"id": "none", "label": "No button"},
            {"id": "product", "label": "Product"},
            {"id": "category", "label": "Category"},
            {"id": "brand", "label": "Brand"},
            {"id": "collection", "label": "Collection"},
            {"id": "marketplace", "label": "Marketplace (all products)"},
            {"id": "page", "label": "Website page"},
            {"id": "url", "label": "Custom URL"},
        ],
        "categories": [
            {"id": c.get("id"), "label": c.get("name")}
            for c in (taxonomy.get_categories() or []) if isinstance(c, dict)
        ],
        "brands": [
            {"id": b.get("id"), "label": b.get("name")}
            for b in (taxonomy.get_brands() or []) if isinstance(b, dict)
        ],
        "collections": [
            {"id": "crazy-deals", "label": "Crazy Deals"},
            {"id": "new-arrivals", "label": "New Arrivals"},
            {"id": "near-expiry", "label": "Near Expiry"},
        ],
        "pages": [{"id": k, "label": v} for k, v in KNOWN_PAGES.items()],
    }


def product_snapshot(catalog_id):
    """Live product details for a banner that features one.

    Read fresh on every request rather than copied onto the banner, so a price
    or photo change in the catalogue shows up on the banner immediately.
    """
    if catalog_id is None:
        return None
    from apps.catalog.models import Product
    from apps.checkout import pricing
    p = Product.objects(catalogId=int(catalog_id), status="active").first()
    if not p:
        return None
    return {
        "id": p.catalogId,
        "name": p.name,
        "brand": p.brand,
        "price": pricing.effective_price(p),
        "oldPrice": p.sellingPrice if pricing.effective_price(p) < (p.sellingPrice or 0) else p.mrp,
        "image": (list(p.images or []) or [""])[0],
        "href": "product.html?id={0}".format(p.catalogId),
    }
