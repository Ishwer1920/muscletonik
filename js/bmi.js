/* ===========================================================
   MUSCLE TONIK — BMI plan funnel (home page)

   The customer enters height/weight, we compute the BMI locally,
   then present the three paid plans. Per the paywall decision the
   BMI figure itself is NOT shown before purchase — the inputs are
   only captured so the purchased plan can be built from them.

   The snapshot is stored locally and attached to the checkout
   payload; after payment the server writes it to a UserPlan
   entitlement, which is what makes the plan permanent.
   =========================================================== */
(function () {
  "use strict";

  var SNAPSHOT_KEY = "mt_bmi_snapshot";

  var els = {};
  // Set from GET /plans/mine, which reports whether the signed-in role
  // (admin / super_admin) is comped. The server enforces it regardless.
  var canClaimFree = false;

  function grab() {
    els.form = document.getElementById("bmiForm");
    els.height = document.getElementById("bmiHeight");
    els.weight = document.getElementById("bmiWeight");
    els.goal = document.getElementById("bmiGoal");
    els.error = document.getElementById("bmiError");
    els.result = document.getElementById("bmiResult");
    els.codDesc = document.getElementById("codDesc");
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function showError(msg) {
    if (!els.error) return;
    els.error.hidden = false;
    els.error.textContent = msg;
  }
  function clearError() {
    if (!els.error) return;
    els.error.hidden = true;
    els.error.textContent = "";
  }

  // Persist so checkout can attach it, and so a page reload doesn't lose the
  // inputs between "Generate" and "Pay".
  function saveSnapshot(snap) {
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch (e) { /* non-fatal */ }
  }
  function readSnapshot() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null"); } catch (e) { return null; }
  }

  function money(n) {
    return "Rs " + Number(n || 0).toLocaleString("en-IN");
  }

  // The three plan products come from the catalog as hidden products, so their
  // prices are whatever the admin sets — never hardcoded here.
  function planCards(snap) {
    var plans = (typeof getPlanProducts === "function" ? getPlanProducts() : [])
      .slice()
      .sort(function (a, b) { return a.price - b.price; });

    if (!plans.length) {
      return '<div class="bmi-plan-empty">Plans are unavailable right now. Please try again shortly.</div>';
    }

    var order = { diet: 0, workout: 1, both: 2 };
    plans.sort(function (a, b) { return (order[a.planType] ?? 9) - (order[b.planType] ?? 9); });

    return '<div class="plan-cards">' + plans.map(function (p) {
      var best = p.planType === "both";
      var save = p.oldPrice > p.price
        ? '<span class="plan-card-save">Save ' + money(p.oldPrice - p.price) + "</span>" : "";
      return '<div class="plan-card' + (best ? " is-best" : "") + '">' +
        (best ? '<span class="plan-card-tag">Best Value</span>' : "") +
        '<h4 class="plan-card-name">' + esc(p.name) + "</h4>" +
        '<p class="plan-card-desc">' + esc(p.short || "") + "</p>" +
        '<div class="plan-card-price"><span class="now">' + money(p.price) + "</span>" +
          (p.oldPrice > p.price ? '<span class="was">' + money(p.oldPrice) + "</span>" : "") +
          save + "</div>" +
        '<button type="button" class="btn ' + (best ? "btn-primary" : "btn-outline") +
          '" data-pay-plan="' + p.id + '">PAY ' + money(p.price) + "</button>" +
      "</div>";
    }).join("") + "</div>";
  }

  function renderOffer(snap) {
    if (!els.result) return;
    els.result.hidden = false;
    els.result.innerHTML =
      '<div class="plan-offer-head">' +
        "<h3>Your plan is ready</h3>" +
        "<p>We've built your plan from your height, weight and goal. " +
        "Choose what you'd like unlocked — it's delivered as a PDF and image the moment " +
        "payment completes, and saved to <strong>My Plans</strong> for life.</p>" +
      "</div>" +
      planCards(snap) +
      (canClaimFree
        ? '<div class="plan-comp">' +
            "<span>You're signed in as an admin — all plans are free on your account.</span>" +
            '<button type="button" class="btn btn-dark" data-claim-free>Unlock Free</button>' +
          "</div>"
        : "") +
      '<div class="plan-offer-note" id="planOfferNote"></div>' +
      '<p class="bmi-disclaimer">Plans are general wellness guidance, not medical advice. ' +
        "Consult a doctor or registered dietitian before changing your diet or starting a new " +
        "exercise programme, especially if you are pregnant, managing a health condition, or " +
        "taking medication.</p>";

    els.result.querySelectorAll("[data-pay-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        // Re-save first: the form may have been edited after generating.
        saveSnapshot(snap);
        payForPlan(Number(btn.getAttribute("data-pay-plan")), btn, snap);
      });
    });

    var free = els.result.querySelector("[data-claim-free]");
    if (free) free.addEventListener("click", function () { claimFree(free, snap); });

    els.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setNote(html) {
    var note = document.getElementById("planOfferNote");
    if (note) note.innerHTML = html || "";
  }

  function busy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  // Buy a single plan without going through the cart: create the Razorpay order
  // for just this item, take payment, verify, then send them to My Plans.
  // Digital goods only — the server rejects COD for these outright.
  function payForPlan(planId, btn, snap) {
    var P = window.MTCheckout && window.MTCheckout.payment;
    if (!P) { setNote('<div class="plan-error">Payment is unavailable right now.</div>'); return; }

    busy(btn, true, "Starting…");
    setNote("");

    var sessionPayload = P.buildSessionPayload([{ id: planId, qty: 1 }], "", {}, "online");

    P.currentUser()
      .then(function (user) {
        if (!user) {
          // Checkout is authenticated; bounce to login and come back here.
          var next = encodeURIComponent("index.html#bmi");
          window.location.href = "login.html?next=" + next;
          throw { handled: true };
        }
        return P.createOrder(sessionPayload);
      })
      .then(function (orderData) {
        busy(btn, true, "Waiting for payment…");
        return P.openCheckout(orderData, {
          prefill: { name: "", email: "", contact: "" }
        });
      })
      .then(function (rzp) {
        busy(btn, true, "Verifying…");
        return P.verifyPaymentWithServer(sessionPayload, rzp);
      })
      .then(function () {
        setNote('<div class="plan-added">Payment complete. Your plan is unlocked — ' +
          'opening <a href="my-plans.html">My Plans</a>…</div>');
        window.location.href = "my-plans.html";
      })
      .catch(function (err) {
        if (err && err.handled) return;
        busy(btn, false);
        if (err && err.dismissed) {
          setNote('<div class="plan-error">Payment cancelled — nothing was charged.</div>');
        } else if (err && err.status === 401) {
          setNote('<div class="plan-error">Your session expired. ' +
            '<a href="login.html?next=index.html">Sign in again</a> to continue.</div>');
        } else {
          setNote('<div class="plan-error">' +
            esc((err && err.message) || "The payment could not be completed. Please try again.") +
            "</div>");
        }
      });
  }

  // Admins and super admins get the plans free. The server re-checks the role
  // from the JWT, so this button is a convenience, not the access control.
  function claimFree(btn, snap) {
    busy(btn, true, "Unlocking…");
    var base = (window.MTCheckout && window.MTCheckout.payment)
      ? window.MTCheckout.payment.apiBase()
      : (window.location.origin + "/api");

    fetch(base + "/plans/claim-free", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bmiSnapshot: snap })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.message || "Could not unlock the plans.");
        setNote('<div class="plan-added">Unlocked free on your admin account — ' +
          'opening <a href="my-plans.html">My Plans</a>…</div>');
        window.location.href = "my-plans.html";
      })
      .catch(function (err) {
        busy(btn, false);
        setNote('<div class="plan-error">' + esc(err.message) + "</div>");
      });
  }

  function onSubmit(event) {
    event.preventDefault();
    clearError();

    var h = parseFloat(els.height.value);
    var w = parseFloat(els.weight.value);

    if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) {
      showError("Please enter both your height and weight.");
      return;
    }
    if (h < 80 || h > 250) { showError("Please enter a height between 80 cm and 250 cm."); return; }
    if (w < 20 || w > 400) { showError("Please enter a weight between 20 kg and 400 kg."); return; }

    var C = window.MTPlanContent;
    var heightM = h / 100;
    var bmi = w / (heightM * heightM);
    var band = C.bandFor(bmi);
    var range = C.healthyRange(h);

    var snap = {
      height: Math.round(h * 10) / 10,
      weight: Math.round(w * 10) / 10,
      bmi: Math.round(bmi * 10) / 10,
      bandId: band.id,
      bandLabel: band.label,
      goal: els.goal ? els.goal.value : "auto",
      rangeLow: range.low,
      rangeHigh: range.high
    };

    saveSnapshot(snap);
    renderOffer(snap);
  }

  function init() {
    grab();
    if (!els.form) return;
    els.form.addEventListener("submit", onSubmit);

    // Resolve comp eligibility up front so the offer renders correctly the
    // first time. Silently false for guests and ordinary customers.
    var P = window.MTCheckout && window.MTCheckout.payment;
    if (P) {
      fetch(P.apiBase() + "/plans/mine", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { canClaimFree = !!(d && d.canClaimFree); })
        .catch(function () { /* not signed in — leave false */ });
    }

    // Restore the inputs if they generated earlier and came back.
    var prev = readSnapshot();
    if (prev && els.height && !els.height.value) {
      els.height.value = prev.height || "";
      els.weight.value = prev.weight || "";
      if (els.goal && prev.goal) els.goal.value = prev.goal;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    Promise.resolve(window.MT_CATALOG_READY).then(init, init);
  });
})();
