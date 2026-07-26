/* ===========================================================
   MUSCLE TONIK — Checkout module: validation
   Guards the whole flow. Every function returns a plain result
   object { ok, errors[] } — never throws — so the UI can show a
   friendly message and keep the customer on the page.
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.validation = (function () {
  "use strict";

  var utils = window.MTCheckout.utils;

  // Validate the resolved line items. Each must have a valid id, a non-empty
  // name, a renderable image reference, a quantity > 0 and a unit price > 0.
  // NaN / negative / zero values are all rejected.
  function validateCart(items) {
    var errors = [];
    if (!Array.isArray(items)) {
      return { ok: false, errors: ["Your cart could not be read. Please return to your cart and try again."] };
    }
    if (items.length === 0) {
      return { ok: false, errors: ["Your cart is empty. Add a product before checking out."] };
    }

    items.forEach(function (item, index) {
      var where = item && item.name ? '"' + item.name + '"' : "Item " + (index + 1);
      if (!item || typeof item !== "object") {
        errors.push(where + " is invalid.");
        return;
      }
      if (!Number.isFinite(utils.toNumber(item.id))) {
        errors.push(where + " is missing a valid product ID.");
      }
      if (!item.name || typeof item.name !== "string") {
        errors.push("A product in your cart is missing its name.");
      }
      // "image" is satisfied by either an uploaded image URL or the generated
      // product placeholder — both render. We only reject a genuinely absent one.
      if (item.imageUrl === undefined || item.imageUrl === null) {
        errors.push(where + " is missing image information.");
      }
      if (!Number.isInteger(item.qty) || item.qty <= 0) {
        errors.push(where + " has an invalid quantity.");
      }
      if (!utils.isPositiveNumber(item.unitPrice)) {
        errors.push(where + " has an invalid price.");
      }
    });

    return { ok: errors.length === 0, errors: errors };
  }

  // Validate a computed summary: no NaN anywhere, nothing negative, and a
  // grand total strictly greater than zero.
  function validateTotals(summary) {
    var errors = [];
    if (!summary || typeof summary !== "object") {
      return { ok: false, errors: ["We could not calculate your order total. Please try again."] };
    }
    var fields = ["subtotal", "discount", "gst", "shipping", "total"];
    fields.forEach(function (key) {
      var value = summary[key];
      if (!Number.isFinite(value)) {
        errors.push("The order total is invalid (" + key + ").");
      } else if (value < 0) {
        errors.push("The order total is invalid (negative " + key + ").");
      }
    });
    if (Number.isFinite(summary.total) && summary.total <= 0) {
      errors.push("The amount to pay must be greater than zero.");
    }
    if (Number.isFinite(summary.discount) && Number.isFinite(summary.subtotal) && summary.discount > summary.subtotal) {
      errors.push("The discount cannot be larger than the order value.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // Shipping address required fields. Kept deliberately light — this is a demo
  // storefront — but enough to prevent an order with no deliverable address.
  function validateAddress(address) {
    var errors = [];
    var required = {
      fullName: "Full name",
      phone: "Phone number",
      line1: "Address line 1",
      city: "City",
      state: "State",
      postalCode: "Postal code"
    };
    Object.keys(required).forEach(function (key) {
      if (!address || !String(address[key] || "").trim()) {
        errors.push(required[key] + " is required.");
      }
    });
    var phone = String((address && address.phone) || "").replace(/\D/g, "");
    if (phone && (phone.length < 10 || phone.length > 12)) {
      errors.push("Enter a valid phone number.");
    }
    var pin = String((address && address.postalCode) || "").replace(/\D/g, "");
    if (pin && pin.length !== 6) {
      errors.push("Enter a valid 6-digit postal code.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  return {
    validateCart: validateCart,
    validateTotals: validateTotals,
    validateAddress: validateAddress
  };
})();
