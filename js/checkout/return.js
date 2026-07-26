/* ===========================================================
   MUSCLE TONIK — Payment return page orchestrator
   Drives payment.html after checkout completes. Payment now happens
   in the Razorpay modal on checkout.html and is confirmed server-side
   before we ever navigate here, so ?status=success means the server
   verified the signature and created the order — it is never
   self-reported by the customer.
   =========================================================== */
(function () {
  "use strict";

  var MT = window.MTCheckout;
  var ui = MT.ui;
  var storage = MT.storage;

  var VALID = ["pending", "success", "failed", "cancelled", "unknown"];
  var SUPPORT_EMAIL = "support@muscletonik.local";

  function readStatus() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("status");
    var status = String(raw || "").toLowerCase();
    return {
      hasParam: raw !== null,
      status: VALID.indexOf(status) === -1 ? "unknown" : status,
      popupBlocked: params.get("popup") === "blocked"
    };
  }

  function render(status, order) {
    var root = document.getElementById("returnRoot");
    if (!root) return;

    ui.renderReturnScreen(root, status, order, {
      // There is deliberately no "I have paid" action any more: payment state
      // comes from the server's signature verification, never from the customer.

      // success-screen actions
      continue: function () { window.location.href = "marketplace.html"; },
      invoice: function () {
        // PLACEHOLDER: invoice generation belongs server-side (a signed PDF from
        // the order record). For now, tell the customer it's coming.
        if (typeof showToast === "function") showToast("Invoice download will be available soon.");
      },

      // failed / cancelled / unknown actions
      retry: function () { window.location.href = "checkout.html"; },
      checkout: function () { window.location.href = "checkout.html"; },
      cart: function () { window.location.href = "cart.html"; },
      support: function () {
        window.location.href = "mailto:" + SUPPORT_EMAIL +
          "?subject=" + encodeURIComponent("Payment help — " + ((order && order.orderNumber) || "order"));
      }
    });

    // Must run after renderReturnScreen — it replaces root's innerHTML, so the
    // delivery container only exists once that has run.
    renderPlanDownloads(order);
  }

  // Offer the purchased plan(s) immediately on the success screen. The
  // entitlement is already stored server-side, so this is convenience, not the
  // only chance to get the file.
  function renderPlanDownloads(order) {
    var kinds = ((order && order.plans) || []).slice();
    if (!kinds.length) return;

    var actions = document.getElementById("planDeliveryActions");
    var hint = document.getElementById("planDeliveryHint");
    if (!actions || !window.MTPlanDownload) return;

    var snap = readBmiSnapshot();
    if (!snap || !snap.bandId) {
      // Entitlement exists but we have no local inputs to render from — send
      // them to My Plans, which reads the snapshot the server stored.
      actions.innerHTML = '<a class="btn btn-primary" href="my-plans.html">Open My Plans</a>';
      if (hint) hint.textContent = "Your plan is saved to your account.";
      return;
    }

    // "both" is stored as two entitlements; render one combined document.
    window.MTPlanDownload.render(actions, snap, kinds, order.createdAt, hint);
  }

  function readBmiSnapshot() {
    try { return JSON.parse(localStorage.getItem("mt_bmi_snapshot") || "null"); }
    catch (e) { return null; }
  }

  function init() {
    var info = readStatus();
    var order = storage.getOrder();

    // Landing here with no ?status (e.g. a direct visit or a bookmark) — reflect
    // the stored order's own status rather than defaulting to "unknown".
    var status = info.status;
    if (!info.hasParam) {
      status = (order && VALID.indexOf(order.status) !== -1) ? order.status : "unknown";
    }

    // If we're told the payment succeeded/cancelled but have no order at all,
    // we can't show meaningful details — fall back to "unknown".
    if ((status === "success" || status === "failed" || status === "cancelled") && !order) {
      status = "unknown";
    }

    // On a fresh success/cancel arriving via URL, reconcile the stored status
    // and clear the cart on success so the header count updates.
    if (status === "success" && order && order.status !== "success") {
      order = storage.patchOrder({ status: "success", confirmedAt: MT.utils.nowISO() }) || order;
      if (typeof Cart !== "undefined") { try { Cart.clear(); } catch (e) {} }
    } else if ((status === "failed" || status === "cancelled") && order && order.status === "pending") {
      order = storage.patchOrder({ status: status, confirmedAt: MT.utils.nowISO() }) || order;
    }

    render(status, order);
  }

  document.addEventListener("DOMContentLoaded", function () {
    Promise.resolve(window.MT_CATALOG_READY).then(function () {
      try { init(); }
      catch (err) {
        var root = document.getElementById("returnRoot");
        if (root) ui.renderReturnScreen(root, "unknown", null, {
          checkout: function () { window.location.href = "checkout.html"; }
        });
      }
    });
  });
})();
