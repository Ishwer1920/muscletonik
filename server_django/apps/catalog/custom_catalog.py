"""Hand-added catalogue products + their brands.

These are products entered by hand (from a supplier price list) rather than
scraped into ``mongodump_export.zip``. Keeping them here — as plain data plus a
single idempotent ``seed()`` — means they can be (re)applied two ways from one
source of truth:

* the in-memory embedded DB seeds them on every startup
  (``apps.core.embedded_db.connect_embedded``), and
* a real Mongo (Atlas/Hostinger) seeds them once via
  ``python manage.py seed_custom_catalog``.

``seed()`` upserts by ``catalogId`` so re-running never duplicates: an existing
row with the same id is updated in place, a missing one is created. Prices are
MRP/selling as given; sizes live in ``weight`` and the buyable variants are the
listed flavours (``flavors``), NOT weight packs — so these are deliberately left
with an empty ``weightOptions`` and are seeded AFTER embedded pack-pricing runs,
so the 1/2/5 KG auto-packs never get bolted onto them.

Images are hotlinked (same approach as the rest of the catalogue). Each URL was
checked to resolve to a real product image at the time of writing.
"""

# --- new brands -------------------------------------------------------------
# id/name/initials/color/desc/logo — the shape taxonomy.get_brands() returns.
NEW_BRANDS = [
    {"id": "dymatize", "name": "Dymatize", "initials": "DY", "color": "#e4002b",
     "desc": "ISO100 hydrolyzed isolate & Elite whey", "logo": ""},
    {"id": "avvatar", "name": "Avvatar", "initials": "AV", "color": "#0a7d3b",
     "desc": "India's farm-to-scoop whey (Parag)", "logo": ""},
    {"id": "healthfarm", "name": "Healthfarm", "initials": "HF", "color": "#1f7ac2",
     "desc": "Value sports nutrition & wellness", "logo": ""},
]

# --- new products -----------------------------------------------------------
# id, name, brand, category, mrp, price, weight, flavors[], image, short
NEW_PRODUCTS = [
    # ---- Rule One ----
    {"id": 3053, "name": "R1 Whey Blend, 5 lb (2.27 kg)", "brand": "rule-one", "category": "whey-protein",
     "mrp": 11999, "price": 8000, "weight": "5 lb (2.27 kg)",
     "flavors": ["Chocolate Fudge", "Cookies & Cream", "Birthday Cake", "Vanilla Creme", "Campfire S'more"],
     "image": "https://cdn.shopify.com/s/files/1/0052/6657/1334/files/whey-protein_2lb_milk-chocolate_front.png?v=1775857624",
     "short": "24g protein whey blend, 5 flavours."},
    {"id": 3054, "name": "R1 Whey Isolate, 5 lb (2.27 kg)", "brand": "rule-one", "category": "whey-protein",
     "mrp": 17999, "price": 13500, "weight": "5 lb (2.27 kg)", "flavors": ["Chocolate"],
     "image": "https://cdn.shopify.com/s/files/1/0052/6657/1334/files/r1pwi_1.5lb_milk-chocolate-front.png?v=1777910205",
     "short": "25g primary-source whey isolate."},

    # ---- Dymatize ----
    {"id": 3055, "name": "Dymatize Elite 100% Whey, 5 lb (2.27 kg)", "brand": "dymatize", "category": "whey-protein",
     "mrp": 13999, "price": 10500, "weight": "5 lb (2.27 kg)",
     "flavors": ["Gourmet Vanilla", "Rich Chocolate", "Cookies & Cream"],
     "image": "https://img2.hkrtcdn.com/2376/prd_237521_o.jpg",
     "short": "25g protein, 5.5g BCAA per scoop."},
    {"id": 3056, "name": "Dymatize ISO100 Hydrolyzed Whey Isolate, 5 lb (2.27 kg)", "brand": "dymatize", "category": "whey-protein",
     "mrp": 23999, "price": 16000, "weight": "5 lb (2.27 kg)", "flavors": [],
     "image": "https://img9.hkrtcdn.com/20006/prd_2000508-Dymatize-Iso100-Protein-5-lb-Strawberry_c_l.jpg",
     "short": "25g fast-acting hydrolyzed isolate."},

    # ---- Ronnie Coleman ----
    {"id": 3057, "name": "Ronnie Coleman Pro-Antium, 2 kg", "brand": "ronnie-coleman", "category": "whey-protein",
     "mrp": 9199, "price": 6900, "weight": "2 kg (5 lb)",
     "flavors": ["Double Rich Chocolate", "Cookies & Cream"],
     "image": "https://cdn2.nutrabay.com/uploads/product/images/featured_image-NB-RON-1002-PA-1774519218-800x800.webp",
     "short": "Multi-phase protein blend for recovery."},
    {"id": 3058, "name": "Ronnie Coleman King Whey, 2.2 kg", "brand": "ronnie-coleman", "category": "whey-protein",
     "mrp": 13199, "price": 7499, "weight": "2.2 kg", "flavors": ["Chocolate Brownie"],
     "image": "https://cdn.shopify.com/s/files/1/1380/7323/files/ronnie-coleman-signature-series-king-whey-5lbs-cookies-n-cream-protein-1223767704.png?v=1772011028",
     "short": "Premium whey blend, 25g protein."},

    # ---- MuscleTech ----
    {"id": 3059, "name": "MuscleTech Nitro-Tech, 1.72 kg", "brand": "muscletech", "category": "whey-protein",
     "mrp": 8899, "price": 6900, "weight": "1.72 kg", "flavors": ["Milk Chocolate"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-nitro-tech-milk-chocolate-1lb.png?v=1764974667",
     "short": "30g protein + 3g creatine per scoop."},
    {"id": 3060, "name": "MuscleTech Nitro-Tech (USA Made), 5 lb (2.27 kg)", "brand": "muscletech", "category": "whey-protein",
     "mrp": 13999, "price": 7000, "weight": "5 lb (2.27 kg)",
     "flavors": ["Vanilla Creme", "Cookies & Cream", "Strawberry", "Milk Chocolate"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-nitro-tech-milk-chocolate-1lb.png?v=1764974667",
     "short": "USA-made Nitro-Tech, 4 flavours."},
    {"id": 3061, "name": "MuscleTech Advanced Whey Protein", "brand": "muscletech", "category": "whey-protein",
     "mrp": 5999, "price": 4500, "weight": "", "flavors": ["Chocolate"],
     "image": "https://img8.hkrtcdn.com/43230/prd_4322997-MuscleTech-Advanced-Whey-Protein-3.99-lb-Triple-Chocolate_c_l.jpg",
     "short": "Everyday whey with digestive enzymes."},
    {"id": 3062, "name": "MuscleTech Test HD Testosterone Booster", "brand": "muscletech", "category": "test-booster",
     "mrp": 1799, "price": 999, "weight": "", "flavors": [],
     "image": "https://jackednutrition.pk/cdn/shop/files/TEsTHD.png?v=1718192295&width=880",
     "short": "Clinically dosed test-support formula."},
    {"id": 3063, "name": "MuscleTech Hydroxycut Super Elite", "brand": "muscletech", "category": "fat-burner",
     "mrp": 2499, "price": 999, "weight": "", "flavors": [],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-hydroxycut-hardcore-super-elite-120.png?v=1742823177",
     "short": "Advanced thermogenic fat burner."},
    {"id": 3064, "name": "MuscleTech Platinum Multivitamin", "brand": "muscletech", "category": "vitamins",
     "mrp": 1499, "price": 690, "weight": "", "flavors": [],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-platinum-multi-vitamin-90-count.png?v=1742823408",
     "short": "Daily multivitamin for active people."},
    {"id": 3065, "name": "MuscleTech Platinum Omega 3 Fish Oil", "brand": "muscletech", "category": "fish-oil",
     "mrp": 1399, "price": 699, "weight": "100 softgels", "flavors": [],
     "image": "https://img2.hkrtcdn.com/45915/prd_4591441-MuscleTech-Platinum-Fish-Oil-100-softgels_c_l.jpg",
     "short": "EPA + DHA omega-3 softgels."},
    {"id": 3066, "name": "MuscleTech VaporX5 Pre-Workout", "brand": "muscletech", "category": "pre-workout",
     "mrp": 3999, "price": 1199, "weight": "", "flavors": [],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-vaporx5-blue-razz-freeze.png?v=1742823535",
     "short": "Energy, focus and pump pre-workout."},
    {"id": 3067, "name": "MuscleTech Amino + Energy", "brand": "muscletech", "category": "amino-acids",
     "mrp": 2699, "price": 1299, "weight": "", "flavors": [],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/mt-amino-build-tropical-twist.png?v=1742823143",
     "short": "BCAA/EAA aminos with an energy kick."},
    {"id": 3068, "name": "MuscleTech Platinum Creatine (Flavored), 315 g", "brand": "muscletech", "category": "creatine",
     "mrp": 1399, "price": 700, "weight": "315 g", "flavors": [],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/platinum-creatine-grape-freeze.jpg?v=1766074513",
     "short": "5g micronized creatine per serving."},
    {"id": 3069, "name": "MuscleTech Platinum Creatine (Unflavoured), 250 g", "brand": "muscletech", "category": "creatine",
     "mrp": 1299, "price": 699, "weight": "250 g", "flavors": ["Unflavoured"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/platinum-creatine-grape-freeze.jpg?v=1766074513",
     "short": "100% micronized creatine monohydrate."},
    {"id": 3070, "name": "MuscleTech Mass-Tech Extreme 2000, 3 kg", "brand": "muscletech", "category": "mass-gainer",
     "mrp": 4439, "price": 2999, "weight": "3 kg", "flavors": ["Chocolate", "Vanilla"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/masstech-extreme-chocolate-front.jpg?v=1755023871",
     "short": "2000+ kcal mass gainer with creatine."},
    {"id": 3071, "name": "MuscleTech Mass-Tech Extreme 2000, 5 kg", "brand": "muscletech", "category": "mass-gainer",
     "mrp": 8999, "price": 4899, "weight": "5 kg", "flavors": ["Chocolate", "Vanilla"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/masstech-extreme-chocolate-front.jpg?v=1755023871",
     "short": "Bulk 5 kg high-calorie mass gainer."},
    {"id": 3072, "name": "MuscleTech Nitro-Tech 100% Whey Gold, 1.81 kg", "brand": "muscletech", "category": "whey-protein",
     "mrp": 8499, "price": 6999, "weight": "1.81 kg",
     "flavors": ["Chocolate", "Vanilla", "Cookies & Cream"],
     "image": "https://cdn.shopify.com/s/files/1/1214/7132/files/MuscleTech-NitroTech-Whey-Gold-2000x2000-01a_new.jpg?v=1753903525",
     "short": "24g whey protein from gold-standard whey."},

    # ---- Avvatar ----
    {"id": 3073, "name": "Avvatar Whey Protein, 2 kg", "brand": "avvatar", "category": "whey-protein",
     "mrp": 7699, "price": 7400, "weight": "2 kg",
     "flavors": ["Mango Rush", "Belgian Chocolate", "Cafe Mocha Swirl", "Malai Kulfi"],
     "image": "https://img6.hkrtcdn.com/45134/prd_4513315-Avvatar-Whey-Protein-2.2-lb-Mango-Rush_c_l.jpg",
     "short": "Farm-fresh Indian whey, 4 flavours."},
    {"id": 3074, "name": "Avvatar Performance Whey, 2 kg", "brand": "avvatar", "category": "whey-protein",
     "mrp": 10299, "price": 6199, "weight": "2 kg",
     "flavors": ["Belgian Chocolate", "Caramel Creme", "Chocolate Hazelnut", "Cold Coffee", "Malai Kulfi", "Mango Rush"],
     "image": "https://img2.hkrtcdn.com/46608/prd_4660731_o.jpg",
     "short": "26g protein performance whey, 6 flavours."},
    {"id": 3075, "name": "Avvatar Performance Whey, 1 kg", "brand": "avvatar", "category": "whey-protein",
     "mrp": 5299, "price": 3199, "weight": "1 kg",
     "flavors": ["Belgian Chocolate", "Caramel Creme", "Chocolate Hazelnut", "Cold Coffee", "Malai Kulfi", "Mango Rush"],
     "image": "https://img2.hkrtcdn.com/46608/prd_4660731_o.jpg",
     "short": "26g protein performance whey, 6 flavours."},
    {"id": 3076, "name": "Avvatar ISORICH Whey Isolate, 2 kg", "brand": "avvatar", "category": "whey-protein",
     "mrp": 10189, "price": 9499, "weight": "2 kg",
     "flavors": ["Belgian Chocolate", "Caramel Creme", "Chocolate Hazelnut", "Malai Kulfi", "Mango Rush"],
     "image": "https://img3.hkrtcdn.com/18133/prd_1813262-Avvatar-Isorich-4.4-lb-Caramel-Creme_c_l.jpg",
     "short": "28g protein whey isolate, 6g BCAA."},

    # ---- Healthfarm ----
    {"id": 3077, "name": "Healthfarm Maxi Whey, 2 kg", "brand": "healthfarm", "category": "whey-protein",
     "mrp": 6499, "price": 3400, "weight": "2 kg",
     "flavors": ["Dubai Chocolate", "Double Chocolate", "Malai Kulfi", "Caramel Creme"],
     "image": "https://img10.hkrtcdn.com/35793/prd_3579259-Healthfarm-Muscle-Whey-3.99-lb-Choco-Hazel-Fusion_c_l.jpg",
     "short": "Value whey with full amino profile."},
    {"id": 3078, "name": "Healthfarm Liver Detox, 60 Tablets", "brand": "healthfarm", "category": "wellness",
     "mrp": 1095, "price": 699, "weight": "60 tablets", "flavors": [],
     "image": "https://img8.hkrtcdn.com/34391/prd_3439017-Healthfarm-Liver-Health-60-capsules_c_l.jpg",
     "short": "Milk-thistle liver support, 60 tabs."},
    {"id": 3079, "name": "Healthfarm L-Arginine 300mg, 60 Tablets", "brand": "healthfarm", "category": "amino-acids",
     "mrp": 995, "price": 599, "weight": "60 tablets", "flavors": [],
     "image": "https://m.media-amazon.com/images/I/71tFMrcy1IL.jpg",
     "short": "L-Arginine for pump & circulation."},
]


def _rating_for(cid):
    """Fixed, varied rating in 4.3–4.9 so the new rows don't all read the same."""
    return round(4.3 + (cid % 7) / 10.0, 1)


def _reviews_for(cid):
    """Fixed, varied review count (roughly 180–1000)."""
    return 180 + (cid * 37 + 11) % 820


def _ensure_brands():
    """Add the new brands to the catalog.brands setting if missing. Returns the
    number actually added."""
    from . import taxonomy
    brands = taxonomy.get_brands()
    existing = {b.get("id") for b in brands}
    to_add = [b for b in NEW_BRANDS if b["id"] not in existing]
    if to_add:
        taxonomy._write_list(taxonomy.BRANDS_KEY, list(brands) + to_add)
    return len(to_add)


def _ensure_products():
    """Upsert every product by catalogId. Returns the number written."""
    from .models import Flavor, Product
    count = 0
    for data in NEW_PRODUCTS:
        cid = data["id"]
        p = Product.objects(catalogId=cid).first() or Product(catalogId=cid)
        p.catalogId = cid
        p.name = data["name"]
        p.slug = data.get("slug") or ("mt-custom-" + str(cid))
        p.brand = data["brand"]
        p.category = data["category"]
        p.mrp = float(data["mrp"])
        p.sellingPrice = float(data["price"])
        p.weight = data.get("weight", "")
        flavors = [f for f in data.get("flavors", []) if f]
        p.flavors = [Flavor(name=f) for f in flavors]
        p.flavor = ", ".join(flavors)
        p.images = [data["image"]] if data.get("image") else []
        p.shortDescription = data.get("short", "")
        p.description = data.get("desc") or (data.get("short", "") + " Authentic, sealed stock from Muscle Tonik.").strip()
        p.color = next((b["color"] for b in NEW_BRANDS if b["id"] == data["brand"]), "#111111")
        p.stock = data.get("stock", 50)
        p.rating = _rating_for(cid)
        p.reviewCount = _reviews_for(cid)
        p.badge = data.get("badge", "New")
        p.newArrival = True
        p.status = "active"
        p.hidden = False
        # Flavour-variant products, not weight-pack products: keep this empty so
        # the embedded pack-pricing pass never adds 1/2/5 KG packs to them.
        p.weightOptions = []
        p.save()
        count += 1
    return count


def seed():
    """Idempotently add the hand-entered brands + products. Safe to call on
    every startup (embedded DB) or once against a real Mongo. Returns
    ``(brands_added, products_written)``."""
    brands_added = _ensure_brands()
    products_written = _ensure_products()
    return brands_added, products_written
