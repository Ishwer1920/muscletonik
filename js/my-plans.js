/* ===========================================================
   MUSCLE TONIK — My Plans
   Lists the customer's purchased diet/workout plans and lets them
   re-download at any time. Entitlements and BMI snapshots come
   from the server, so access survives new devices, cleared
   storage, and logging out — that's what "for life" means.
   =========================================================== */
(function () {
  "use strict";

  function apiBase() {
    if (window.MT_API_BASE) return window.MT_API_BASE;
    return (window.location && window.location.origin ? window.location.origin : "") + "/api";
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Date and time of the transaction — customers use this to match a plan
  // against a bank statement, so the time matters as much as the date.
  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
        " at " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch (e) { return "—"; }
  }

  function state(html) {
    var root = document.getElementById("plansRoot");
    if (root) root.innerHTML = html;
  }

  function signedOut() {
    state(
      '<div class="plans-empty">' +
        "<h3>Sign in to see your plans</h3>" +
        "<p>Your purchased diet and workout plans are saved to your account.</p>" +
        '<a class="btn btn-primary" href="login.html?next=my-plans.html">Sign In</a>' +
      "</div>"
    );
  }

  function empty() {
    state(
      '<div class="plans-empty">' +
        "<h3>No plans yet</h3>" +
        "<p>Generate your BMI plan on the home page and unlock a personalised diet or workout plan. " +
        "Once purchased it stays here for life.</p>" +
        '<a class="btn btn-primary" href="index.html#bmi">Get my plan</a>' +
      "</div>"
    );
  }

  // The server stores one entitlement per kind. A combo purchase produces two
  // rows sharing an orderNumber — group them so the customer sees one card with
  // a single combined download, matching what they bought.
  function groupByOrder(plans) {
    var byOrder = new Map();
    plans.forEach(function (p) {
      // Purchases group by order. Comped admin plans have no order number, so
      // they'd otherwise split into one card per kind — group them together.
      var key = p.orderNumber || ("comp:" + (p.source || "admin_comp"));
      if (!byOrder.has(key)) {
        byOrder.set(key, {
          orderNumber: p.orderNumber, purchasedAt: p.purchasedAt,
          snapshot: p.snapshot, source: p.source, kinds: []
        });
      }
      byOrder.get(key).kinds.push(p.kind);
    });
    // Stable order: diet before workout, so the combined doc reads consistently.
    var out = [...byOrder.values()];
    out.forEach(function (g) {
      g.kinds.sort(function (a, b) { return a === "diet" ? -1 : b === "diet" ? 1 : 0; });
    });
    return out;
  }

  function titleFor(kinds) {
    if (kinds.length > 1) return "Diet + Workout Plan";
    return kinds[0] === "workout" ? "Workout Plan" : "Diet Plan";
  }

  function render(groups) {
    var html = '<div class="plans-grid">' + groups.map(function (g, i) {
      var s = g.snapshot || {};
      var comped = g.source === "admin_comp";
      return '<article class="plan-owned">' +
        '<div class="plan-owned-head">' +
          "<h3>" + esc(titleFor(g.kinds)) +
            (comped ? ' <span class="plan-owned-badge">Admin — free</span>' : "") + "</h3>" +
        "</div>" +
        '<div class="plan-owned-meta">' +
          '<div class="is-wide"><span>' + (comped ? "Unlocked on" : "Payment completed") + "</span><strong>" +
            esc(fmtDateTime(g.purchasedAt)) + "</strong></div>" +
          '<div><span>BMI at purchase</span><strong>' + esc(s.bmi || "—") + "</strong></div>" +
          '<div><span>Category</span><strong>' + esc(s.bandLabel || "—") + "</strong></div>" +
          '<div><span>Height / Weight</span><strong>' + esc(s.height || "—") + " cm / " + esc(s.weight || "—") + " kg</strong></div>" +
          '<div><span>Order</span><strong>' + esc(g.orderNumber || (comped ? "Complimentary" : "—")) + "</strong></div>" +
        "</div>" +
        '<div class="plan-owned-actions" id="planActions' + i + '"></div>' +
        '<p class="plan-owned-hint" id="planHint' + i + '"></p>' +
      "</article>";
    }).join("") + "</div>";

    state(html);

    groups.forEach(function (g, i) {
      window.MTPlanDownload.render(
        document.getElementById("planActions" + i),
        g.snapshot, g.kinds, g.purchasedAt,
        document.getElementById("planHint" + i)
      );
    });
  }

  function load() {
    fetch(apiBase() + "/plans/mine", { credentials: "include" })
      .then(function (res) {
        if (res.status === 401) { signedOut(); return null; }
        if (!res.ok) throw new Error("Could not load your plans.");
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        var plans = data.plans || [];
        if (!plans.length) { empty(); return; }
        render(groupByOrder(plans));
      })
      .catch(function () {
        state('<div class="plans-empty"><h3>Something went wrong</h3>' +
          "<p>We couldn't load your plans. Please refresh and try again.</p></div>");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Wait for the catalog so supplement suggestions resolve inside the exports.
    Promise.resolve(window.MT_CATALOG_READY).then(load, load);
  });
})();
