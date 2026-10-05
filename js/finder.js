/* ===========================================================
   MUSCLE TONIK - Smart Supplement Finder
   A 4-step quiz that recommends REAL catalogue products by
   mapping a goal to existing categories, then picking the
   top-rated in-stock product in each. No fake products, no
   invented prices, no medical claims. Uses PRODUCTS/CATEGORIES
   /Cart already loaded by data.js + core.js.
   =========================================================== */
(function () {
  // Goal -> ordered list of REAL category ids (see /api/catalog categories).
  const GOALS = [
    { id: "muscle", label: "Muscle Gain", icon: "🏋️", cats: ["whey-protein", "creatine", "mass-gainer"] },
    { id: "strength", label: "Strength", icon: "💪", cats: ["creatine", "pre-workout", "whey-protein"] },
    { id: "fatloss", label: "Fat Loss", icon: "🔥", cats: ["whey-protein", "fat-burner", "greens"] },
    { id: "recovery", label: "Recovery", icon: "🧘", cats: ["whey-protein", "bcaa", "casein"] },
    { id: "energy", label: "Energy", icon: "⚡", cats: ["pre-workout", "electrolytes", "vitamins"] },
    { id: "general", label: "General Fitness", icon: "✅", cats: ["whey-protein", "vitamins", "fish-oil"] }
  ];
  const EXPERIENCE = [{ id: "beginner", label: "Beginner" }, { id: "intermediate", label: "Intermediate" }, { id: "advanced", label: "Advanced" }];
  const FREQ = [{ id: "1-2", label: "1–2 days" }, { id: "3-4", label: "3–4 days" }, { id: "5plus", label: "5+ days" }];
  const PREF = [{ id: "none", label: "No preference" }, { id: "plant", label: "Plant-based" }];

  // Non-medical, category-role reasons. Deliberately avoids health claims.
  const CAT_REASON = {
    "whey-protein": "A fast-digesting protein base to help you hit your daily intake.",
    "plant-protein": "A plant-based protein base to help you hit your daily intake.",
    "creatine": "One of the most researched supplements for strength and power training.",
    "pre-workout": "An energy and focus kick before tougher sessions.",
    "mass-gainer": "Extra calories for when eating enough from food alone is hard.",
    "fat-burner": "A support option to use alongside a calorie-controlled diet.",
    "greens": "A convenient top-up of greens and superfoods for everyday nutrition.",
    "bcaa": "Aminos to sip around your training sessions.",
    "casein": "A slow-digesting protein, popular for longer gaps between meals.",
    "electrolytes": "Replaces what you sweat out during intense training.",
    "vitamins": "Covers everyday micronutrient gaps in a busy routine.",
    "fish-oil": "A staple omega-3 for all-round wellness."
  };

  const STEPS = [
    { key: "goal", q: "What's your main goal?", opts: GOALS, grid: true },
    { key: "experience", q: "What's your experience level?", opts: EXPERIENCE },
    { key: "freq", q: "How often do you train?", opts: FREQ },
    { key: "pref", q: "Any dietary preference?", opts: PREF }
  ];

  let answers = { goal: null, experience: null, freq: null, pref: null };
  let step = 0;

  function mount() { return document.getElementById("finderApp"); }
  function freqLabel() { const f = FREQ.find(x => x.id === answers.freq); return f ? f.label.toLowerCase() : "regularly"; }

  function render() {
    const el = mount();
    if (!el) return;
    if (step >= STEPS.length) { renderResult(el); return; }
    const s = STEPS[step];
    el.innerHTML =
      '<div class="finder-steps">' + STEPS.map((x, i) => '<span class="' + (i <= step ? "on" : "") + '"></span>').join("") + "</div>" +
      '<div class="finder-count">Step ' + (step + 1) + " of " + STEPS.length + "</div>" +
      '<h3 class="finder-h">' + s.q + "</h3>" +
      '<div class="finder-opts' + (s.grid ? " is-grid" : "") + '">' + s.opts.map(o =>
        '<button type="button" class="finder-opt' + (answers[s.key] === o.id ? " active" : "") + '" data-val="' + o.id + '">' +
          (o.icon ? '<span class="finder-opt-ic">' + o.icon + "</span>" : "") + "<span>" + o.label + "</span>" +
        "</button>").join("") + "</div>" +
      '<div class="finder-nav">' + (step > 0 ? '<button type="button" class="btn btn-outline btn-sm" id="finderBack">← Back</button>' : "<span></span>") + "</div>";
    el.querySelectorAll(".finder-opt").forEach(b => b.addEventListener("click", () => { answers[s.key] = b.dataset.val; step++; render(); }));
    const back = document.getElementById("finderBack");
    if (back) back.addEventListener("click", () => { step = Math.max(0, step - 1); render(); });
  }

  function pickProducts() {
    const goal = GOALS.find(g => g.id === answers.goal) || GOALS[0];
    let cats = goal.cats.slice();
    if (answers.pref === "plant") cats = cats.map(c => (c === "whey-protein" ? "plant-protein" : c));

    let n = 2;
    if (answers.freq === "3-4" || answers.freq === "5plus") n = 3;
    if (answers.experience === "advanced") n = Math.min(n + 1, 4);
    if (answers.experience === "beginner") n = Math.min(n, 2);

    const list = (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) ? PRODUCTS : [];
    const out = [];
    const used = new Set();
    cats.forEach(cat => {
      if (out.length >= n) return;
      const cands = list.filter(p =>
        p.category === cat && !p.hidden && (p.status ? p.status === "active" : true) &&
        !used.has(p.id) && (p.stock == null || Number(p.stock) > 0));
      cands.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(b.reviews) || 0) - (Number(a.reviews) || 0));
      if (cands.length) { out.push({ product: cands[0], reason: CAT_REASON[cat] || "A solid pick for your goal." }); used.add(cands[0].id); }
    });
    // If a goal's categories are sparse, top up with the catalogue's best-rated.
    if (!out.length) {
      list.filter(p => !p.hidden && (p.status ? p.status === "active" : true))
        .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
        .slice(0, n)
        .forEach(p => out.push({ product: p, reason: "A popular pick to get you started." }));
    }
    return out;
  }

  function finderCard(x) {
    const p = x.product;
    const brand = (typeof getBrandById === "function") ? getBrandById(p.brand) : null;
    return '<div class="finder-card">' +
      '<a class="finder-card-media" style="background:' + (p.color || "#ff7a00") + '18" href="product.html?id=' + p.id + '">' +
        (typeof productImage === "function" ? productImage(p) : "") + "</a>" +
      '<div class="finder-card-body">' +
        '<span class="finder-card-brand">' + (brand ? escapeHtml(brand.name) : "") + "</span>" +
        '<a class="finder-card-name" href="product.html?id=' + p.id + '">' + escapeHtml(p.name) + "</a>" +
        (p.rating ? '<div class="finder-card-rate">' + starString(p.rating) + " " + p.rating + "</div>" : "") +
        '<p class="finder-why">' + escapeHtml(x.reason) + "</p>" +
        '<div class="finder-card-foot"><span class="finder-card-price">' + formatINR(p.price) + "</span>" +
          '<button type="button" class="btn btn-dark btn-sm" data-add="' + p.id + '">Add</button></div>' +
      "</div></div>";
  }

  function renderResult(el) {
    const picks = pickProducts();
    const total = picks.reduce((s, x) => s + (Number(x.product.price) || 0), 0);
    const goal = GOALS.find(g => g.id === answers.goal);
    el.innerHTML =
      '<div class="finder-result-head"><span class="eyebrow">Your Muscle Tonik stack</span>' +
        "<h3>" + (goal ? escapeHtml(goal.label) : "Your") + " essentials</h3>" +
        "<p>Hand-picked from our catalogue for " + (answers.experience ? "a " + escapeHtml(answers.experience) : "a") + " lifter training " + escapeHtml(freqLabel()) + ".</p></div>" +
      (picks.length
        ? '<div class="finder-stack">' + picks.map(finderCard).join("") + "</div>" +
          '<div class="finder-foot"><div class="finder-total">Stack total <b>' + formatINR(total) + "</b></div>" +
          '<div class="finder-foot-actions"><button type="button" class="btn btn-outline btn-sm" id="finderRestart">Start over</button>' +
          '<button type="button" class="btn btn-primary" id="finderAddAll">Add all to cart</button></div></div>'
        : '<p class="finder-empty">No matching products in stock right now. Browse the full range on the <a href="marketplace.html">shop</a>.<br><button type="button" class="btn btn-outline btn-sm" id="finderRestart" style="margin-top:12px;">Start over</button></p>');

    const restart = document.getElementById("finderRestart");
    if (restart) restart.addEventListener("click", () => { answers = { goal: null, experience: null, freq: null, pref: null }; step = 0; render(); });
    const addAll = document.getElementById("finderAddAll");
    if (addAll) addAll.addEventListener("click", () => {
      picks.forEach(x => { if (typeof Cart !== "undefined") Cart.add(x.product.id, 1, ""); });
      if (typeof showToast === "function") showToast("Added " + picks.length + " product" + (picks.length === 1 ? "" : "s") + " to cart");
      if (typeof openCartDrawer === "function") openCartDrawer();
    });
    el.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => {
      if (typeof Cart !== "undefined") Cart.add(Number(b.dataset.add), 1, "");
      if (typeof showToast === "function") showToast("Added to cart");
    }));
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!mount()) return;
    await Promise.resolve(window.MT_CATALOG_READY);
    render();
  });
})();
