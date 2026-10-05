from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/product.model.js and review.model.js.


class Flavor(me.EmbeddedDocument):
    name = me.StringField()
    image = me.StringField()


class WeightOption(me.EmbeddedDocument):
    """One pack/weight a product can be bought in, with its own price.

    Lets a single product carry several sizes (1 KG, 2 KG, 5 KG, ...) that each
    sell for a different amount. The storefront shows these as a selector and
    the price follows the chosen pack; checkout re-reads the price from here so
    the client can never pick its own figure. A product with no options behaves
    exactly as before, priced off sellingPrice.
    """
    label = me.StringField(required=True)          # what the shopper sees, e.g. "2 KG"
    price = me.FloatField(required=True, min_value=0)  # selling price for this pack
    mrp = me.FloatField(default=0, min_value=0)        # optional struck-through price
    # Optional per-pack stock. None means the pack rides on the product's own
    # stock instead of being tracked separately.
    stock = me.IntField(null=True, default=None, min_value=0)
    sku = me.StringField(default="")


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class Product(me.Document):
    catalogId = me.IntField(sparse=True, unique=True)
    name = me.StringField(required=True)
    slug = me.StringField(required=True, unique=True)
    sku = me.StringField()
    barcode = me.StringField()
    category = me.StringField(required=True)
    brand = me.StringField(required=True)
    description = me.StringField(default="")
    shortDescription = me.StringField(default="")
    badge = me.StringField(default="")
    color = me.StringField(default="#111111")
    protein = me.StringField(default="")
    calories = me.IntField(default=0)
    servings = me.IntField(default=0)
    deal = me.BooleanField(default=False)
    ingredients = me.StringField(default="")
    nutritionFacts = me.StringField(default="")
    usageInstructions = me.StringField(default="")
    warnings = me.StringField(default="")
    images = me.ListField(me.StringField(), default=list)
    galleryImages = me.ListField(me.StringField(), default=list)
    flavors = me.EmbeddedDocumentListField(Flavor, default=list)
    # Per-pack/weight pricing. Empty = single-price product (uses sellingPrice).
    weightOptions = me.EmbeddedDocumentListField(WeightOption, default=list)
    mrp = me.FloatField(default=0, min_value=0)
    sellingPrice = me.FloatField(default=0, min_value=0)
    discountPercent = me.FloatField(default=0, min_value=0, max_value=100)
    stock = me.IntField(default=0, min_value=0)
    # Per-product GST override, as a percent (18 means 18%). None/unset means
    # "use the store default" from Admin -> Tax (SiteSetting key "taxes").
    gstRate = me.FloatField(min_value=0, max_value=100, null=True, default=None)
    # Whether this product's price already contains its GST. "" means inherit
    # the brand's setting, then the store default (Admin -> Tax & GST).
    taxMode = me.StringField(choices=["", "inclusive", "exclusive"], default="")
    digital = me.BooleanField(default=False)
    hidden = me.BooleanField(default=False)
    planType = me.StringField(default="")
    rating = me.FloatField(default=0, min_value=0, max_value=5)
    reviewCount = me.IntField(default=0, min_value=0)
    featured = me.BooleanField(default=False)
    trending = me.BooleanField(default=False)
    bestSeller = me.BooleanField(default=False)
    newArrival = me.BooleanField(default=False)
    # Merchandising flags. Existing products default to False / unset, so the
    # catalogue keeps working untouched until an admin opts a product in.
    crazyDeal = me.BooleanField(default=False)
    # Deal price for a Crazy Deal. 0/unset = just use sellingPrice.
    crazyDealPrice = me.FloatField(default=0, min_value=0)
    # Batch expiry. Near-expiry status is derived from this against the
    # store-wide threshold, unless nearExpiry is ticked manually.
    expiryDate = me.DateTimeField(null=True, default=None)
    nearExpiry = me.BooleanField(default=False)
    arrivalDate = me.DateTimeField(null=True, default=None)
    weight = me.StringField(default="")
    flavor = me.StringField(default="")
    tags = me.ListField(me.StringField(), default=list)
    seoTitle = me.StringField(default="")
    seoDescription = me.StringField(default="")
    seoKeywords = me.ListField(me.StringField(), default=list)
    status = me.StringField(choices=["active", "archived"], default="active")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "products",
        "indexes": [
            "category", "brand", "slug", "sku", "barcode",
            {"fields": ["$name", "$description", "$tags"], "default_language": "english"},
        ],
        "strict": False,  # Mongoose writes a __v version key we don't model
    }

    save = _timestamped_save


class ComboItem(me.EmbeddedDocument):
    """One product inside a combo, by its public catalogId."""
    catalogId = me.IntField(required=True)
    quantity = me.IntField(default=1, min_value=1)


class Combo(me.Document):
    """A fixed-price bundle shown under Crazy Deals.

    The price is a flat figure for the whole set, NOT a per-product discount:
    buying the same products one at a time from the catalogue costs the normal
    total. The bundle price only applies while the cart still holds exactly the
    products it lists, which is what makes removing one of them fall back to
    regular pricing (see pricing.apply_combo_pricing).
    """

    name = me.StringField(required=True)
    description = me.StringField(default="")
    image = me.StringField(default="")
    items = me.EmbeddedDocumentListField(ComboItem, default=list)
    # What the whole bundle sells for. Compared against the sum of the normal
    # prices at quote time; a combo that saves nothing is simply not applied.
    comboPrice = me.FloatField(default=0, min_value=0)
    isActive = me.BooleanField(default=True)
    displayOrder = me.IntField(default=0)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "combos",
        "indexes": ["isActive", "displayOrder"],
        "strict": False,
    }

    save = _timestamped_save


class Review(me.Document):
    productId = me.IntField(required=True)
    productName = me.StringField(required=True)
    customerName = me.StringField(required=True)
    customerEmail = me.StringField(default="")
    rating = me.FloatField(required=True, min_value=1, max_value=5)
    # A star rating on its own is a valid review: the written part is optional
    # for shoppers, so this can no longer be required.
    text = me.StringField(default="")
    imageUrl = me.StringField(default="")
    # Who left it. Set for reviews submitted from the storefront; blank for
    # the ones an admin types in by hand.
    user = me.StringField(default="")
    # True when this customer has actually bought the product, which is what
    # the "Verified purchase" badge on the storefront reads.
    verifiedPurchase = me.BooleanField(default=False)
    status = me.StringField(choices=["pending", "approved", "rejected", "spam"], default="pending")
    featured = me.BooleanField(default=False)
    reply = me.StringField(default="")
    tags = me.ListField(me.StringField(), default=list)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "reviews",
        "indexes": [
            "productId",
            {"fields": ["status", "featured", "-createdAt"]},
            # One review per customer per product - enforced in reviews.py,
            # which updates the existing row instead of inserting a second.
            {"fields": ["productId", "user"]},
        ],
        "strict": False,
    }

    save = _timestamped_save
