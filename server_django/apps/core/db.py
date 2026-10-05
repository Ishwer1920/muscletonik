import mongoengine

from . import env


def connect_db():
    """Port of server/src/config/db.js connectDatabase() — mongoengine keeps its
    own connection registry, so this is idempotent to call more than once."""
    if not env.MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not configured")
    # Local-dev escape hatch: MONGODB_URI="embedded" runs the whole database
    # in-process (mongomock, seeded from mongodump_export.zip) so the app works
    # on a machine where mongod can't start and no cloud DB is set. Any real URI
    # takes the normal path below, so production is untouched.
    if env.MONGODB_URI.strip().lower() == "embedded":
        from .embedded_db import connect_embedded
        connect_embedded()
        return
    mongoengine.connect(host=env.MONGODB_URI, serverSelectionTimeoutMS=5000)
