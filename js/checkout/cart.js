/* ===========================================================
   MUSCLE TONIK — Checkout module: cart
   Loads the raw cart, resolves each line against the product
   catalog, de-duplicates, and computes the order summary. This
   is the single place totals are calculated (no duplicate math).
   Formulas intentionally mirror the cart page so the number the
   customer saw in their cart matches what they pay.
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.cart = (function () {
  "use strict";

  var utils = window.MTCheckout.utils;

  // Coupon and rate rules are defined once here.
  var COUPONS = { TONIK10: 0.10, FIRST15: 0.15 };
  var GST_RATE = 0.05;
  var FREE_SHIPPING_OVER = 599;
  var SHIPPING_FEE = 79;

  // Resolve one raw {id, qty} cart row into a rich line item using the shared
  // catalog helpers from data.js/core.js. Returns null if the product is unknown
  // so callers can drop stale rows rather than render "undefined".
  function toLineItem(row) {
    if (!row || typeof row !== "object") return null;
    var id = utils.toNumber(row.id);
    var qty = utils.toNumber(row.qty);
    if (!Number.isFinite(id)) return null;

    var product = typeof getProductById === "function" ? getProductById(id) : null;
    if (!product) return null;

    var imageUrl = Array.isArray(product.images) && product.images.length ? product.images[0] : "";
    return {
      id: id,
      name: product.name || "",
      brand: (typeof getBrandById === "function" && product.brand && getBrandById(product.brand))
        ? getBrandById(product.brand).name
        : "",
      imageUrl: imageUrl,
      color: product.color || "#ff7a00",
      qty: Math.max(1, Math.round(Number.isFinite(qty) ? qty : 1)),
      unitPrice: utils.toNumber(product.price),
      oldPrice: utils.toNumber(product.oldPrice)
    };
  }

  // Load + de-duplicate. If the same product id appears twice in storage we sum
  // the quantities into a single line so it is only priced once.
  function load() {
    var raw = window.MTCheckout.storage.readRawCart();
    var byId = {};
    var order = [];
    raw.forEach(function (row) {
      var item = toLineItem(row);
      if (!item) return;
      if (byId[item.id]) {
        byId[item.id].qty += item.qty;
      } else {
        byId[item.id] = item;
        order.push(item.id);
      }
    });
    return order.map(function (id) {
      var item = byId[id];
      item.lineTotal = Math.round(item.unitPrice * item.qty);
      return item;
    });
  }

  function normalizeCoupon(code) {
    return String(code || "").trim().toUpperCase();
  }

  function couponRate(code) {
    var key = normalizeCoupon(code);
    return COUPONS[key] || 0;
  }

  // Compute the order summary from already-resolved line items. Pure function of
  // its inputs — called once per render so there is never a double calculation.
  function computeSummary(items, options) {
    options = options || {};
    var subtotal = items.reduce(function (sum, item) {
      return sum + item.unitPrice * item.qty;
    }, 0);
    subtotal = Math.round(subtotal);

    var code = normalizeCoupon(options.couponCode);
    var rate = COUPONS[code] || 0;
    var discount = Math.round(subtotal * rate);
    var afterCoupon = subtotal - discount;
    var gst = Math.round(afterCoupon * GST_RATE);
    var shipping = (afterCoupon > FREE_SHIPPING_OVER || afterCoupon === 0) ? 0 : SHIPPING_FEE;
    var total = afterCoupon + gst + shipping;

    return {
      subtotal: subtotal,
      couponCode: rate > 0 ? code : "",
      discount: discount,
      gst: gst,
      gstRate: GST_RATE,
      shipping: shipping,
      total: total,
      itemCount: items.reduce(function (n, i) { return n + i.qty; }, 0)
    };
  }

  return {
    load: load,
    computeSummary: computeSummary,
    couponRate: couponRate,
    normalizeCoupon: normalizeCoupon,
    COUPONS: COUPONS
  };
})();
