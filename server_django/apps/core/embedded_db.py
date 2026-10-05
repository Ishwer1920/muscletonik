"""Zero-server local database for development.

Runs mongoengine on top of an in-process mongomock client and seeds it from
``mongodump_export.zip`` at the repo root. This exists for machines where a real
``mongod`` cannot start (e.g. Windows Smart App Control blocks the unsigned
binary) and no cloud MongoDB is configured — the whole DB lives inside the
signed Python process, so nothing external has to run.

Opt in by setting ``MONGODB_URI=embedded``. Any other value takes the normal
real-server path in ``db.connect_db()``, so production is unaffected.

Caveat: mongomock is IN-MEMORY, so data resets to the dump every time the server
restarts. Fine for a local preview; not a persistence layer.
"""
import os
import zipfile

import bcrypt
import bson
import mongoengine
import mongomock

from . import env

DB_NAME = "muscle_tonik"


def _repo_root():
    # this file: <repo>/server_django/apps/core/embedded_db.py
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, os.pardir, os.pardir, os.pardir))


def _dump_path():
    return os.path.join(_repo_root(), "mongodump_export.zip")


def connect_embedded():
    """Connect mongoengine to an in-memory mongomock DB, then seed it."""
    mongoengine.disconnect_all()
    mongoengine.connect(DB_NAME, mongo_client_class=mongomock.MongoClient)
    db = mongoengine.connection.get_db()
    loaded = _seed_from_dump(db)
    # Apply the customer-requested catalog rules on top of the restored data, so
    # they are present on every startup even though mongomock is in-memory.
    rated = _apply_distinct_ratings(db)
    packed = _apply_pack_pricing(db)
    # Hand-entered products + their brands. Seeded AFTER pack-pricing so the
    # 1/2/5 KG auto-packs are never bolted onto these flavour-variant products.
    custom_brands, custom_products = _seed_custom_catalog()
    _ensure_admin(db)
    collections = sorted(db.list_collection_names())
    print(
        "[embedded-db] mongomock ready; seeded {} docs across {} collections: {}".format(
            loaded, len(collections), ", ".join(collections) or "(none)"
        )
    )
    print("[embedded-db] applied distinct ratings to {} products; pack pricing to {} products".format(rated, packed))
    print("[embedded-db] custom catalog: added {} brand(s), wrote {} product(s)".format(custom_brands, custom_products))


def _seed_custom_catalog():
    """Add the hand-entered brands + products via mongoengine (same connection
    the app uses). Imported lazily so a failure here can't break DB startup."""
    try:
        from apps.catalog import custom_catalog
        return custom_catalog.seed()
    except Exception as exc:  # never let the extra products take down the server
        print("[embedded-db] custom catalog seed skipped: {}".format(exc))
        return 0, 0


def _seed_from_dump(db):
    """Load every ``<collection>.bson`` from the dump zip into mongomock.

    Returns the total number of documents inserted. A missing/unreadable dump
    just yields an empty database rather than failing startup.
    """
    path = _dump_path()
    if not os.path.exists(path):
        print("[embedded-db] no dump at {} — starting empty".format(path))
        return 0

    total = 0
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".bson"):
                continue
            collection = os.path.basename(name)[: -len(".bson")]
            try:
                docs = bson.decode_all(zf.read(name))
            except Exception as exc:  # a single bad collection shouldn't kill startup
                print("[embedded-db] skipped {}: {}".format(name, exc))
                continue
            if not docs:
                continue
            db[collection].drop()
            db[collection].insert_many(docs)
            total += len(docs)
    return total


# --- customer-requested catalog rules -------------------------------------
#
# These run against the mongomock DB right after the dump is restored. They are
# deterministic (keyed off catalogId) so a product keeps the same rating/packs
# on every restart. On a real Mongo (Atlas) these are set through the admin
# panel instead; this seed is only for the in-memory local DB.

def _rating_for(catalog_id):
    """A fixed, varied star rating in 4.1-5.0 (one decimal), different between
    neighbouring products. Deterministic so it never changes across restarts.
    7 is coprime with 10, so sequential ids cycle through all ten 4.1..5.0
    values rather than repeating a handful. (One-decimal ratings can only take
    ten values in this band, so they vary but cannot all be unique.)"""
    cid = int(catalog_id or 0)
    return round((41 + (cid * 7 + 3) % 10) / 10.0, 1)


def _reviews_for(catalog_id):
    """A fixed, varied review count above 300 (roughly 320-5000), different
    between neighbouring products. 37 is coprime with the modulus so the counts
    scatter widely instead of clustering."""
    cid = int(catalog_id or 0)
    return 320 + (cid * 37 + 11) % 4681


def _apply_distinct_ratings(db):
    """Give every product its own fixed rating + review count."""
    count = 0
    for p in db["products"].find({}, {"_id": 1, "catalogId": 1}):
        cid = p.get("catalogId") or 0
        db["products"].update_one(
            {"_id": p["_id"]},
            {"$set": {"rating": _rating_for(cid), "reviewCount": _reviews_for(cid)}},
        )
        count += 1
    return count


# Categories whose products are genuinely sold by the kilo, so KG packs make
# sense. Everything else (capsules, bars, drinks, accessories) stays single-price.
PACK_CATEGORIES = {"whey-protein", "mass-gainer", "plant-protein", "casein"}


def _apply_pack_pricing(db):
    """Add 1/2/5 KG pack options to powder products, priced from the product's
    own selling price with a bulk discount on the larger packs. Products that
    already carry packs are left untouched."""
    count = 0
    for p in db["products"].find(
        {"category": {"$in": list(PACK_CATEGORIES)}},
        {"_id": 1, "sellingPrice": 1, "weightOptions": 1},
    ):
        if p.get("weightOptions"):
            continue
        base = float(p.get("sellingPrice") or 0)
        if base <= 0:
            continue
        opts = [
            {"label": "1 KG", "price": round(base),       "mrp": round(base * 1.20), "stock": None, "sku": ""},
            {"label": "2 KG", "price": round(base * 1.90), "mrp": round(base * 2.30), "stock": None, "sku": ""},
            {"label": "5 KG", "price": round(base * 4.50), "mrp": round(base * 5.60), "stock": None, "sku": ""},
        ]
        db["products"].update_one({"_id": p["_id"]}, {"$set": {"weightOptions": opts}})
        count += 1
    return count


def _ensure_admin(db):
    """Force the configured admin account to a known password so login works.

    The dump may carry an admin row with an unknown hash; overwrite it with a
    bcrypt hash of ADMIN_PASSWORD from the environment so the operator can sign
    in with the documented credentials.
    """
    email = (env.ADMIN_EMAIL or "").strip().lower()
    if not email or not env.ADMIN_PASSWORD:
        return
    pw_hash = bcrypt.hashpw(env.ADMIN_PASSWORD.encode(), bcrypt.gensalt(rounds=12)).decode()
    db["users"].update_one(
        {"email": email},
        {"$set": {
            "name": env.ADMIN_NAME or "Admin",
            "email": email,
            "passwordHash": pw_hash,
            "role": "super_admin",
            "emailVerified": True,
        }},
        upsert=True,
    )
    print("[embedded-db] admin ready: {}".format(email))
