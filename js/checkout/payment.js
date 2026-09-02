/* ===========================================================
   MUSCLE TONIK — Checkout module: payment
   Owns the Razorpay Checkout integration.

   Flow (both payment modes):
     1. POST /checkout/order  -> server recomputes the cart from the DB,
        creates a Razorpay order, returns { keyId, orderId, amount }.
     2. Razorpay's SDK collects the payment in its own modal. No card data
        ever touches this page.
     3. POST /checkout/verify -> server checks the HMAC signature and only
        then writes the Order + Payment and reserves stock.

   The amount charged is ALWAYS decided by the server from the recomputed
   cart. This module sends a payment MODE ("online" | "cod"), never an amount,
   so a tampered client cannot pay less than it owes.

   For mode "cod" the server charges a 20% advance now; the balance is
   collected in cash on delivery.
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.payment = (function () {
  "use strict";

  var METHOD_LABELS = {
    online: "Razorpay (UPI / Card / Netbanking)",
    cod: "Cash on Delivery (20% paid online)"
  };

  function apiBase() {
    if (window.MT_API_BASE) return window.MT_API_BASE;
    return (window.location && window.location.origin ? window.location.origin : "") + "/api";
  }

  // All checkout endpoints are cookie-authenticated, hence credentials:include.
  function api(path, body) {
    return fetch(apiBase() + path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.message || "Request failed. Please try again.");
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  // Is there a live session? Checkout requires one because orders are tied to
  // a user account. Resolves to the user object, or null when logged out.
  function currentUser() {
    return fetch(apiBase() + "/auth/me", { credentials: "include" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return (data && data.user) || null; })
      .catch(function () { return null; });
  }

  // The cart shape the server expects. Sent identically to /order and /verify
  // so both recompute the exact same session and totals.
  function buildSessionPayload(items, couponCode, shippingAddress, mode) {
    return {
      items: items.map(function (i) { return { id: i.id, qty: i.qty, comboId: i.comboId || null }; }),
      couponCode: couponCode || "",
      shippingAddress: shippingAddress || {},
      paymentMode: mode === "cod" ? "cod" : "online"
    };
  }

  // The BMI figures a purchased plan is generated from. Sent only on verify —
  // it never affects pricing, so the server sanitises but doesn't trust it.
  function bmiSnapshot() {
    try { return JSON.parse(localStorage.getItem("mt_bmi_snapshot") || "null"); }
    catch (e) { return null; }
  }

  function createOrder(sessionPayload) {
    return api("/checkout/order", sessionPayload);
  }

  // Open Razorpay's modal. Resolves with the handler payload on success,
  // rejects with {dismissed:true} if the customer closed it.
  function openCheckout(orderData, options) {
    return new Promise(function (resolve, reject) {
      if (typeof window.Razorpay !== "function") {
        reject(new Error("The payment gateway could not load. Check your connection and try again."));
        return;
      }

      var settled = false;
      var rzp = new window.Razorpay({
        key: orderData.keyId,
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "Muscle Tonik",
        description: orderData.paymentMode === "cod_advance"
          ? "20% advance — balance payable on delivery"
          : "Order payment",
        prefill: options && options.prefill ? options.prefill : {},
        notes: { checkoutSessionId: orderData.sessionId },
        theme: { color: "#ff7a00" },
        handler: function (response) {
          settled = true;
          resolve(response);
        },
        modal: {
          ondismiss: function () {
            if (settled) return;
            var err = new Error("Payment was cancelled.");
            err.dismissed = true;
            reject(err);
          }
        }
      });

      // A failed attempt (declined card, expired UPI request) fires here rather
      // than the handler, so surface the gateway's own reason.
      rzp.on("payment.failed", function (resp) {
        settled = true;
        var desc = (resp && resp.error && resp.error.description) || "The payment could not be completed.";
        var err = new Error(desc);
        err.gateway = true;
        reject(err);
      });

      rzp.open();
    });
  }

  // Server-side verification. This is what actually creates the order —
  // until it succeeds, nothing has been purchased.
  function verifyPaymentWithServer(sessionPayload, rzpResponse) {
    return api("/checkout/verify", {
      session: sessionPayload,
      paymentMode: sessionPayload.paymentMode,
      bmiSnapshot: bmiSnapshot(),
      razorpayOrderId: rzpResponse.razorpay_order_id,
      razorpayPaymentId: rzpResponse.razorpay_payment_id,
      razorpaySignature: rzpResponse.razorpay_signature
    });
  }

  // The signed-in customer's purchased plans (lifetime entitlements).
  function myPlans() {
    return fetch(apiBase() + "/plans/mine", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : { plans: [] }; })
      .then(function (d) { return d.plans || []; })
      .catch(function () { return []; });
  }

  return {
    METHOD_LABELS: METHOD_LABELS,
    apiBase: apiBase,
    currentUser: currentUser,
    buildSessionPayload: buildSessionPayload,
    createOrder: createOrder,
    openCheckout: openCheckout,
    verifyPaymentWithServer: verifyPaymentWithServer,
    myPlans: myPlans
  };
})();
