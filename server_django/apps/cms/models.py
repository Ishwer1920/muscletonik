from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/site-setting.model.js and
# cms-content.model.js. Only models live here in Phase 3 — the admin write
# endpoints (settings CRUD, homepage builder/versioning) are Phase 6.


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class SiteSetting(me.Document):
    key = me.StringField(required=True, unique=True)
    value = me.DynamicField(default=dict)
    category = me.StringField(default="general")
    updatedBy = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {"collection": "sitesettings", "indexes": ["key", "category"], "strict": False}

    save = _timestamped_save


class Banner(me.Document):
    """One homepage slideshow banner.

    A real collection rather than another blob inside the homepage CMS
    document, because these need per-record ordering, an active flag and a
    schedule window — all awkward to express in a nested array. The legacy
    hero slides still work: the storefront falls back to them when no banner
    is live, so nothing breaks before the first banner is created.
    """

    title = me.StringField(default="")
    subtitle = me.StringField(default="")
    image = me.StringField(default="")          # desktop artwork (URL or /uploads/...)
    imageMobile = me.StringField(default="")    # optional narrow crop
    alt = me.StringField(default="")
    ctaText = me.StringField(default="")
    ctaUrl = me.StringField(default="")
    displayOrder = me.IntField(default=0)
    isActive = me.BooleanField(default=True)
    # Optional schedule. Null on either side means "no bound that way".
    startDate = me.DateTimeField(null=True, default=None)
    endDate = me.DateTimeField(null=True, default=None)

    # ---- builder fields -----------------------------------------------
    # Which design renders this record. "slide" is the original artwork-only
    # hero banner; the other two are the composed layouts. Defaulting to
    # "slide" keeps every existing banner rendering exactly as before.
    layout = me.StringField(choices=["slide", "promo", "festive"], default="slide")
    name = me.StringField(default="")            # admin-facing label only

    backgroundColor = me.StringField(default="")  # CSS colour or gradient
    overlay = me.IntField(default=0, min_value=0, max_value=100)  # % dark scrim

    heading = me.StringField(default="")
    subheading = me.StringField(default="")
    paragraph = me.StringField(default="")
    offerText = me.StringField(default="")
    note = me.StringField(default="")

    mainImage = me.StringField(default="")
    productImage = me.StringField(default="")
    logo = me.StringField(default="")
    logoSize = me.IntField(default=120, min_value=24, max_value=480)

    # Optional link to a real catalogue product, by its public catalogId. The
    # banner stores only the id — name, price and photo are read live from the
    # product so they can never drift out of date.
    productId = me.IntField(null=True, default=None)

    # CTA: an action type plus a target, resolved to a URL server-side.
    buttonActionType = me.StringField(
        choices=["none", "product", "category", "brand", "collection", "marketplace", "page", "url"],
        default="none")
    buttonTarget = me.StringField(default="")
    # Secondary CTA (the festive layout ships two buttons).
    button2Text = me.StringField(default="")
    button2ActionType = me.StringField(
        choices=["none", "product", "category", "brand", "collection", "marketplace", "page", "url"],
        default="none")
    button2Target = me.StringField(default="")

    timerEnabled = me.BooleanField(default=False)
    timerStart = me.DateTimeField(null=True, default=None)
    timerEnd = me.DateTimeField(null=True, default=None)
    timerLabel = me.StringField(default="")
    # What happens once timerEnd passes.
    expiredBehavior = me.StringField(choices=["hide", "expired", "keep"], default="keep")

    createdBy = me.StringField(default="")
    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "banners",
        "indexes": ["isActive", "displayOrder"],
        "ordering": ["displayOrder"],
        "strict": False,
    }

    save = _timestamped_save

    def is_live(self, now=None):
        """Active and inside its schedule window."""
        if not self.isActive:
            return False
        now = now or datetime.now(timezone.utc)
        start = self.startDate
        end = self.endDate
        if start and (start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start) > now:
            return False
        if end and (end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end) < now:
            return False
        # A finished countdown only removes the banner when the admin asked for
        # that; "expired" and "keep" both stay on the page.
        if self.timerEnabled and self.expiredBehavior == "hide" and self.timerEnd:
            t_end = self.timerEnd
            if t_end.tzinfo is None:
                t_end = t_end.replace(tzinfo=timezone.utc)
            if t_end < now:
                return False
        return True


class CmsSection(me.EmbeddedDocument):
    id = me.StringField(required=True)
    type = me.StringField(required=True)
    title = me.StringField(default="")
    enabled = me.BooleanField(default=True)
    data = me.DynamicField(default=dict)


class DraftVersion(me.Document):
    contentSlug = me.StringField(required=True)
    kind = me.StringField(default="homepage")
    note = me.StringField(default="")
    snapshot = me.DynamicField(required=True)
    createdBy = me.StringField(default="")
    published = me.BooleanField(default=False)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "draftversions",
        "indexes": [{"fields": ["contentSlug", "-createdAt"]}],
        "strict": False,
    }

    save = _timestamped_save


class CmsContent(me.Document):
    slug = me.StringField(required=True, unique=True)
    name = me.StringField(default="Homepage CMS")
    version = me.IntField(default=1)
    sections = me.EmbeddedDocumentListField(CmsSection, default=list)
    order = me.ListField(me.StringField(), default=list)
    announcement = me.DynamicField(default=dict)
    hero = me.DynamicField(default=dict)
    brandStrip = me.DynamicField(default=list)
    footer = me.DynamicField(default=dict)
    updatedBy = me.StringField(default="")
    publishedAt = me.DateTimeField(default=None)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {"collection": "cmscontents", "indexes": ["slug"], "strict": False}

    save = _timestamped_save
