from datetime import datetime, timezone

import mongoengine as me

# Field-for-field port of server/src/models/audit-log.model.js.
# Append-only by convention — never updated or deleted through the API.


class AuditLog(me.Document):
    actor = me.ObjectIdField()
    actorEmail = me.StringField(default="")
    actorRole = me.StringField(default="")
    action = me.StringField(required=True)
    target = me.StringField(default="")
    details = me.DynamicField(default=dict)
    ip = me.StringField(default="")
    userAgent = me.StringField(default="")

    createdAt = me.DateTimeField()
    updatedAt = me.DateTimeField()

    meta = {"collection": "auditlogs", "strict": False}

    def save(self, *args, **kwargs):
        now = datetime.now(timezone.utc)
        if not self.createdAt:
            self.createdAt = now
        self.updatedAt = now
        return super().save(*args, **kwargs)
