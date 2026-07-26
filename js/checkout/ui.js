/* ===========================================================
   MUSCLE TONIK — Checkout module: ui
   All DOM rendering for the checkout + return flow lives here:
   the order summary, the accessible confirmation modal, loading
   states, error banners, and the four return screens. Keeping it
   in one module means the orchestrators stay logic-only.
   =========================================================== */
window.MTCheckout = window.MTCheckout || {};

window.MTCheckout.ui = (function () {
  "use strict";

  var utils = window.MTCheckout.utils;
  var esc = utils.escapeHtml;
  var money = utils.formatCurrency;

  /* ---------- shared bits ---------- */

  function itemThumb(item) {
    if (item.imageUrl) {
      return '<img src="' + esc(item.imageUrl) + '" alt="' + esc(item.name) + '" loading="lazy">';
    }
    // Bottle placeholder, tinted with the product colour — mirrors core.js.
    var tone = esc(item.color || "#ff7a00");
    return '<svg width="46" height="56" viewBox="0 0 90 108" aria-hidden="true">' +
      '<rect x="20" y="14" width="50" height="80" rx="14" fill="' + tone + '"/>' +
      '<rect x="30" y="4" width="30" height="16" rx="6" fill="#111"/>' +
      '<rect x="25" y="42" width="40" height="22" rx="4" fill="rgba(255,255,255,.92)"/>' +
      "</svg>";
  }

  function spinner(label) {
    return '<span class="mt-spinner" role="status" aria-live="polite">' +
      '<span class="mt-spinner-ring" aria-hidden="true"></span>' +
      '<span class="mt-spinner-label">' + esc(label || "Please wait…") + "</span></span>";
  }

  /* ---------- error banner (non-blocking, never redirects) ---------- */

  // Renders one or more friendly messages into a container as an alert.
  function showErrors(container, errors) {
    if (!container) return;
    var list = Array.isArray(errors) ? errors : [errors];
    if (!list.length) { clearErrors(container); return; }
    container.hidden = false;
    container.setAttribute("role", "alert");
    container.className = "mt-alert mt-alert-error";
    container.innerHTML = list.map(function (msg) {
      return '<div class="mt-alert-line">' + esc(msg) + "</div>";
    }).join("");
  }

  function clearErrors(container) {
    if (!container) return;
    container.hidden = true;
    container.innerHTML = "";
  }

  /* ---------- order summary ---------- */

  function renderItems(container, items) {
    container.innerHTML = items.map(function (item) {
      return '' +
        '<div class="co-item">' +
          '<div class="co-item-thumb" style="background:' + esc(item.color || "#ff7a00") + '18;">' + itemThumb(item) + "</div>" +
          '<div class="co-item-info">' +
            '<h4>' + esc(item.name) + "</h4>" +
            (item.brand ? '<span class="co-item-brand">' + esc(item.brand) + "</span>" : "") +
            '<span class="co-item-meta">' + money(item.unitPrice) + " × " + item.qty + "</span>" +
          "</div>" +
          '<div class="co-item-total">' + money(item.lineTotal) + "</div>" +
        "</div>";
    }).join("");
  }

  function summaryRows(summary) {
    var rows = [
      '<div class="co-row"><span>Subtotal</span><span>' + money(summary.subtotal) + "</span></div>"
    ];
    if (summary.discount > 0) {
      rows.push('<div class="co-row co-row-discount"><span>Discount' +
        (summary.couponCode ? " (" + esc(summary.couponCode) + ")" : "") +
        "</span><span>- " + money(summary.discount) + "</span></div>");
    }
    rows.push('<div class="co-row"><span>GST (' + Math.round(summary.gstRate * 100) + '%)</span><span>' + money(summary.gst) + "</span></div>");
    rows.push('<div class="co-row"><span>Delivery</span><span>' +
      (summary.shipping === 0 ? '<em class="co-free">FREE</em>' : money(summary.shipping)) + "</span></div>");
    rows.push('<div class="co-row co-row-total"><span>Total</span><span>' + money(summary.total) + "</span></div>");
    return rows.join("");
  }

  // Full order summary: item list + totals. Used on the checkout page.
  function renderOrderSummary(opts) {
    if (opts.itemsEl) renderItems(opts.itemsEl, opts.items);
    if (opts.totalsEl) opts.totalsEl.innerHTML = summaryRows(opts.summary);
    if (opts.countEl) {
      opts.countEl.textContent = summary_countLabel(opts.summary.itemCount);
    }
  }

  function summary_countLabel(count) {
    return count + (count === 1 ? " item" : " items");
  }

  /* ---------- accessible confirmation modal ---------- */

  var activeModal = null;

  function trapFocus(modal, event) {
    if (event.key !== "Tab") return;
    var focusable = modal.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Builds and opens the confirmation modal. Returns handles so the caller can
  // drive the primary button into a loading state and close it on cancel.
  // config: { items, summary, address, deliveryLabel, onConfirm, onCancel }
  function openConfirmModal(config) {
    closeModal();

    var lastFocused = document.activeElement;
    var backdrop = document.createElement("div");
    backdrop.className = "mt-modal-backdrop";
    backdrop.innerHTML = '' +
      '<div class="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mtModalTitle">' +
        '<div class="mt-modal-head">' +
          '<h2 id="mtModalTitle">Confirm your order</h2>' +
          '<button type="button" class="mt-modal-close" data-mt-cancel aria-label="Close">&times;</button>' +
        "</div>" +
        '<div class="mt-modal-body">' +
          '<div class="mt-modal-items">' +
            config.items.map(function (item) {
              return '<div class="mt-modal-item"><span>' + esc(item.name) + ' × ' + item.qty +
                '</span><span>' + money(item.lineTotal) + "</span></div>";
            }).join("") +
          "</div>" +
          '<div class="mt-modal-totals">' + summaryRows(config.summary) + "</div>" +
          '<div class="mt-modal-facts">' +
            '<div class="mt-fact"><span class="mt-fact-k">Deliver to</span><span class="mt-fact-v">' +
              esc(config.address.fullName) + ", " + esc(config.address.line1) +
              (config.address.line2 ? ", " + esc(config.address.line2) : "") + ", " +
              esc(config.address.city) + ", " + esc(config.address.state) + " " + esc(config.address.postalCode) +
            "</span></div>" +
            '<div class="mt-fact"><span class="mt-fact-k">Payment method</span><span class="mt-fact-v">' +
              esc(window.MTCheckout.payment.METHOD_LABELS[config.paymentMode] || "") + "</span></div>" +
            '<div class="mt-fact"><span class="mt-fact-k">Estimated delivery</span><span class="mt-fact-v">' +
              esc(config.deliveryLabel) + "</span></div>" +
          "</div>" +
          '<div class="mt-modal-enter">' + (config.paymentMode === "cod"
            ? "You'll pay <strong>" + money(config.payNow) + "</strong> now to confirm this order. " +
              "The remaining <strong>" + money(config.summary.total - config.payNow) + "</strong> is due in cash on delivery."
            : "You'll pay <strong>" + money(config.payNow) + "</strong> securely via Razorpay.") + "</div>" +
          '<div class="mt-modal-error" data-mt-modal-error hidden></div>' +
        "</div>" +
        '<div class="mt-modal-foot">' +
          '<button type="button" class="btn btn-outline" data-mt-cancel>Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-mt-confirm>Pay Now · ' + money(config.payNow) + "</button>" +
        "</div>" +
      "</div>";

    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    var dialog = backdrop.querySelector(".mt-modal");
    var confirmBtn = backdrop.querySelector("[data-mt-confirm]");
    var cancelEls = backdrop.querySelectorAll("[data-mt-cancel]");
    var errorEl = backdrop.querySelector("[data-mt-modal-error]");

    function close() {
      closeModal();
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    }

    function onKeydown(event) {
      if (event.key === "Escape") { event.preventDefault(); doCancel(); }
      else trapFocus(dialog, event);
    }

    function doCancel() {
      if (config.onCancel) config.onCancel();
      close();
    }

    cancelEls.forEach(function (el) { el.addEventListener("click", doCancel); });
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) doCancel();
    });
    document.addEventListener("keydown", onKeydown);
    confirmBtn.addEventListener("click", function () {
      if (config.onConfirm) config.onConfirm(handles);
    });

    var handles = {
      close: close,
      setBusy: function (busy, label) {
        confirmBtn.disabled = busy;
        cancelEls.forEach(function (el) { el.disabled = busy; });
        confirmBtn.innerHTML = busy ? spinner(label || "Redirecting…") : "Continue Payment · " + money(config.summary.total);
      },
      showError: function (msg) {
        errorEl.hidden = false;
        errorEl.setAttribute("role", "alert");
        errorEl.textContent = msg;
      }
    };

    activeModal = { backdrop: backdrop, onKeydown: onKeydown };
    // Focus the confirm button so keyboard users act immediately.
    requestAnimationFrame(function () { confirmBtn.focus(); });
    return handles;
  }

  function closeModal() {
    if (!activeModal) return;
    document.removeEventListener("keydown", activeModal.onKeydown);
    if (activeModal.backdrop && activeModal.backdrop.parentNode) {
      activeModal.backdrop.parentNode.removeChild(activeModal.backdrop);
    }
    document.body.style.overflow = "";
    activeModal = null;
  }

  /* ---------- return screens ---------- */

  var CHECK_ICON = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var CROSS_ICON = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var WARN_ICON = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var CLOCK_ICON = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  function orderMetaBlock(order) {
    if (!order) return "";
    var rows = "";
    if (order.orderNumber) {
      rows += '<div class="co-row"><span>Order number</span><span><strong>' + esc(order.orderNumber) + "</strong></span></div>";
    }
    if (order.summary && Number.isFinite(order.summary.total)) {
      rows += '<div class="co-row"><span>Order total</span><span>' + money(order.summary.total) + "</span></div>";
    }
    // COD orders were only part-paid; show both halves so the customer knows
    // exactly what to hand over at the door.
    if (order.paymentMode === "cod" && Number(order.balanceDue) > 0) {
      rows += '<div class="co-row"><span>Paid online (advance)</span><span>' + money(order.advancePaid) + "</span></div>";
      rows += '<div class="co-row"><span><strong>Due on delivery</strong></span><span><strong>' +
        money(order.balanceDue) + "</strong></span></div>";
    }
    if (order.deliveryLabel) {
      rows += '<div class="co-row"><span>Estimated delivery</span><span>' + esc(order.deliveryLabel) + "</span></div>";
    }
    return rows ? '<div class="result-order">' + rows + "</div>" : "";
  }

  // Renders a status screen into `root`. `status` is one of:
  // pending | success | failed | cancelled | unknown. `handlers` wires the
  // buttons the orchestrator cares about (self-reported result, retry, etc.).
  function renderReturnScreen(root, status, order, handlers) {
    handlers = handlers || {};
    var html;

    if (status === "success") {
      var isCod = order && order.paymentMode === "cod";
      var plans = (order && order.plans) || [];
      html = screen({
        variant: "success", icon: CHECK_ICON,
        title: isCod ? "Order confirmed" : "Payment successful",
        text: isCod
          ? "Thank you! Your advance has been received and your order is confirmed. Please keep the balance ready in cash for delivery."
          : "Thank you! Your order has been placed. A confirmation will follow shortly.",
        order: order,
        // Plan downloads are rendered by return.js into this container, because
        // generating them is async (fonts + canvas) and must not block the screen.
        extra: plans.length
          ? '<div class="plan-delivery" id="planDelivery">' +
              '<h4>Your ' + (plans.length > 1 ? "plans are" : "plan is") + ' ready</h4>' +
              '<p>Download below — they are also saved to <a href="my-plans.html">My Plans</a> for life.</p>' +
              '<div class="plan-delivery-actions" id="planDeliveryActions"></div>' +
              '<p class="plan-delivery-hint" id="planDeliveryHint"></p>' +
            "</div>"
          : "",
        actions: [
          btn("primary", "continue", "Continue Shopping"),
          btn("outline", "invoice", "Download Invoice")
        ],
        note: "Keep your order number handy for any support queries."
      });
    } else if (status === "failed") {
      html = screen({
        variant: "fail", icon: CROSS_ICON,
        title: "Payment failed",
        text: "Your payment could not be completed. No money should have been deducted. You can try again.",
        order: order,
        actions: [
          btn("primary", "retry", "Retry Payment"),
          btn("outline", "cart", "Return to Cart"),
          btn("ghost", "support", "Contact Support")
        ]
      });
    } else if (status === "cancelled") {
      html = screen({
        variant: "warn", icon: WARN_ICON,
        title: "Payment cancelled",
        text: "You cancelled the payment, so no charge was made. Your cart is still saved.",
        order: order,
        actions: [
          btn("primary", "checkout", "Return to Checkout"),
          btn("outline", "continue", "Continue Shopping")
        ]
      });
    } else if (status === "pending") {
      // Payment now completes inside the Razorpay modal on checkout.html, so
      // this state is only reached by a stale link or an interrupted attempt.
      // We never ask the customer to self-report the result.
      html = screen({
        variant: "pending", icon: CLOCK_ICON,
        title: "Payment not completed",
        text: "We don't have a confirmed payment for this order. If you were charged, it will be confirmed automatically — otherwise you can return to checkout and try again.",
        order: order,
        actions: [
          btn("primary", "checkout", "Return to Checkout"),
          btn("ghost", "support", "Contact Support")
        ]
      });
    } else {
      html = screen({
        variant: "warn", icon: WARN_ICON,
        title: "We couldn't confirm your payment",
        text: "We don't have a record of this payment's result. If money was deducted, please contact support with your order number and it will be resolved.",
        order: order,
        actions: [
          btn("primary", "checkout", "Back to Checkout"),
          btn("ghost", "support", "Contact Support")
        ]
      });
    }

    root.innerHTML = html;

    // Wire whichever buttons this screen rendered.
    root.querySelectorAll("[data-action]").forEach(function (el) {
      var action = el.getAttribute("data-action");
      if (handlers[action]) {
        el.addEventListener("click", function (e) { handlers[action](e); });
      }
    });
  }

  function btn(kind, action, label) {
    var cls = kind === "primary" ? "btn btn-primary"
      : kind === "outline" ? "btn btn-outline"
      : "mt-linkbtn";
    return '<button type="button" class="' + cls + '" data-action="' + action + '">' + esc(label) + "</button>";
  }

  function screen(cfg) {
    return '' +
      '<div class="result-wrap">' +
        '<div class="result-icon ' + cfg.variant + '">' + cfg.icon + "</div>" +
        "<h1>" + esc(cfg.title) + "</h1>" +
        "<p>" + esc(cfg.text) + "</p>" +
        orderMetaBlock(cfg.order) +
        (cfg.extra || "") +
        '<div class="result-actions">' + cfg.actions.join("") + "</div>" +
        (cfg.note ? '<p class="result-note">' + esc(cfg.note) + "</p>" : "") +
      "</div>";
  }

  return {
    showErrors: showErrors,
    clearErrors: clearErrors,
    renderOrderSummary: renderOrderSummary,
    openConfirmModal: openConfirmModal,
    closeModal: closeModal,
    renderReturnScreen: renderReturnScreen,
    spinner: spinner
  };
})();
