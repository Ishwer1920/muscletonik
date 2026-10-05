"""Insert/refresh the hand-entered catalogue products and their brands.

Use this against a REAL Mongo (Atlas / Hostinger) so the extra products persist:

    python manage.py seed_custom_catalog

It is idempotent — rows are upserted by catalogId, so re-running updates in place
rather than duplicating. (The in-memory ``MONGODB_URI=embedded`` DB seeds the same
data automatically on every startup, so this command is only needed for real DBs.)
"""

from django.core.management.base import BaseCommand

from apps.catalog import custom_catalog
from apps.core import db as core_db


class Command(BaseCommand):
    help = "Add the hand-entered brands + products (idempotent upsert by catalogId)."

    def handle(self, *args, **opts):
        core_db.connect_db()
        brands_added, products_written = custom_catalog.seed()
        self.stdout.write(self.style.SUCCESS(
            f"Custom catalog seeded: {brands_added} brand(s) added, "
            f"{products_written} product(s) written."
        ))
