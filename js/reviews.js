/* ===========================================================
   MUSCLE TONIK - Product ratings & reviews

   Two entry points, sharing one star widget:

     MTReviews.mountProduct(catalogId)  - the Reviews tab on product.html:
       rating summary, the approved review list, and a form to leave a
       rating (1-5) with an optional written review. Rating is allowed
       before or after buying; only a real order earns the "Verified
       purchase" badge, which the server decides - never the client.

     MTReviews.openOrderPrompt(order)   - the post-order pop-up: rate the
       service, optionally say more, and star-rate each product just bought.
       Dismissable with the X in the corner, and never shown twice for the
       same order.

   Submissions are held for admin approval, so nothing written here reaches
   the storefront until someone signs it off in Admin -> Reviews.
   =========================================================== */
(function () {
  "use strict";

  var SKIP_KEY = "mt_feedback_skipped";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function signedIn() {
    try { return !!Store.get("mt_user", null); } catch (e) { return false; }
  }

  /* ---------- star widget ---------- */

  // An accessible radio group styled as stars. Returns markup; read the value
  // back with readStars(root, name).
  function starsInput(name, value) {
    var out = '<div class="mt-stars-input" role="radiogroup" aria-label="Rating out of 5" data-stars="' + esc(name) + '">';
    for (var i = 1; i <= 5; i++) {
      out += '<label class="mt-star' + (value >= i ? " is-on" : "") + '">' +
        '<input type="radio" name="' + esc(name) + '" value="' + i + '"' + (value === i ? " checked" : "") + '>' +
        '<span aria-hidden="true">★</span>' +
        '<span class="mt-star-text">' + i + " star" + (i === 1 ? "" : "s") + "</span>" +
        "</label>";
    }
    return out + "</div>";
  }

  function readStars(root, name) {
    var checked = root.querySelector('input[name="' + name + '"]:checked');
    return checked ? Number(checked.value) : 0;
  }

  // Fill the stars up to the hovered/selected one, so the control behaves like
  // every other star rater people have used.
  function wireStars(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-stars]"), function (group) {
      function paint(upTo) {
        Array.prototype.forEach.call(group.querySelectorAll(".mt-star"), function (star, index) {
          star.classList.toggle("is-on", index < upTo);
        });
      }
      function selected() {
        var checked = group.querySelector("input:checked");
        return checked ? Number(checked.value) : 0;
      }
      group.addEventListener("change", function () { paint(selected()); });
      group.addEventListener("mouseleave", function () { paint(selected()); });
      Array.prototype.forEach.call(group.querySelectorAll(".mt-star"), function (star, index) {
        star.addEventListener("mouseenter", function () { paint(index + 1); });
      });
      paint(selected());
    });
  }

  // Point another star group at a rating WITHOUT firing a change event: the
  // inline control saves on change, so dispatching one here would re-POST in
  // a loop. The header rater and the tab form show the same rating, so
  // whichever one is used has to move the other.
  function setStarsSilently(scopeId, name, rating) {
    var scope = document.getElementById(scopeId);
    if (!scope) return;
    var input = scope.querySelector('input[name="' + name + '"][value="' + rating + '"]');
    if (!input) return;
    input.checked = true;
    var group = scope.querySelector('[data-stars="' + name + '"]');
    if (!group) return;
    Array.prototype.forEach.call(group.querySelectorAll(".mt-star"), function (star, index) {
      star.classList.toggle("is-on", index < rating);
    });
  }

  // Static star display for an existing rating.
  function starsDisplay(rating) {
    var full = Math.round(Number(rating) || 0);
    var out = '<span class="mt-stars-read" aria-label="' + full + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) out += i <= full ? "★" : "☆";
    return out + "</span>";
  }

  /* ---------- product page ---------- */

  function summaryMarkup(data, catalogId) {
    // Headline uses the product's published rating + review count (the same
    // figures shown on the cards), so the tab never reads "no reviews" for a
    // product that carries a rating. The per-star breakdown bars are only drawn
    // from REAL review documents — never fabricated.
    var prod = (typeof getProductById === "function") ? getProductById(catalogId) : null;
    var actual = data.count || 0;
    var average = (prod && Number(prod.rating)) || Number(data.average || 0);
    var count = (prod && prod.reviews != null && Number(prod.reviews)) || actual;
    if (!average && !count) {
      return '<div class="mt-rv-summary is-empty"><p>Reviews for this product will appear here.</p></div>';
    }
    var score = '<div class="mt-rv-score"><b>' + Number(average || 0).toFixed(1) + "</b>" +
      starsDisplay(average) +
      "<span>" + Number(count).toLocaleString("en-IN") + " review" + (count === 1 ? "" : "s") + "</span></div>";
    var barsBlock = "";
    if (actual > 0 && data.breakdown) {
      var bars = "";
      for (var star = 5; star >= 1; star--) {
        var n = data.breakdown[star] || 0;
        var pct = actual ? Math.round((n / actual) * 100) : 0;
        bars += '<div class="mt-rv-bar-row"><span>' + star + "★</span>" +
          '<span class="mt-rv-bar"><i style="width:' + pct + '%"></i></span>' +
          "<span>" + n + "</span></div>";
      }
      barsBlock = '<div class="mt-rv-bars">' + bars + "</div>";
    }
    return '<div class="mt-rv-summary">' + score + barsBlock + "</div>";
  }

  function listMarkup(reviews) {
    if (!reviews.length) return "";
    return '<div class="mt-rv-list">' + reviews.map(function (r) {
      return '<article class="mt-rv-item">' +
        '<div class="mt-rv-item-head">' + starsDisplay(r.rating) +
          "<b>" + esc(r.name) + "</b>" +
          (r.verifiedPurchase ? '<span class="mt-rv-verified">Verified purchase</span>' : "") +
        "</div>" +
        (r.text ? '<p class="mt-rv-text">' + esc(r.text) + "</p>" : "") +
        (r.reply ? '<p class="mt-rv-reply"><b>Muscle Tonik:</b> ' + esc(r.reply) + "</p>" : "") +
        "</article>";
    }).join("") + "</div>";
  }

  function formMarkup(mine) {
    if (!signedIn()) {
      return '<div class="mt-rv-form is-signin"><p>Tried this product? ' +
        '<a href="login.html">Log in</a> to rate it.</p></div>';
    }
    var pending = mine && mine.status === "pending";
    return '<form class="mt-rv-form" id="mtReviewForm">' +
      "<h4>" + (mine ? "Update your rating" : "Rate this product") + "</h4>" +
      (pending ? '<p class="mt-rv-pending">Your review is waiting to be approved.</p>' : "") +
      starsInput("mtProductRating", mine ? Math.round(mine.rating) : 0) +
      '<textarea class="mt-rv-textarea" id="mtReviewText" rows="3" maxlength="2000" ' +
        'placeholder="Add a review (optional)">' + esc(mine ? mine.text : "") + "</textarea>" +
      '<div class="mt-rv-form-foot">' +
        '<button type="submit" class="btn btn-primary btn-sm">' +
          (mine ? "Update review" : "Submit review") + "</button>" +
        '<span class="mt-rv-msg" id="mtReviewMsg"></span>' +
      "</div></form>";
  }

  function mountProduct(catalogId) {
    var root = document.getElementById("pdReviews");
    if (!root) return;
    root.innerHTML = '<p class="mt-rv-loading">Loading reviews...</p>';

    var url = mtApiBase() + "/catalog/products/" + encodeURIComponent(catalogId) + "/reviews";
    fetch(url, { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        root.innerHTML = summaryMarkup(data, catalogId) + listMarkup(data.reviews || []) + formMarkup(data.mine);
        wireStars(root);
        var form = document.getElementById("mtReviewForm");
        if (form) {
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            submitProductReview(catalogId, form);
          });
        }
        // The header control rides on the same response - no second request.
        mountInlineRating(catalogId, data.mine);
      })
      .catch(function () {
        root.innerHTML = '<p class="mt-rv-loading">Reviews are unavailable right now.</p>';
      });
  }

  function submitProductReview(catalogId, form) {
    var msg = document.getElementById("mtReviewMsg");
    var rating = readStars(form, "mtProductRating");
    if (!rating) {
      msg.textContent = "Pick a star rating first.";
      msg.className = "mt-rv-msg is-err";
      return;
    }
    var button = form.querySelector("button[type=submit]");
    button.disabled = true;
    msg.textContent = "Sending...";
    msg.className = "mt-rv-msg";

    mtAuthFetch("/catalog/products/" + encodeURIComponent(catalogId) + "/reviews", {
      method: "POST",
      body: JSON.stringify({ rating: rating, text: document.getElementById("mtReviewText").value })
    }).then(function (data) {
      msg.textContent = data.message || "Thanks!";
      msg.className = "mt-rv-msg is-ok";
      setStarsSilently("pdRateRow", "mtInlineRating", rating);
      var label = document.querySelector("#pdRateRow .pd-rate-label");
      if (label) label.textContent = "Your rating";
      var note = document.getElementById("mtInlineMsg");
      if (note) { note.textContent = "Awaiting approval"; note.className = "pd-rate-note"; }
    }).catch(function (err) {
      msg.textContent = err.message || "Could not save your review.";
      msg.className = "mt-rv-msg is-err";
    }).then(function () {
      button.disabled = false;
    });
  }

  /* ---------- inline rating, under the product title ---------- */

  // A one-click rater next to the headline stars, for people who want to leave
  // a rating without scrolling to the Reviews tab. The written review stays
  // optional and lives in the tab; this only sets the stars.
  function mountInlineRating(catalogId, mine) {
    var row = document.getElementById("pdRateRow");
    if (!row) return;
    row.hidden = false;

    if (!signedIn()) {
      var next = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
      row.innerHTML = '<span class="pd-rate-label">Rate this product</span>' +
        starsInput("mtInlineRating", 0) +
        '<a class="pd-rate-note" href="login.html?next=' + next + '">Log in to rate</a>';
      wireStars(row);
      // Not signed in: any click goes to login rather than silently failing.
      Array.prototype.forEach.call(row.querySelectorAll(".mt-star"), function (star) {
        star.addEventListener("click", function (e) {
          e.preventDefault();
          location.href = "login.html?next=" + next;
        });
      });
      return;
    }

    var current = mine ? Math.round(mine.rating) : 0;
    row.innerHTML = '<span class="pd-rate-label">' + (mine ? "Your rating" : "Rate this product") + "</span>" +
      starsInput("mtInlineRating", current) +
      '<span class="pd-rate-note" id="mtInlineMsg">' +
        (mine && mine.status === "pending" ? "Awaiting approval" : "") +
      "</span>";
    wireStars(row);

    // Clicking a star is the whole interaction: it saves straight away.
    row.addEventListener("change", function () {
      var rating = readStars(row, "mtInlineRating");
      if (rating) saveInlineRating(catalogId, rating, row);
    });
  }

  function saveInlineRating(catalogId, rating, row) {
    var note = row.querySelector("#mtInlineMsg");
    note.textContent = "Saving...";
    note.className = "pd-rate-note";

    mtAuthFetch("/catalog/products/" + encodeURIComponent(catalogId) + "/reviews", {
      method: "POST",
      body: JSON.stringify({ rating: rating, text: "" })
    }).then(function () {
      row.querySelector(".pd-rate-label").textContent = "Your rating";
      // Keep the write form in the Reviews tab showing the same stars.
      setStarsSilently("pdReviews", "mtProductRating", rating);
      var heading = document.querySelector("#mtReviewForm h4");
      if (heading) heading.textContent = "Update your rating";
      note.className = "pd-rate-note is-ok";
      note.innerHTML = "Thanks! Awaiting approval. " +
        '<a href="#tab-reviews" data-open-reviews="1">Add a review</a>';
      var link = note.querySelector("[data-open-reviews]");
      if (link) {
        link.addEventListener("click", function (e) {
          e.preventDefault();
          // Open the Reviews tab and drop the visitor on the write form.
          if (typeof switchTab === "function") switchTab("reviews");
          var form = document.getElementById("mtReviewForm");
          if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    }).catch(function (err) {
      note.textContent = err.message || "Could not save that rating.";
      note.className = "pd-rate-note is-err";
    });
  }

  /* ---------- post-order pop-up ---------- */

  function skipped(orderNumber) {
    try { return (Store.get(SKIP_KEY, []) || []).indexOf(orderNumber) !== -1; }
    catch (e) { return false; }
  }

  function markSkipped(orderNumber) {
    try {
      var list = Store.get(SKIP_KEY, []) || [];
      if (list.indexOf(orderNumber) === -1) list.push(orderNumber);
      Store.set(SKIP_KEY, list.slice(-40));
    } catch (e) { /* a blocked store just means we may ask once more */ }
  }

  function closeModal(back) {
    back.classList.remove("open");
    setTimeout(function () {
      if (back.parentNode) back.parentNode.removeChild(back);
    }, 250);
  }

  function modalMarkup(items) {
    var products = (items || []).filter(function (i) { return i.catalogId; });
    return '<div class="mt-fb-modal" role="dialog" aria-modal="true" aria-labelledby="mtFbTitle">' +
      '<button type="button" class="mt-fb-close" id="mtFbClose" aria-label="Close">✕</button>' +
      '<h3 id="mtFbTitle">How was your experience?</h3>' +
      '<p class="mt-fb-sub">Your order is confirmed. Tell us how we did - it only takes a few seconds.</p>' +
      '<form id="mtFbForm">' +
        '<div class="mt-fb-block">' +
          "<label>Rate our service</label>" +
          starsInput("mtServiceRating", 0) +
          '<textarea class="mt-rv-textarea" id="mtFbText" rows="3" maxlength="2000" ' +
            'placeholder="Tell us more (optional)"></textarea>' +
        "</div>" +
        (products.length
          ? '<div class="mt-fb-block"><label>Rate what you bought</label>' +
            products.map(function (item) {
              return '<div class="mt-fb-product" data-catalog-id="' + esc(item.catalogId) + '">' +
                "<span>" + esc(item.name) + "</span>" +
                starsInput("mtProd" + item.catalogId, 0) +
                "</div>";
            }).join("") + "</div>"
          : "") +
        '<div class="mt-fb-foot">' +
          '<button type="submit" class="btn btn-primary">Submit</button>' +
          '<button type="button" class="btn btn-outline" id="mtFbSkip">Skip</button>' +
          '<span class="mt-rv-msg" id="mtFbMsg"></span>' +
        "</div>" +
      "</form></div>";
  }

  // order: { orderNumber }. The pop-up asks the API what was in the order and
  // whether it has already been rated, so it can never nag twice.
  function openOrderPrompt(order) {
    var orderNumber = order && order.orderNumber;
    if (!orderNumber || !signedIn() || skipped(orderNumber)) return;

    mtAuthFetch("/orders/" + encodeURIComponent(orderNumber) + "/feedback", { method: "GET" })
      .then(function (data) {
        if (data.submitted) return;
        showModal(orderNumber, data.items || []);
      })
      .catch(function () { /* not their order, or offline: stay quiet */ });
  }

  function showModal(orderNumber, items) {
    var back = document.createElement("div");
    back.className = "mt-fb-back";
    back.innerHTML = modalMarkup(items);
    document.body.appendChild(back);
    // Next frame, so the open transition actually runs.
    requestAnimationFrame(function () { back.classList.add("open"); });
    wireStars(back);

    function dismiss() {
      markSkipped(orderNumber);
      closeModal(back);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") dismiss();
    }

    back.querySelector("#mtFbClose").addEventListener("click", dismiss);
    back.querySelector("#mtFbSkip").addEventListener("click", dismiss);
    back.addEventListener("click", function (e) { if (e.target === back) dismiss(); });
    document.addEventListener("keydown", onKey);

    back.querySelector("#mtFbForm").addEventListener("submit", function (e) {
      e.preventDefault();
      submitFeedback(orderNumber, back);
    });
  }

  function submitFeedback(orderNumber, back) {
    var msg = back.querySelector("#mtFbMsg");
    var rating = readStars(back, "mtServiceRating");
    if (!rating) {
      msg.textContent = "Pick a star rating for the service.";
      msg.className = "mt-rv-msg is-err";
      return;
    }
    var button = back.querySelector("button[type=submit]");
    button.disabled = true;
    msg.textContent = "Sending...";
    msg.className = "mt-rv-msg";

    // Product ratings are each optional; only send the ones actually filled in.
    var productJobs = Array.prototype.map.call(
      back.querySelectorAll(".mt-fb-product"),
      function (row) {
        var id = row.getAttribute("data-catalog-id");
        var stars = readStars(row, "mtProd" + id);
        if (!stars) return null;
        return mtAuthFetch("/catalog/products/" + encodeURIComponent(id) + "/reviews", {
          method: "POST",
          body: JSON.stringify({ rating: stars, text: "" })
        }).catch(function () { /* one product failing must not lose the rest */ });
      }
    ).filter(Boolean);

    mtAuthFetch("/orders/" + encodeURIComponent(orderNumber) + "/feedback", {
      method: "POST",
      body: JSON.stringify({ rating: rating, text: back.querySelector("#mtFbText").value })
    }).then(function () {
      return Promise.all(productJobs);
    }).then(function () {
      markSkipped(orderNumber);
      msg.textContent = "Thanks for the feedback!";
      msg.className = "mt-rv-msg is-ok";
      setTimeout(function () { closeModal(back); }, 1100);
    }).catch(function (err) {
      msg.textContent = err.message || "Could not send that.";
      msg.className = "mt-rv-msg is-err";
      button.disabled = false;
    });
  }

  window.MTReviews = {
    mountProduct: mountProduct,
    mountInlineRating: mountInlineRating,
    openOrderPrompt: openOrderPrompt,
    starsDisplay: starsDisplay
  };
})();
