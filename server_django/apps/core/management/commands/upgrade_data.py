"""One-off data upgrade for the coupon + OTP release.

MongoDB is schemaless, so nothing here is required for the new code to RUN -
documents written by the old code read back fine, with the new fields taking
their declared defaults. What this command fixes is the two places where a
missing field changes behaviour rather than just being absent:

  1. Stored phone numbers. They were saved exactly as typed ("+91 98765 43210",
     "098765-43210"), so a customer could not log in by mobile and the
     forgot-password OTP could not find their account. Normalizing them to the
     bare 10 digits is what makes both work.

  2. Coupon.purpose / appliesTo. A document that lacks the field does not match
     a query on it, so legacy coupons are invisible to the admin panel's
     purpose filter even though they read as "general" everywhere else.

It also builds the new indexes up front instead of leaving them to be created
lazily on the first request that touches them.

Safe to run more than once - every step is idempotent. Always start with
--dry-run, and take a mongodump first.
"""

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.accounts.validation import normalize_phone
from apps.checkout.models import Coupon, CouponRedemption


class Command(BaseCommand):
    help = "Normalize stored phone numbers, backfill coupon fields, and build new indexes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would change without writing anything.",
        )
        parser.add_argument(
            "--skip-indexes", action="store_true",
            help="Do not build indexes (they are also created lazily on first use).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - nothing will be written.\n"))

        self._normalize_phones(dry_run)
        self._backfill_coupons(dry_run)
        if not options["skip_indexes"]:
            self._build_indexes(dry_run)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            "Dry run complete - re-run without --dry-run to apply." if dry_run
            else "Data upgrade complete."
        ))

    # -- 1. phone numbers ---------------------------------------------------
    def _normalize_phones(self, dry_run):
        self.stdout.write(self.style.MIGRATE_HEADING("Phone numbers"))
        users = list(User.objects(phone__nin=["", None]).only("id", "email", "phone"))

        # Group first, rewrite second. Deciding one account at a time would
        # happily normalize "+91 98765 43210" onto a number a different
        # account already stores as "9876543210", creating the duplicate the
        # login lookup then has to pick between.
        owners = {}
        unusable = []
        for user in users:
            wanted = normalize_phone(user.phone or "")
            if not wanted:
                unusable.append(user)
                continue
            owners.setdefault(wanted, []).append(user)

        changed = 0
        for number, group in sorted(owners.items()):
            if len(group) > 1:
                self.stdout.write(self.style.ERROR(
                    f"  ! {number}: shared by {', '.join(u.email for u in group)} - "
                    "all left unchanged, resolve by hand."
                ))
                continue
            user = group[0]
            if (user.phone or "") == number:
                continue
            changed += 1
            self.stdout.write(f"  - {user.email}: {user.phone!r} -> {number!r}")
            if not dry_run:
                User.objects(id=user.id).update_one(set__phone=number)

        for user in unusable:
            self.stdout.write(f"  ? {user.email}: {user.phone!r} has no usable digits - left alone")

        self.stdout.write(f"  {changed} phone number(s) {'would be ' if dry_run else ''}normalized.")

    # -- 2. coupon fields ---------------------------------------------------
    def _backfill_coupons(self, dry_run):
        self.stdout.write(self.style.MIGRATE_HEADING("Coupons"))
        collection = Coupon._get_collection()

        defaults = {
            "purpose": "general",
            "appliesTo": "all",
            "description": "",
            "campaign": "",
            "ownerEmail": "",
            "brands": [],
            "categories": [],
            "productSkus": [],
            "maxDiscount": 0,
            "perUserLimit": 0,
            "firstOrderOnly": False,
            "startsAt": None,
        }

        for field, value in defaults.items():
            missing = collection.count_documents({field: {"$exists": False}})
            if not missing:
                continue
            self.stdout.write(f"  - {field}: {missing} coupon(s) -> {value!r}")
            if not dry_run:
                collection.update_many({field: {"$exists": False}}, {"$set": {field: value}})

        total = collection.count_documents({})
        missing = collection.count_documents({"purpose": {"$exists": False}})
        if dry_run:
            self.stdout.write(f"  {total} coupon(s) in total, {missing} would be backfilled.")
        else:
            self.stdout.write(f"  {total} coupon(s) in total, {missing} still without a purpose.")

    # -- 3. indexes ---------------------------------------------------------
    def _build_indexes(self, dry_run):
        self.stdout.write(self.style.MIGRATE_HEADING("Indexes"))
        for model in (User, Coupon, CouponRedemption):
            name = model.__name__
            if dry_run:
                self.stdout.write(f"  - would ensure indexes on {name}")
                continue
            model.ensure_indexes()
            built = sorted(model._get_collection().index_information().keys())
            self.stdout.write(f"  - {name}: {', '.join(built)}")
