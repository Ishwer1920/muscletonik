/* ===========================================================
   MUSCLE TONIK — Checkout module: utils
   Pure, side-effect-free helpers. No DOM, no storage, no globals
   beyond the single MTCheckout namespace shared by the module set.
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.utils = (function () {
  "use strict";

  // Coerce anything to a finite number, or return NaN so callers can reject it.
  function toNumber(value) {
    const n = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function isPositiveNumber(value) {
    const n = toNumber(value);
    return Number.isFinite(n) && n > 0;
  }

  // Whole-number rupees, Indian grouping. All money in this flow is integer
  // rupees (matching the cart page), so we never show paise.
  function formatCurrency(value) {
    const n = toNumber(value);
    const safe = Number.isFinite(n) ? Math.round(n) : 0;
    return "₹" + safe.toLocaleString("en-IN");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Customer-facing order reference, generated on the client. Format: MT + 2-digit
  // year + month + day + 4 random digits, e.g. MT2607163481. This is a display
  // reference only — a server-issued number should replace it once orders are
  // persisted server-side (see payment.verifyPaymentWithServer placeholder).
  function generateOrderNumber() {
    const d = new Date();
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return "MT" + y + m + day + rand;
  }

  // Estimated delivery window as a friendly label, e.g. "19 – 21 Jul".
  function deliveryEstimate(minDays, maxDays) {
    const min = Number.isFinite(minDays) ? minDays : 3;
    const max = Number.isFinite(maxDays) ? maxDays : 5;
    const fmt = function (date) {
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    };
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() + min);
    const to = new Date(now);
    to.setDate(to.getDate() + max);
    return { from: from, to: to, label: fmt(from) + " – " + fmt(to) };
  }

  function nowISO() {
    return new Date().toISOString();
  }

  return {
    toNumber: toNumber,
    isPositiveNumber: isPositiveNumber,
    formatCurrency: formatCurrency,
    escapeHtml: escapeHtml,
    generateOrderNumber: generateOrderNumber,
    deliveryEstimate: deliveryEstimate,
    nowISO: nowISO
  };
})();
