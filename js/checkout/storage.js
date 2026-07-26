/* ===========================================================
   MUSCLE TONIK — Checkout module: storage
   A thin, defensive wrapper over localStorage. Every read is
   guarded so corrupted JSON can never throw into the checkout
   flow — a bad value is treated as "absent".
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.storage = (function () {
  "use strict";

  // The cart key is owned by core.js (Cart). We only READ it here; writes to the
  // cart still go through the shared Cart object so header counts stay in sync.
  var CART_KEY = "mt_cart";
  var ORDER_KEY = "mt_last_order";

  function available() {
    try {
      var probe = "__mt_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null ? fallback : parsed;
    } catch (e) {
      // Corrupted value — drop it so it can't keep breaking future reads.
      try { localStorage.removeItem(key); } catch (_) {}
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Quota exceeded or storage disabled — surfaced to the caller so it can
      // still proceed to payment rather than blocking the sale on a cache write.
      return false;
    }
  }

  function readRawCart() {
    var items = readJSON(CART_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveOrder(order) {
    return writeJSON(ORDER_KEY, order);
  }

  function getOrder() {
    return readJSON(ORDER_KEY, null);
  }

  // Merge a status/timestamp patch into the stored order without losing the
  // rest of it. Returns the updated order, or null if there was nothing stored.
  function patchOrder(patch) {
    var current = getOrder();
    if (!current || typeof current !== "object") return null;
    var updated = Object.assign({}, current, patch);
    saveOrder(updated);
    return updated;
  }

  function clearOrder() {
    try { localStorage.removeItem(ORDER_KEY); } catch (e) {}
  }

  return {
    available: available,
    readRawCart: readRawCart,
    saveOrder: saveOrder,
    getOrder: getOrder,
    patchOrder: patchOrder,
    clearOrder: clearOrder,
    ORDER_KEY: ORDER_KEY
  };
})();
