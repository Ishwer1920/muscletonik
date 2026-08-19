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
  // No local table of codes and rates. Coupons are priced by the API (the
  // same evaluator checkout itself uses), so brand-scoped codes, minimum-order
  // rules and per-customer limits are honoured here instead of being invisible
  // to the browser.
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

  // Ask the server what this code is worth for this exact cart. Resolves to
  // { valid, code, discount, freeShipping, message } and never rejects, so a
  // network blip just means "no discount shown yet", not a broken page.
  function quoteCoupon(code, items) {
    var normalized = normalizeCoupon(code);
    if (!normalized || !items || !items.length) {
      return Promise.resolve({ valid: false, code: normalized, discount: 0, freeShipping: false, message: "" });
    }
    var base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : "");
    return fetch(base + "/checkout/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({
        couponCode: normalized,
        items: items.map(function (i) { return { id: i.id, qty: i.qty }; })
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; });
    }).then(function (data) {
      return {
        valid: !!(data && data.valid),
        code: normalized,
        discount: (data && data.discount) || 0,
        freeShipping: !!(data && data.freeShipping),
        message: (data && data.message) || ""
      };
    }).catch(function () {
      return { valid: false, code: normalized, discount: 0, freeShipping: false, message: "" };
    });
  }

  // Compute the order summary from already-resolved line items. Pure function of
  // its inputs — called once per render so there is never a double calculation.
  function computeSummary(items, options) {
    options = options || {};
    var subtotal = items.reduce(function (sum, item) {
      return sum + item.unitPrice * item.qty;
    }, 0);
    subtotal = Math.round(subtotal);

    // options.coupon is the server's verdict for this cart, from quoteCoupon().
    var quote = options.coupon && options.coupon.valid ? options.coupon : null;
    var code = normalizeCoupon(quote ? quote.code : options.couponCode);
    var discount = quote ? Math.min(quote.discount || 0, subtotal) : 0;
    var afterCoupon = subtotal - discount;
    var gst = Math.round(afterCoupon * GST_RATE);
    var shipping = (afterCoupon > FREE_SHIPPING_OVER || afterCoupon === 0) ? 0 : SHIPPING_FEE;
    if (quote && quote.freeShipping) shipping = 0;
    var total = afterCoupon + gst + shipping;

    return {
      subtotal: subtotal,
      couponCode: quote ? code : "",
      couponMessage: options.coupon ? options.coupon.message : "",
      couponFreeShipping: !!(quote && quote.freeShipping),
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
    quoteCoupon: quoteCoupon,
    normalizeCoupon: normalizeCoupon
  };
})();
