from django.urls import path

from . import (
    views_analytics, views_combos, views_content, views_coupons, views_customers,
    views_dashboard, views_inventory, views_products, views_reviews,
    views_banners, views_settings, views_taxonomy, views_uploads,
)

urlpatterns = [
    path("me", views_dashboard.get_admin_me),
    path("stats", views_dashboard.get_dashboard_stats),
    path("team", views_dashboard.team_collection),
    path("team/<str:user_id>", views_dashboard.update_team_member),
    path("audit", views_dashboard.list_audit_logs),

    path("products", views_products.products_collection),
    path("products/<str:product_id>", views_products.product_detail),
    path("products/<str:product_id>/status", views_products.set_product_status),
    path("products/<str:product_id>/tax", views_products.set_product_gst),
    path("products/<str:product_id>/merchandising", views_products.set_product_merchandising),
    path("combos", views_combos.combos_collection),
    path("combos/<str:combo_id>", views_combos.combo_detail),

    path("taxonomy", views_taxonomy.list_taxonomy),
    path("taxonomy/brands", views_taxonomy.create_brand),
    path("taxonomy/brands/<str:brand_id>", views_taxonomy.brand_detail),
    path("taxonomy/categories", views_taxonomy.create_category),
    path("taxonomy/categories/<str:category_id>", views_taxonomy.delete_category),

    path("customers", views_customers.list_customers),
    path("customers/<str:customer_id>", views_customers.customer_detail),

    path("inventory", views_inventory.list_inventory),
    path("inventory/<str:product_id>/stock", views_inventory.adjust_stock),

    path("analytics", views_analytics.get_analytics),
    path("analytics/export", views_analytics.export_orders_csv),

    path("coupons", views_coupons.coupons_collection),
    path("coupons/targets", views_coupons.coupon_targets),
    path("coupons/<str:coupon_id>", views_coupons.coupon_detail),

    path("reviews", views_reviews.reviews_collection),
    path("reviews/<str:review_id>", views_reviews.review_detail),

    # Homepage slideshow banners
    path("banners", views_banners.banners_collection),
    path("banners/reorder", views_banners.reorder_banners),
    path("banners/options", views_banners.banner_options),
    path("banners/<str:banner_id>", views_banners.banner_detail),
    path("banners/<str:banner_id>/toggle", views_banners.toggle_banner),
    path("settings", views_settings.list_settings),
    path("settings/<str:key>", views_settings.setting_detail),

    path("content/homepage", views_content.homepage_detail),
    path("content/versions", views_content.list_homepage_versions),
    path("content/versions/<str:version_id>/rollback", views_content.rollback_homepage_version),

    path("uploads/products", views_uploads.upload_product_images),
    path("uploads/banners", views_uploads.upload_banner_images),
    path("uploads/brands", views_uploads.upload_brand_logos),
]
