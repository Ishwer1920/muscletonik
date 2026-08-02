from bson import ObjectId
from datetime import datetime


def to_jsonable(value):
    """Recursively convert mongoengine Documents/EmbeddedDocuments (and raw
    BSON types like ObjectId) into plain JSON-safe Python values — the
    equivalent of Mongoose's .lean(), which mongoengine has no built-in for."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    if hasattr(value, "to_mongo"):
        return to_jsonable(value.to_mongo().to_dict())
    return value
