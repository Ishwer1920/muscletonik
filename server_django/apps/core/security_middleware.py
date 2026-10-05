# NOTE: Django now serves the storefront pages too (not just the API), so the CSP
# has to allow what the FRONTEND needs on top of the original Razorpay set:
#   - connect-src: https://api.muscletonik.com — the pages call the API on that
#     subdomain (cross-origin), which 'self' alone would block.
#   - script-src 'unsafe-inline' + connect.facebook.net / www.facebook.com — the
#     inline Meta Pixel snippet and its beacon.
CSP = (
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://*.razorpay.com https://connect.facebook.net;"
    "script-src-attr 'unsafe-inline';"
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com;"
    "connect-src 'self' https://api.muscletonik.com https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://www.facebook.com https://connect.facebook.net;"
    "img-src 'self' data: https:;"
    "default-src 'self';"
    "base-uri 'self';"
    "font-src 'self' https: data:;"
    "form-action 'self';"
    "frame-ancestors 'self';"
    "object-src 'none';"
    "style-src 'self' https: 'unsafe-inline'"
)


class HelmetHeadersMiddleware:
    """Exact port of the Helmet 8 header set configured in server/src/app.js
    (crossOriginResourcePolicy disabled, custom CSP allow-listing Razorpay).
    Header values captured directly from the running Node server so this is
    byte-for-byte, not a re-derivation from Helmet's docs."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["Content-Security-Policy"] = CSP
        response["Cross-Origin-Opener-Policy"] = "same-origin"
        response["Origin-Agent-Cluster"] = "?1"
        response["Referrer-Policy"] = "no-referrer"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["X-Content-Type-Options"] = "nosniff"
        response["X-DNS-Prefetch-Control"] = "off"
        response["X-Download-Options"] = "noopen"
        response["X-Frame-Options"] = "SAMEORIGIN"
        response["X-Permitted-Cross-Domain-Policies"] = "none"
        response["X-XSS-Protection"] = "0"
        return response
