import re

from django.core.management.base import BaseCommand

from apps.catalog import fixtures
from apps.catalog.models import Product


def slugify(value):
    value = str(value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def doc_from_catalog(product):
    return dict(
        catalogId=product["id"],
        name=product["name"],
        slug=slugify(product["name"]),
        sku=f"MT-{product['id']}",
        barcode=f"890000{str(product['id']).zfill(4)}",
        category=product["category"],
        brand=product["brand"],
        description=product.get("desc", ""),
        shortDescription=product.get("short", ""),
        badge=product.get("badge", ""),
        color=product.get("color", "#111111"),
        protein=product.get("protein", ""),
        calories=product.get("calories", 0),
        servings=product.get("servings", 0),
        deal=bool(product.get("deal")),
        ingredients=product.get("ingredients", ""),
        nutritionFacts=f"Protein: {product.get('protein') or '0g'} | Calories: {product.get('calories') or 0}",
        usageInstructions="Use as directed on the label.",
        warnings="Read the product label before use.",
        images=[],
        galleryImages=[],
        mrp=product["oldPrice"],
        sellingPrice=product["price"],
        discountPercent=fixtures.discount_pct(product["price"], product["oldPrice"]),
        rating=product.get("rating", 0),
        reviewCount=product.get("reviews", 0),
        featured=bool(product.get("featured")),
        trending=bool(product.get("deal")),
        bestSeller=product.get("badge") == "Bestseller",
        newArrival=product.get("badge") == "New",
        weight=f"{product['servings']} servings" if product.get("servings") else "",
        flavor=product.get("flavor", ""),
        tags=[v for v in [product.get("brand"), product.get("category"), product.get("badge")] if v],
        seoTitle=product["name"],
        seoDescription=product.get("short") or product.get("desc") or product["name"],
        seoKeywords=[v for v in [product.get("brand"), product.get("category"), product.get("flavor")] if v],
        status="active",
        stock=max(8, 28 - (product["id"] % 9)),
    )


def seed_products_if_empty():
    count = Product.objects.count()
    if count > 0:
        return {"seeded": False, "count": count}
    docs = [Product(**doc_from_catalog(p)) for p in fixtures.PRODUCTS]
    Product.objects.insert(docs, load_bulk=False)
    return {"seeded": True, "count": len(docs)}


def backfill_product_display_fields():
    legacy = Product.objects(catalogId=None)
    migrated = 0
    for doc in legacy:
        match = re.match(r"^MT-(\d+)$", doc.sku or "")
        catalog_id = int(match.group(1)) if match else None
        if catalog_id is None:
            continue
        src = next((p for p in fixtures.PRODUCTS if p["id"] == catalog_id), None)
        doc.catalogId = catalog_id
        if src:
            if not doc.shortDescription:
                doc.shortDescription = src.get("short", "")
            if not doc.badge:
                doc.badge = src.get("badge", "")
            if not doc.color or doc.color == "#111111":
                doc.color = src.get("color", "#111111")
            if not doc.protein:
                doc.protein = src.get("protein", "")
            if not doc.calories:
                doc.calories = src.get("calories", 0)
            if not doc.servings:
                doc.servings = src.get("servings", 0)
            if doc.deal is None:
                doc.deal = bool(src.get("deal"))
        doc.save()
        migrated += 1
    return {"migrated": migrated}


class Command(BaseCommand):
    """Port of server/src/services/seed.service.js#initProductCatalog."""

    help = "Seed the product catalog if empty, and backfill legacy rows."

    def handle(self, *args, **options):
        seed = seed_products_if_empty()
        backfill = backfill_product_display_fields()
        if seed["seeded"]:
            self.stdout.write(f"Seeded {seed['count']} products")
        else:
            self.stdout.write(f"Products present ({seed['count']}); migrated {backfill['migrated']} legacy row(s)")
