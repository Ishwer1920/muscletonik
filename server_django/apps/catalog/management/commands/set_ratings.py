"""Assign fixed, distinct, persistent star ratings to products.

Ratings are set by us, not generated at request time: this command writes a
rating onto each product once, and the storefront/admin just read it back.
Values are deterministic (keyed to catalogId order), so re-running produces the
same result, and distinct wherever the chosen range has enough room.

Examples
--------
    # Spread distinct ratings across the default 3.5–5.0 range
    python manage.py set_ratings

    # Use the full 1.0–5.0 range
    python manage.py set_ratings --low 1.0 --high 5.0

    # Set exact values for specific products, e.g. {"12": 4.7, "13": 4.2}
    python manage.py set_ratings --map ratings.json

    # Preview without writing
    python manage.py set_ratings --dry-run
"""

import json

from django.core.management.base import BaseCommand, CommandError

from apps.catalog.models import Product


def _round1(value):
    return round(float(value) + 1e-9, 1)


def _grid(low, high):
    """The 0.1-step values available in [low, high], inclusive."""
    low, high = _round1(low), _round1(high)
    slots = int(round((high - low) / 0.1)) + 1
    return [_round1(low + k * 0.1) for k in range(max(1, slots))]


def _distinct_ratings(count, low, high):
    """`count` ratings from the [low, high] grid, as distinct as the range
    allows. Distinct when count <= grid size; otherwise cycles the grid so
    values stay varied and neighbours differ."""
    grid = _grid(low, high)
    slots = len(grid)
    if count <= 0:
        return []
    if count == 1:
        return [grid[-1]]
    if count <= slots:
        # step >= 1, so rounded indices strictly increase -> all distinct.
        step = (slots - 1) / (count - 1)
        return [grid[round(k * step)] for k in range(count)]
    return [grid[k % slots] for k in range(count)]


class Command(BaseCommand):
    help = "Assign fixed, distinct star ratings (1.0–5.0) to every product."

    def add_arguments(self, parser):
        parser.add_argument("--low", type=float, default=3.5,
                            help="Lowest rating to assign (>= 1.0). Default 3.5.")
        parser.add_argument("--high", type=float, default=5.0,
                            help="Highest rating to assign (<= 5.0). Default 5.0.")
        parser.add_argument("--map", dest="map_path", default=None,
                            help="JSON file of {catalogId: rating} exact overrides.")
        parser.add_argument("--only-missing", action="store_true",
                            help="Only set products that have no rating yet (keeps existing ones).")
        parser.add_argument("--dry-run", action="store_true",
                            help="Show what would change without writing.")

    def handle(self, *args, **opts):
        low, high = opts["low"], opts["high"]
        if not (1.0 <= low <= 5.0 and 1.0 <= high <= 5.0):
            raise CommandError("--low and --high must each be between 1.0 and 5.0.")
        if low > high:
            raise CommandError("--low cannot be greater than --high.")

        overrides = {}
        if opts["map_path"]:
            try:
                with open(opts["map_path"], encoding="utf-8") as fh:
                    raw = json.load(fh)
            except (OSError, json.JSONDecodeError) as exc:
                raise CommandError(f"Could not read --map file: {exc}")
            if not isinstance(raw, dict):
                raise CommandError("--map file must be a JSON object {catalogId: rating}.")
            for key, value in raw.items():
                try:
                    rating = _round1(value)
                except (TypeError, ValueError):
                    continue
                if 1.0 <= rating <= 5.0:
                    overrides[str(key)] = rating

        products = list(Product.objects().order_by("catalogId"))
        if not products:
            self.stdout.write("No products found — nothing to do.")
            return

        auto = _distinct_ratings(len(products), low, high)
        dry = opts["dry_run"]
        only_missing = opts["only_missing"]

        changed = 0
        for index, product in enumerate(products):
            key = str(product.catalogId)
            if key in overrides:
                new_rating = overrides[key]
            elif only_missing and float(product.rating or 0) > 0:
                continue
            else:
                new_rating = auto[index]

            if _round1(product.rating or 0) == new_rating:
                continue

            changed += 1
            if dry:
                self.stdout.write(
                    f"  [{product.catalogId}] {product.name[:48]:48s} "
                    f"{float(product.rating or 0):.1f} -> {new_rating:.1f}"
                )
            else:
                product.rating = new_rating
                product.save()

        distinct_count = len(set(auto))
        verb = "Would update" if dry else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {changed} of {len(products)} product rating(s). "
            f"Auto range {low:.1f}–{high:.1f} provides {distinct_count} distinct value(s)."
        ))
        if not overrides and len(products) > distinct_count:
            self.stdout.write(self.style.WARNING(
                f"{len(products)} products exceed the {distinct_count} distinct values in "
                f"{low:.1f}–{high:.1f}; some ratings repeat. Widen the range (e.g. --low 1.0) "
                f"or pass --map for exact per-product values."
            ))
