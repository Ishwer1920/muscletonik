from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/user-plan.model.js.


def _timestamped_save(self, *args, **kwargs):
    now = datetime.now(timezone.utc)
    if not self.createdAt:
        self.createdAt = now
    self.updatedAt = now
    return me.Document.save(self, *args, **kwargs)


class PlanSnapshot(me.EmbeddedDocument):
    height = me.FloatField(default=0)
    weight = me.FloatField(default=0)
    bmi = me.FloatField(default=0)
    bandId = me.StringField(default="")
    bandLabel = me.StringField(default="")
    goal = me.StringField(default="auto")
    rangeLow = me.FloatField(default=0)
    rangeHigh = me.FloatField(default=0)


class UserPlan(me.Document):
    user = me.ObjectIdField(required=True)
    order = me.ObjectIdField(default=None, null=True)
    orderNumber = me.StringField(default="")
    source = me.StringField(choices=["purchase", "admin_comp"], default="purchase")
    kind = me.StringField(choices=["diet", "workout"], required=True)
    snapshot = me.EmbeddedDocumentField(PlanSnapshot, default=PlanSnapshot)

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {
        "collection": "userplans",
        "indexes": [
            "user", "orderNumber",
            {"fields": ["user", "order", "kind"], "unique": True},
        ],
        "strict": False,
    }

    save = _timestamped_save
