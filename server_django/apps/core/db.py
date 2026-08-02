import mongoengine

from . import env


def connect_db():
    """Port of server/src/config/db.js connectDatabase() — mongoengine keeps its
    own connection registry, so this is idempotent to call more than once."""
    if not env.MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not configured")
    mongoengine.connect(host=env.MONGODB_URI, serverSelectionTimeoutMS=5000)
