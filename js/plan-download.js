/* ===========================================================
   MUSCLE TONIK — Plan download widget
   Renders "Save as Image" / "Download PDF" buttons for a
   purchased plan and wires them to the exporters. Shared by the
   post-payment success screen and the My Plans page so both
   produce byte-identical files.
   =========================================================== */
window.MTPlanDownload = (function () {
  "use strict";

  // Pick supplement suggestions for the plan document, round-robin across the
  // mapped categories so the list isn't several variants of one product.
  function pickProducts(categories, limit) {
    if (typeof PRODUCTS === "undefined" || !Array.isArray(PRODUCTS)) return [];
    var buckets = categories.map(function (cat) {
      return PRODUCTS
        .filter(function (p) { return p.category === cat && !p.hidden; })
        .sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
    });
    var picked = [], round = 0;
    while (picked.length < limit && round < 10) {
      var added = false;
      for (var i = 0; i < buckets.length && picked.length < limit; i++) {
        var p = buckets[i][round];
        if (p) { picked.push(p); added = true; }
      }
      if (!added) break;
      round++;
    }
    return picked;
  }

  function buildDoc(snapshot, kinds, purchasedAt) {
    var cats = window.MTPlanContent.categoriesFor(snapshot.bandId, snapshot.goal);
    return window.MTPlanExport.buildDoc(snapshot, kinds, pickProducts(cats, 6), purchasedAt);
  }

  function fileBase(kinds, snapshot) {
    var label = kinds.length > 1 ? "diet-workout" : kinds[0];
    return "muscle-tonik-" + label + "-plan-" + (snapshot.bandId || "plan");
  }

  // container: element to fill. kinds: ["diet"] | ["workout"] | both.
  // hintEl: optional element for the save/share status line.
  function render(container, snapshot, kinds, purchasedAt, hintEl) {
    if (!container) return;

    container.innerHTML =
      '<button type="button" class="btn btn-primary" data-plan-img>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' +
        "<span>Save as Image</span></button>" +
      '<button type="button" class="btn btn-outline" data-plan-pdf>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        "<span>Download PDF</span></button>";

    function setHint(msg) { if (hintEl) hintEl.textContent = msg || ""; }

    function save(button, exporter, ext, busyLabel) {
      if (button.disabled) return;
      var original = button.innerHTML;
      button.disabled = true;
      button.textContent = busyLabel;
      setHint("");

      Promise.resolve()
        .then(function () { return exporter(buildDoc(snapshot, kinds, purchasedAt)); })
        .then(function (blob) {
          return window.MTPlanExport.saveOrShare(
            blob, fileBase(kinds, snapshot) + ext, "My Muscle Tonik plan");
        })
        .then(function (outcome) {
          if (outcome === "shared") setHint("Saved. Choose “Save Image” in the share sheet to add it to your gallery.");
          else if (outcome === "cancelled") setHint("");
          else setHint("Saved to your device's Downloads folder.");
          if (typeof showToast === "function" && outcome !== "cancelled") showToast("Plan saved.");
        })
        .catch(function (err) {
          setHint("Sorry — the file could not be created. Please try again.");
          if (window.console) console.error("[plan] export failed:", err);
        })
        .then(function () {
          button.disabled = false;
          button.innerHTML = original;
        });
    }

    var img = container.querySelector("[data-plan-img]");
    var pdf = container.querySelector("[data-plan-pdf]");
    img.addEventListener("click", function () {
      save(img, window.MTPlanExport.exportPng, ".png", "Creating image…");
    });
    pdf.addEventListener("click", function () {
      save(pdf, window.MTPlanExport.exportPdf, ".pdf", "Creating PDF…");
    });

    if (window.MTPlanExport.canShareFiles()) {
      setHint("Tip: choose “Save Image” in the share sheet to add the plan to your gallery.");
    }
  }

  return { render: render, buildDoc: buildDoc, pickProducts: pickProducts };
})();
