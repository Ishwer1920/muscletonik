import re

from apps.cms.models import SiteSetting
from apps.core.exceptions import ApiError

from . import fixtures
from .models import Product

# Direct port of server/src/services/taxonomy.service.js. Brands/categories
# live in SiteSetting (key/value store), falling back to the seed defaults
# until an admin edits them via the Phase 6 admin panel.

BRANDS_KEY = "catalog.brands"
CATEGORIES_KEY = "catalog.categories"

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def slugify(value):
    value = str(value or "").lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def initials_from(name):
    words = [w for w in str(name or "").strip().split() if w]
    if not words:
        return "??"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[1][0]).upper()


def _read_list(key, fallback):
    doc = SiteSetting.objects(key=key).first()
    if doc and isinstance(doc.value, list) and len(doc.value):
        return doc.value
    return fallback


def _write_list(key, items, email=""):
    SiteSetting.objects(key=key).modify(
        upsert=True,
        new=True,
        set__key=key,
        set__category="catalog",
        set__value=items,
        set__updatedBy=email,
    )
    return items


def get_brands():
    return _read_list(BRANDS_KEY, fixtures.BRANDS)


def get_categories():
    return _read_list(CATEGORIES_KEY, fixtures.CATEGORIES)


def get_taxonomy():
    return {"brands": get_brands(), "categories": get_categories()}


def add_brand(name=None, color=None, desc=None, email=""):
    clean = str(name or "").strip()
    if not clean:
        raise ApiError("Brand name is required.", 400)
    brand_id = slugify(clean)
    if not brand_id:
        raise ApiError("Brand name must contain letters or numbers.", 400)
    brands = get_brands()
    if any(b["id"] == brand_id for b in brands):
        raise ApiError("A brand with that name already exists.", 409)
    brand = {
        "id": brand_id,
        "name": clean,
        "initials": initials_from(clean),
        "color": color if color and HEX_COLOR_RE.match(color) else "#111111",
        "desc": str(desc or "").strip(),
        "logo": "",
    }
    _write_list(BRANDS_KEY, brands + [brand], email)
    return brand


def update_brand(brand_id, patch=None, email=""):
    patch = patch or {}
    brands = get_brands()
    index = next((i for i, b in enumerate(brands) if b["id"] == brand_id), -1)
    if index == -1:
        raise ApiError("Brand not found.", 404)
    next_brand = dict(brands[index])
    name = patch.get("name")
    if isinstance(name, str) and name.strip():
        next_brand["name"] = name.strip()
        next_brand["initials"] = initials_from(next_brand["name"])
    color = patch.get("color")
    if isinstance(color, str) and HEX_COLOR_RE.match(color):
        next_brand["color"] = color
    if isinstance(patch.get("desc"), str):
        next_brand["desc"] = patch["desc"].strip()
    if isinstance(patch.get("logo"), str):
        next_brand["logo"] = patch["logo"].strip()
    # Brand-level GST override (percent). "" / null clears it so the brand's
    # products fall through to the store default. See pricing.product_gst_rate.
    if "gstRate" in patch:
        raw = patch.get("gstRate")
        if raw is None or str(raw).strip() == "":
            next_brand.pop("gstRate", None)
        else:
            try:
                percent = float(raw)
            except (TypeError, ValueError):
                raise ApiError("GST rate must be a number.", 400)
            if percent < 0 or percent > 100:
                raise ApiError("GST rate must be between 0 and 100.", 400)
            next_brand["gstRate"] = percent
    updated = list(brands)
    updated[index] = next_brand
    _write_list(BRANDS_KEY, updated, email)
    return next_brand


def remove_brand(brand_id, email=""):
    brands = get_brands()
    brand = next((b for b in brands if b["id"] == brand_id), None)
    if not brand:
        raise ApiError("Brand not found.", 404)
    in_use = Product.objects(brand=brand_id).count()
    if in_use > 0:
        raise ApiError(
            f'Cannot delete "{brand["name"]}" - {in_use} product(s) still use it. Move or delete those products first.',
            409,
        )
    _write_list(BRANDS_KEY, [b for b in brands if b["id"] != brand_id], email)
    return brand


def add_category(name=None, icon=None, email=""):
    clean = str(name or "").strip()
    if not clean:
        raise ApiError("Category name is required.", 400)
    category_id = slugify(clean)
    if not category_id:
        raise ApiError("Category name must contain letters or numbers.", 400)
    categories = get_categories()
    if any(c["id"] == category_id for c in categories):
        raise ApiError("A category with that name already exists.", 409)
    category = {"id": category_id, "name": clean, "icon": (str(icon or "flask").strip() or "flask")}
    _write_list(CATEGORIES_KEY, categories + [category], email)
    return category


def remove_category(category_id, email=""):
    categories = get_categories()
    category = next((c for c in categories if c["id"] == category_id), None)
    if not category:
        raise ApiError("Category not found.", 404)
    in_use = Product.objects(category=category_id).count()
    if in_use > 0:
        raise ApiError(
            f'Cannot delete "{category["name"]}" - {in_use} product(s) still use it. Move or delete those products first.',
            409,
        )
    _write_list(CATEGORIES_KEY, [c for c in categories if c["id"] != category_id], email)
    return category
