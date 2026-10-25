"""Canonical schema, validation and public projection for the mobile-app
promotion ("App Settings" in the admin panel).

One module so the admin write path (apps.adminpanel.views_settings) and the
public read path (apps.catalog.services.get_catalog) agree on exactly what the
`appPromo` SiteSetting may contain. Everything here is display config plus a
public download URL — there is nothing secret, so the public projection returns
the same shape, only gated on the master `enabled` flag.

Lives in apps.core (the lowest layer, imported by everyone) so neither app has
to import the other.
"""

import re

_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_HTTP_URL = re.compile(r"^https?://", re.IGNORECASE)

POSITIONS = ("bottom-right", "bottom-left", "top-right", "top-left")

# Defaults mirror the admin form's "Reset to Default" (js/admin/app-settings.js).
# Keep the two in step. The icon defaults to the real Play-Store app icon that
# ships in the repo (play-assets/app-icon-512.png is served at the site root).
DEFAULTS = {
    "enabled": False,
    "appName": "Muscle Tonik",
    "icon": "/play-assets/app-icon-512.png",
    "title": "Get the Muscle Tonik App",
    "description": "Shop faster, track your orders and unlock app-only offers.",
    "buttonText": "Download App",
    "downloadUrl": "",
    "comingSoonText": "App coming soon",
    "secondaryEnabled": False,
    "secondaryLabel": "Learn more",
    "secondaryUrl": "",
    "imageWidth": 56,
    "imageHeight": 56,
    "cardWidth": 340,
    "cardHeight": 0,          # 0 = auto height
    "borderRadius": 18,
    "position": "bottom-right",
    "showOnDesktop": True,
    "showOnMobile": True,
    "iconEnabled": True,
    "iconSize": 58,
    "iconPosition": "bottom-right",
    "iconDirectDownload": False,
    "bgColor": "",            # "" = use the storefront's own card surface
    "textColor": "",
}

# Per-field numeric bounds: (lo, hi). Values outside are clamped, never rejected,
# so a bad number can't block a save or break the public card.
_NUM_BOUNDS = {
    "imageWidth": (24, 160),
    "imageHeight": (24, 160),
    "cardWidth": (240, 480),
    "cardHeight": (0, 600),
    "borderRadius": (0, 40),
    "iconSize": (40, 120),
}

_STR_MAX = {
    "appName": 60,
    "title": 120,
    "description": 400,
    "buttonText": 40,
    "comingSoonText": 60,
    "secondaryLabel": 40,
}

_URL_FIELDS = ("icon", "downloadUrl", "secondaryUrl")
_BOOL_FIELDS = (
    "enabled", "secondaryEnabled", "showOnDesktop", "showOnMobile",
    "iconEnabled", "iconDirectDownload",
)


def _as_bool(value, default):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "on", "yes")
    if value is None:
        return default
    return bool(value)


def _clamp_int(value, lo, hi, default):
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    if n != n:  # NaN guard
        return default
    return max(lo, min(hi, n))


def _clean_str(value, max_len):
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return value.strip()[:max_len]


def _safe_url(value):
    """Allow only empty, an absolute http(s) URL, or a site-relative path.
    Everything else (javascript:, data:, mailto:, relative text) becomes "" so
    the public card can never render a dangerous or broken link."""
    v = _clean_str(value, 500)
    if not v:
        return ""
    if v.startswith("/") or _HTTP_URL.match(v):
        return v
    return ""


def _hex_or_empty(value):
    v = _clean_str(value, 9)
    return v if _HEX_COLOR.match(v) else ""


def _enum(value, allowed, default):
    return value if value in allowed else default


def sanitize(value):
    """Full validation + normalisation of a raw admin submission into the
    canonical stored shape. Unknown keys are dropped; missing keys fall back to
    DEFAULTS. Used as the save-time sanitizer for the `appPromo` SiteSetting."""
    if not isinstance(value, dict):
        value = {}
    out = {}
    for key, default in DEFAULTS.items():
        if key in _BOOL_FIELDS:
            out[key] = _as_bool(value.get(key, default), default)
        elif key in _NUM_BOUNDS:
            lo, hi = _NUM_BOUNDS[key]
            out[key] = _clamp_int(value.get(key, default), lo, hi, default)
        elif key in _URL_FIELDS:
            out[key] = _safe_url(value.get(key, default))
        elif key in ("bgColor", "textColor"):
            out[key] = _hex_or_empty(value.get(key, default))
        elif key == "position":
            out[key] = _enum(value.get(key), POSITIONS, default)
        elif key == "iconPosition":
            out[key] = _enum(value.get(key), POSITIONS, default)
        else:
            out[key] = _clean_str(value.get(key, default), _STR_MAX.get(key, 200))
    # Never let a required label come back empty.
    if not out["appName"]:
        out["appName"] = DEFAULTS["appName"]
    if not out["buttonText"]:
        out["buttonText"] = DEFAULTS["buttonText"]
    return out


def public_view(raw):
    """Projection served in the public /api/catalog payload. Re-sanitises (so a
    document written before this schema existed, or edited directly in the DB,
    is still safe) and gates on the master toggle: a disabled promotion exposes
    nothing but {"enabled": False}, so the storefront renders no card or icon."""
    clean = sanitize(raw if isinstance(raw, dict) else {})
    if not clean.get("enabled"):
        return {"enabled": False}
    return clean
