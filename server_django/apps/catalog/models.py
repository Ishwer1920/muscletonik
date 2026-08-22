from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/product.model.js and review.model.js.


class Flavor(me.EmbeddedDocument):
    name = me.StringField()
    image = me.StringField()


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
    mrp = me.FloatField(default=0, min_value=0)
    sellingPrice = me.FloatField(default=0, min_value=0)
    discountPercent = me.FloatField(default=0, min_value=0, max_value=100)
    stock = me.IntField(default=0, min_value=0)
    # Per-product GST override, as a percent (18 means 18%). None/unset means
    # "use the store default" from Admin -> Tax (SiteSetting key "taxes").
    gstRate = me.FloatField(min_value=0, max_value=100, null=True, default=None)
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


class Review(me.Document):
    productId = me.IntField(required=True)
    productName = me.StringField(required=True)
    customerName = me.StringField(required=True)
    customerEmail = me.StringField(default="")
    rating = me.FloatField(required=True, min_value=1, max_value=5)
    text = me.StringField(required=True)
    imageUrl = me.StringField(default="")
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
        ],
        "strict": False,
    }

    save = _timestamped_save
