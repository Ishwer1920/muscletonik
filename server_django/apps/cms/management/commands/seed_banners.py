"""Create the starter set of homepage banners.

    python manage.py seed_banners            # create them if none exist
    python manage.py seed_banners --replace  # wipe existing banners first

Banners are database records, not code, so deploying the site does not carry
them between environments. This command puts the same starter set on any
environment in one step.

Safe by default: it refuses to run when banners already exist, so it cannot
quietly overwrite work done in the admin panel.
"""

from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand

from apps.cms.models import Banner

# Artwork already shipped with the site (public_html/uploads/banners).
ART = [
    "/uploads/banners/1784482135038-453227063.jpg",
    "/uploads/banners/1784492335180-300301292.jpg",
    "/uploads/banners/1784482178301-921812799.jpg",
]

SLIDES = [
    ("Fuel Your Strength", "Authentic whey, creatine and gainers at honest prices.",
     "Shop Now", "marketplace", ""),
    ("Crazy Deals Are Live", "Hand-picked price drops while stock lasts.",
     "See Crazy Deals", "collection", "crazy-deals"),
    ("Fresh On The Shelf", "The newest additions to the Muscle Tonik range.",
     "View New Arrivals", "collection", "new-arrivals"),
    ("Near Expiry, Real Savings", "Genuine stock close to its date - at a lower price.",
     "Browse Near Expiry", "collection", "near-expiry"),
    ("Know Your Numbers", "Check your BMI and get a plan built around your goal.",
     "Calculate Your BMI", "page", "bmi"),
    ("Train Hard. Recover Smarter.", "Pre-workout, BCAA and recovery essentials.",
     "Shop Recovery", "marketplace", ""),
    ("Today's Top Offers", "Coupon savings and bundle pricing across the store.",
     "View Offers", "page", "offers"),
]


class Command(BaseCommand):
    help = "Create the starter homepage banners (7 hero slides + promo + festive)."

    def add_arguments(self, parser):
        parser.add_argument("--replace", action="store_true",
                            help="Delete existing banners first.")
        parser.add_argument("--product", type=int, default=0,
                            help="catalogId to feature in the promo banner.")

    def handle(self, *args, **options):
        existing = Banner.objects().count()
        if existing and not options["replace"]:
            self.stdout.write(self.style.WARNING(
                f"{existing} banner(s) already exist - nothing done.\n"
                "Re-run with --replace to wipe and recreate them."))
            return
        if options["replace"] and existing:
            Banner.objects().delete()
            self.stdout.write(f"Removed {existing} existing banner(s).")

        order = 0
        for title, subtitle, cta, action, target in SLIDES:
            Banner(
                layout="slide", name=title, title=title, subtitle=subtitle,
                image=ART[order % len(ART)], alt=title,
                ctaText=cta, buttonActionType=action, buttonTarget=target,
                displayOrder=order, isActive=True, createdBy="seed_banners",
            ).save()
            order += 1
        self.stdout.write(self.style.SUCCESS(f"Created {order} hero slides."))

        # Featured product: whatever was asked for, else the first active one
        # with a photo, so the promo panel is never empty.
        product_id = options["product"] or self._pick_product()

        Banner(
            layout="promo", name="Deal of the day",
            subheading="Deal of the day",
            heading="One sharp deal. One short timer.",
            paragraph="A hand-picked price drop, live until the countdown runs out.",
            backgroundColor="linear-gradient(120deg,#111111,#262626)",
            ctaText="Claim Now", buttonActionType="collection", buttonTarget="crazy-deals",
            productId=product_id,
            timerEnabled=True, timerLabel="Offer ends in",
            timerEnd=datetime.now(timezone.utc) + timedelta(hours=8),
            expiredBehavior="expired",
            displayOrder=order, isActive=True, createdBy="seed_banners",
        ).save()
        order += 1

        Banner(
            layout="festive", name="Raksha Bandhan",
            offerText="Raksha Bandhan Special",
            heading="Gift your sibling strength that lasts",
            paragraph="Celebrate the bond with authentic whey, creatine and daily-wellness "
                      "stacks. Festive bundles, free delivery over Rs.599 and dispatch "
                      "within 24 hours.",
            note="Use code TONIK10 for 10% off your first festive order.",
            backgroundColor="linear-gradient(120deg,#7b1533 0%,#a51f3f 52%,#c9445f 100%)",
            ctaText="Shop Raakhi Offers", buttonActionType="page", buttonTarget="offers",
            button2Text="Browse All Products", button2ActionType="marketplace",
            displayOrder=order, isActive=True, createdBy="seed_banners",
        ).save()

        live = sum(1 for b in Banner.objects() if b.is_live())
        self.stdout.write(self.style.SUCCESS(
            f"Created the promo and festive panels too.\n"
            f"{Banner.objects().count()} banners total, {live} live on the site."))
        self.stdout.write("Edit them at /admin/slideshow.html")

    def _pick_product(self):
        from apps.catalog.models import Product
        p = Product.objects(status="active", images__ne=[]).order_by("catalogId").first()
        return p.catalogId if p else None
