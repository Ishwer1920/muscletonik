/* ===========================================================
   MUSCLE TONIK — Checkout page orchestrator
   Wires the modules together for checkout.html:
     load cart → validate → render summary → collect address →
     confirm modal → create Razorpay order → pay → server verify → receipt.
   Checkout requires a signed-in user: orders belong to an account, and the
   payment endpoints are cookie-authenticated.
   No inline handlers, no globals beyond this file's init.
   =========================================================== */
(function () {
  "use strict";

  var MT = window.MTCheckout;
  var utils = MT.utils;
  var cartModule = MT.cart;
  var validation = MT.validation;
  var ui = MT.ui;
  var storage = MT.storage;
  var payment = MT.payment;

  var els = {};
  var state = {
    items: [],
    summary: null,
    user: null,
    coupon: null,  // the API's verdict on the entered code, see refreshCoupon()
    paying: false // guards against double submits / double charges
  };

  function grab() {
    els.message = document.getElementById("checkoutMessage");
    els.items = document.getElementById("checkoutItems");
    els.totals = document.getElementById("checkoutTotals");
    els.count = document.getElementById("checkoutCount");
    els.summaryWrap = document.getElementById("checkoutSummary");
    els.form = document.getElementById("checkoutForm");
    els.coupon = els.form ? els.form.querySelector('input[name="couponCode"]') : null;
    els.submit = els.form ? els.form.querySelector('button[type="submit"]') : null;
    els.codDesc = document.getElementById("codDesc");
  }

  function paymentMode() {
    var checked = els.form ? els.form.querySelector('input[name="paymentMode"]:checked') : null;
    return checked && checked.value === "cod" ? "cod" : "online";
  }

  function readAddress() {
    var fd = new FormData(els.form);
    return {
      fullName: String(fd.get("fullName") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      line1: String(fd.get("line1") || "").trim(),
      line2: String(fd.get("line2") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim(),
      postalCode: String(fd.get("postalCode") || "").trim()
    };
  }

  function currentCoupon() {
    return els.coupon ? els.coupon.value : "";
  }

  // Re-quote the coupon with the API, then repaint. Called when the coupon
  // field changes; the quote is cached in state so plain repaints (quantity,
  // payment mode) don't fire a request each time.
  function refreshCoupon() {
    var code = cartModule.normalizeCoupon(currentCoupon());
    if (!code) {
      state.coupon = null;
      recompute();
      return Promise.resolve(null);
    }
    if (state.coupon && state.coupon.code === code) {
      recompute();
      return Promise.resolve(state.coupon);
    }
    return cartModule.quoteCoupon(code, state.items).then(function (quote) {
      state.coupon = quote;
      recompute();
      return quote;
    });
  }

  // Recompute + repaint the summary. Single source of the totals calculation.
  function recompute() {
    state.summary = cartModule.computeSummary(state.items, {
      couponCode: currentCoupon(),
      coupon: state.coupon
    });
    ui.renderOrderSummary({
      itemsEl: els.items,
      totalsEl: els.totals,
      countEl: els.count,
      items: state.items,
      summary: state.summary
    });
    updateCodHint();
  }

  // Show the real split on the COD option. This is a preview only — the server
  // recomputes both figures and is the authority on what gets charged.
  function updateCodHint() {
    if (!els.codDesc || !state.summary) return;
    var total = Number(state.summary.total) || 0;
    els.codDesc.textContent =
      "No COD fee and nothing to pay now — the full " + utils.formatCurrency(total) +
      " is paid in cash on delivery.";
  }

  // Show the empty / broken cart state and stop — never redirect the user away.
  function renderBlocked(errors) {
    if (els.summaryWrap) els.summaryWrap.hidden = true;
    if (els.form) {
      // Disable the form so a broken cart can't be submitted.
      Array.prototype.forEach.call(els.form.elements, function (el) { el.disabled = true; });
    }
    ui.showErrors(els.message, errors);
    if (els.items) {
      els.items.innerHTML = '<div class="co-empty">' +
        '<p>Your cart needs attention before you can check out.</p>' +
        '<a class="btn btn-primary" href="cart.html">Go to Cart</a>' +
        "</div>";
    }
  }

  // Build the local receipt snapshot the return page renders from. The server
  // is the record of truth; this is only so payment.html can show the order
  // without another round trip.
  function buildLocalOrder(address, mode, serverResult, orderData) {
    var estimate = utils.deliveryEstimate(3, 5);
    var serverOrder = (serverResult && serverResult.order) || {};
    return {
      orderNumber: serverOrder.orderNumber || utils.generateOrderNumber(),
      createdAt: utils.nowISO(),
      status: "success",
      paymentMethod: payment.METHOD_LABELS[mode],
      paymentMode: mode,
      // For COD these describe the split the server actually recorded.
      advancePaid: serverOrder.advancePaid || 0,
      balanceDue: serverOrder.balanceDue || 0,
      razorpayPaymentId: serverOrder.razorpayPaymentId || "",
      // Digital plan entitlements granted by this purchase ("diet"/"workout"),
      // so the success screen knows whether to offer downloads.
      plans: (serverResult && serverResult.plans) || [],
      items: state.items.map(function (i) {
        return { id: i.id, name: i.name, qty: i.qty, weight: i.weight || "", weightLabel: i.weightLabel || "", unitPrice: i.unitPrice, lineTotal: i.lineTotal, imageUrl: i.imageUrl, color: i.color };
      }),
      summary: state.summary,
      customer: {
        name: address.fullName,
        phone: address.phone,
        email: state.user && state.user.email ? state.user.email : ""
      },
      shippingAddress: address,
      deliveryLabel: estimate.label
    };
  }

  // At this point the customer's money is already taken. Verification is what
  // turns that into an order, so a transient network failure here must not be
  // treated as "payment failed". The server keys off razorpay_payment_id and
  // returns the same order on repeat calls, so retrying is safe.
  function verifyWithRetry(sessionPayload, rzpResponse, attemptsLeft) {
    return payment.verifyPaymentWithServer(sessionPayload, rzpResponse)
      .catch(function (err) {
        // A 4xx is a real rejection (bad signature, stock gone) — don't retry.
        var transient = !err.status || err.status >= 500;
        if (transient && attemptsLeft > 0) {
          return new Promise(function (resolve) { setTimeout(resolve, 1500); })
            .then(function () { return verifyWithRetry(sessionPayload, rzpResponse, attemptsLeft - 1); });
        }
        // Out of retries with money taken — surface the payment id so the
        // customer has a reference for support instead of a dead end.
        if (transient) {
          err.paymentTaken = true;
          err.message = "Your payment went through, but we couldn't confirm the order automatically. " +
            "Please contact support with payment ID " + (rzpResponse.razorpay_payment_id || "unknown") + ".";
        }
        throw err;
      });
  }

  function onConfirm(handles) {
    if (state.paying) return;

    // Re-validate at the last moment: the cart could have changed in another tab.
    state.items = cartModule.load();
    recompute();
    var cartCheck = validation.validateCart(state.items);
    var totalCheck = validation.validateTotals(state.summary);
    if (!cartCheck.ok || !totalCheck.ok) {
      handles.showError((cartCheck.errors.concat(totalCheck.errors))[0] || "Your order is no longer valid.");
      return;
    }

    state.paying = true;
    handles.setBusy(true, "Starting secure payment…");

    var address = readAddress();
    var mode = paymentMode();
    var sessionPayload = payment.buildSessionPayload(state.items, currentCoupon(), address, mode);
    var orderData = null;

    // Cash on Delivery: no payment step — confirm the order directly and go
    // straight to the success page. The full amount is paid on delivery.
    if (mode === "cod") {
      handles.setBusy(true, "Placing your order…");
      payment.placeCodOrder(sessionPayload)
        .then(function (result) {
          var order = buildLocalOrder(address, mode, result, null);
          storage.saveOrder(order);
          try {
            if (typeof Cart !== "undefined" && Cart.save) Cart.save([]);
            else localStorage.setItem("mt_cart", "[]");
          } catch (e) { /* non-fatal — the order is already placed */ }
          window.location.href = "payment.html?status=success";
        })
        .catch(function (err) {
          state.paying = false;
          handles.setBusy(false);
          if (err && err.status === 401) {
            handles.showError("Your session expired. Please sign in again to complete the order.");
            return;
          }
          handles.showError((err && err.message) || "Could not place your order. Please try again.");
        });
      return;
    }

    payment.createOrder(sessionPayload)
      .then(function (data) {
        orderData = data;
        handles.setBusy(true, "Waiting for payment…");
        return payment.openCheckout(data, {
          prefill: {
            name: address.fullName,
            contact: address.phone,
            email: state.user && state.user.email ? state.user.email : ""
          }
        });
      })
      .then(function (rzpResponse) {
        handles.setBusy(true, "Verifying payment…");
        return verifyWithRetry(sessionPayload, rzpResponse, 3);
      })
      .then(function (result) {
        // Verified: the order exists server-side. Safe to clear the cart.
        var order = buildLocalOrder(address, mode, result, orderData);
        storage.saveOrder(order);
        // Cart.save also refreshes the header count; fall back to a direct
        // write if core.js isn't present for some reason.
        try {
          if (typeof Cart !== "undefined" && Cart.save) Cart.save([]);
          else localStorage.setItem("mt_cart", "[]");
        } catch (e) { /* non-fatal — the order is already placed */ }
        window.location.href = "payment.html?status=success";
      })
      .catch(function (err) {
        state.paying = false;
        handles.setBusy(false);

        // Session expired between page load and payment.
        if (err && err.status === 401) {
          handles.showError("Your session expired. Please sign in again to complete the order.");
          return;
        }
        // Customer closed the Razorpay modal — nothing was charged.
        if (err && err.dismissed) {
          handles.showError("Payment cancelled. Your cart is unchanged — you can try again.");
          return;
        }
        handles.showError((err && err.message) || "The payment could not be completed. Please try again.");
      });
  }

  function onSubmit(event) {
    event.preventDefault();
    if (state.paying) return;
    if (!state.user) { requireLogin(); return; }
    ui.clearErrors(els.message);

    // Validate cart + totals + address before opening the confirmation modal.
    state.items = cartModule.load();
    recompute();
    var cartCheck = validation.validateCart(state.items);
    if (!cartCheck.ok) { renderBlocked(cartCheck.errors); return; }
    var totalCheck = validation.validateTotals(state.summary);
    if (!totalCheck.ok) { ui.showErrors(els.message, totalCheck.errors); return; }
    var addressCheck = validation.validateAddress(readAddress());
    if (!addressCheck.ok) { ui.showErrors(els.message, addressCheck.errors); return; }

    var estimate = utils.deliveryEstimate(3, 5);
    var mode = paymentMode();
    // Preview of what's charged now. COD charges nothing up front — the whole
    // total is paid in cash on delivery.
    var payNow = mode === "cod" ? 0 : state.summary.total;
    ui.openConfirmModal({
      items: state.items,
      summary: state.summary,
      address: readAddress(),
      deliveryLabel: estimate.label,
      paymentMode: mode,
      payNow: payNow,
      onConfirm: onConfirm,
      onCancel: function () { /* stays on checkout; nothing to undo */ }
    });
  }

  // Orders belong to an account and the payment endpoints are authenticated,
  // so a logged-out visitor is sent to sign in and returned here afterwards.
  function requireLogin() {
    if (els.message) {
      els.message.hidden = false;
      els.message.setAttribute("role", "alert");
      els.message.className = "mt-alert mt-alert-error";
      els.message.innerHTML =
        '<div class="mt-alert-line">Please sign in to complete your order.</div>' +
        '<a class="btn btn-primary" href="login.html?next=checkout.html" style="margin-top:10px;">Sign In</a>';
    }
    if (els.form) {
      Array.prototype.forEach.call(els.form.elements, function (el) { el.disabled = true; });
    }
  }

  function init() {
    grab();
    if (!els.form) return;

    if (!storage.available()) {
      ui.showErrors(els.message,
        "Your browser has storage disabled, so we can't save your order. Enable cookies/site data and reload.");
    }

    state.items = cartModule.load();
    var cartCheck = validation.validateCart(state.items);
    if (!cartCheck.ok) { renderBlocked(cartCheck.errors); return; }

    recompute();

    // Resolve the session before allowing a submit, so we never open Razorpay
    // only to have the verify call 401.
    payment.currentUser().then(function (user) {
      state.user = user;
      if (!user) requireLogin();
    });
    var totalCheck = validation.validateTotals(state.summary);
    if (!totalCheck.ok) { ui.showErrors(els.message, totalCheck.errors); }

    if (els.coupon) {
      els.coupon.addEventListener("change", refreshCoupon);
      els.coupon.addEventListener("blur", refreshCoupon);
      // Carry over whatever the shopper already applied on the cart page.
      if (!els.coupon.value && typeof Store !== "undefined") {
        var carried = Store.get("mt_coupon", "");
        if (carried) els.coupon.value = carried;
      }
      if (els.coupon.value) refreshCoupon();
    }
    els.form.addEventListener("submit", onSubmit);
  }

  // Catalog + header come from data.js/core.js; wait for the catalog so product
  // lookups resolve, then init. Guard so an init error never blanks the page.
  document.addEventListener("DOMContentLoaded", function () {
    Promise.resolve(window.MT_CATALOG_READY).then(function () {
      try { init(); }
      catch (err) {
        var box = document.getElementById("checkoutMessage");
        if (box) ui.showErrors(box, "Something went wrong loading checkout. Please refresh and try again.");
      }
    });
  });
})();
