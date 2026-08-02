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
