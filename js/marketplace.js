/* ===========================================================
   MUSCLE TONIK - Products page logic
   =========================================================== */

let state = {
  categories: [],
  brands: [],
  minRating: 0,
  maxPrice: 5000,
  sort: "popularity",
  // "crazy-deals" | "near-expiry" | "new-arrivals" | "" (all products)
  collection: "",
  search: "",
  page: 1,
  perPage: 20
};

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// The "Max Price" slider must span the whole catalogue, otherwise premium
// products (5 lb proteins, isolates, gainers) sit above the cap and silently
// vanish from every listing. Derive the ceiling from the live products and
// round up to a tidy step; fall back to 5000 only if the catalogue is empty.
function catalogMaxPrice() {
  var prices = (typeof PRODUCTS !== "undefined" ? PRODUCTS : [])
    .map(function (p) { return Number(p.price); })
    .filter(function (n) { return isFinite(n) && n > 0; });
  if (!prices.length) return 5000;
  return Math.max(5000, Math.ceil(Math.max.apply(null, prices) / 500) * 500);
}

function buildFilters() {
  document.getElementById("catFilters").innerHTML = CATEGORIES.map(c => `
    <label><input type="checkbox" value="${c.id}" data-type="cat" ${state.categories.includes(c.id) ? "checked" : ""}> ${c.name}</label>
  `).join("");
  document.getElementById("brandFilters").innerHTML = BRANDS.map(b => `
    <label><input type="checkbox" value="${b.id}" data-type="brand" ${state.brands.includes(b.id) ? "checked" : ""}> ${b.name}</label>
  `).join("");

  document.querySelectorAll('input[data-type="cat"]').forEach(cb => {
    cb.addEventListener("change", () => {
      state.categories = [...document.querySelectorAll('input[data-type="cat"]:checked')].map(i => i.value);
      state.page = 1;
      renderProducts();
    });
  });
  document.querySelectorAll('input[data-type="brand"]').forEach(cb => {
    cb.addEventListener("change", () => {
      state.brands = [...document.querySelectorAll('input[data-type="brand"]:checked')].map(i => i.value);
      state.page = 1;
      renderProducts();
    });
  });
  document.querySelectorAll('input[data-type="rating"]').forEach(rb => {
    rb.addEventListener("change", () => {
      state.minRating = Number(rb.value);
      state.page = 1;
      renderProducts();
    });
  });

  const priceRange = document.getElementById("priceRange");
  priceRange.addEventListener("input", () => {
    state.maxPrice = Number(priceRange.value);
    document.getElementById("priceLabel").textContent = formatINR(state.maxPrice);
    state.page = 1;
    renderProducts();
  });

  document.getElementById("sortSelect").addEventListener("change", e => {
    state.sort = e.target.value;
    state.page = 1;
    renderProducts();
  });

  document.getElementById("clearFilters").addEventListener("click", () => {
    const maxP = catalogMaxPrice();
    state = { categories: [], brands: [], minRating: 0, maxPrice: maxP, sort: "popularity", search: state.search, collection: state.collection, page: 1, perPage: 20 };
    document.getElementById("priceRange").value = maxP;
    document.getElementById("priceLabel").textContent = formatINR(maxP);
    document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
    document.querySelector('input[data-type="rating"][value="0"]').checked = true;
    renderProducts();
    closeFiltersPanel();
  });

  const filterToggle = document.getElementById("filterToggle");
  const closeFilters = document.getElementById("closeFilters");
  const backdrop = document.getElementById("filtersBackdrop");
  if (filterToggle) filterToggle.addEventListener("click", openFiltersPanel);
  if (closeFilters) closeFilters.addEventListener("click", closeFiltersPanel);
  if (backdrop) backdrop.addEventListener("click", closeFiltersPanel);
}

function openFiltersPanel() {
  const panel = document.getElementById("filtersPanel");
  const backdrop = document.getElementById("filtersBackdrop");
  if (panel) panel.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeFiltersPanel() {
  const panel = document.getElementById("filtersPanel");
  const backdrop = document.getElementById("filtersBackdrop");
  if (panel) panel.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
  document.body.style.overflow = "";
}

// Merchandising collections, keyed to the product flags served by the API.
// Same names the backend uses for ?collection=, so a link works either way.
const COLLECTIONS = {
  "crazy-deals":  { flag: "crazyDeal",  title: "Crazy Deals",  blurb: "Hand-picked price drops while stock lasts." },
  "near-expiry":  { flag: "nearExpiry", title: "Near Expiry",  blurb: "Genuine stock close to its best-before date, at a lower price." },
  "new-arrivals": { flag: "newArrival", title: "New Arrivals", blurb: "The latest additions to the store." }
};

function filteredSorted() {
  const collection = COLLECTIONS[state.collection];
  let list = PRODUCTS.filter(p => {
    if (collection && !p[collection.flag]) return false;
    if (state.categories.length && !state.categories.includes(p.category)) return false;
    if (state.brands.length && !state.brands.includes(p.brand)) return false;
    if (p.rating < state.minRating) return false;
    if (p.price > state.maxPrice) return false;
    if (state.search && !p.name.toLowerCase().includes(state.search.toLowerCase())) return false;
    return true;
  });

  switch (state.sort) {
    case "price-low":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price-high":
      list.sort((a, b) => b.price - a.price);
      break;
    case "discount":
      list.sort((a, b) => discountPct(b.price, b.oldPrice) - discountPct(a.price, a.oldPrice));
      break;
    case "newest":
      list = list.slice().reverse();
      break;
    default:
      list.sort((a, b) => b.reviews - a.reviews);
  }
  return list;
}

/* ---------------------------------------------------------------------------
   COLLECTION BANNERS

   The same Banner records the homepage hero uses, filtered to the ones an
   admin pointed at this page (Admin -> Banners -> "Shows on"). Any number of
   them share one slot and rotate; each carries its own destination, already
   resolved server-side (a product, a page such as the BMI calculator, a
   collection or a plain URL), so nothing is hardcoded here.
   --------------------------------------------------------------------------- */
var cdBannerTimer = null;
var cdBannerIndex = 0;

function collectionBanners() {
  var all = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.banners) || [];
  if (state.collection !== "crazy-deals") return [];
  return all.filter(function (b) {
    return b && b.placement === "crazy-deals" && (b.image || b.imageMobile);
  });
}

function renderCollectionBanners() {
  var host = document.getElementById("cdBanners");
  if (!host) return;
  var banners = collectionBanners();
  clearInterval(cdBannerTimer);

  if (!banners.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  cdBannerIndex = 0;

  host.innerHTML =
    '<div class="cd-banner-track" id="cdBannerTrack">' +
      banners.map(function (b, i) {
        var img = '<img src="' + escapeHtml(b.image || b.imageMobile) + '" alt="' +
          escapeHtml(b.alt || b.title || "Offer") + '"' + (i ? ' loading="lazy"' : "") + '>';
        var caption = (b.title || b.ctaText)
          ? '<span class="cd-banner-cap">' +
              (b.title ? "<b>" + escapeHtml(b.title) + "</b>" : "") +
              (b.subtitle ? "<span>" + escapeHtml(b.subtitle) + "</span>" : "") +
            "</span>"
          : "";
        // A banner with a destination is a link; one without is just artwork.
        return b.href
          ? '<a class="cd-banner-slide" href="' + escapeHtml(b.href) + '">' + img + caption + "</a>"
          : '<span class="cd-banner-slide">' + img + caption + "</span>";
      }).join("") +
    "</div>" +
    (banners.length > 1
      ? '<div class="cd-banner-dots" id="cdBannerDots">' +
          banners.map(function (b, i) {
            return '<button type="button" class="' + (i ? "" : "active") +
              '" data-cd-banner="' + i + '" aria-label="Show offer ' + (i + 1) + '"></button>';
          }).join("") +
        "</div>"
      : "");

  var track = document.getElementById("cdBannerTrack");
  var dots = host.querySelectorAll("[data-cd-banner]");

  function show(index) {
    cdBannerIndex = (index + banners.length) % banners.length;
    track.style.transform = "translateX(-" + (cdBannerIndex * 100) + "%)";
    Array.prototype.forEach.call(dots, function (dot, i) {
      dot.classList.toggle("active", i === cdBannerIndex);
    });
  }

  Array.prototype.forEach.call(dots, function (dot) {
    dot.addEventListener("click", function () {
      show(Number(dot.getAttribute("data-cd-banner")));
      restart();
    });
  });

  function restart() {
    clearInterval(cdBannerTimer);
    if (banners.length > 1) {
      cdBannerTimer = setInterval(function () { show(cdBannerIndex + 1); }, 5500);
    }
  }
  // Pausing on hover keeps a banner still while it is being read.
  host.addEventListener("mouseenter", function () { clearInterval(cdBannerTimer); });
  host.addEventListener("mouseleave", restart);
  restart();
}

// Combo offers, shown above the products on the Crazy Deals collection only.
// The whole bundle goes into the cart in one click, each line tagged with the
// combo id so checkout prices the set at its flat price.
function renderCombos() {
  const host = document.getElementById("comboRail");
  if (!host) return;
  const combos = state.collection === "crazy-deals" ? (COMBOS || []) : [];
  if (!combos.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="combo-rail-head">
      <h3>Combo offers</h3>
      <p>Buy the set together and pay one bundled price. Prices revert to normal if you remove an item.</p>
    </div>
    <div class="combo-rail-grid">
      ${combos.map(combo => `
        <article class="combo-card${combo.image ? " has-art" : ""}">
          ${combo.image
            // The admin's own artwork leads the card when there is one; the
            // product collage is the fallback so a combo without a photo is
            // still recognisable.
            ? `<div class="combo-art"><img src="${escapeHtml(combo.image)}" alt="${escapeHtml(combo.name)}" loading="lazy">
                 <span class="combo-art-price">${formatINR(combo.comboPrice)}</span>
               </div>`
            : `<div class="combo-card-items">
                ${combo.items.slice(0, 4).map(item => `
                  <div class="combo-card-item">
                    <span class="combo-thumb">${item.image
                      ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">`
                      : ""}</span>
                    <span class="combo-item-name">${escapeHtml(item.name)}${item.quantity > 1 ? ` &times;${item.quantity}` : ""}</span>
                  </div>`).join('<span class="combo-plus">+</span>')}
                ${combo.items.length > 4 ? `<span class="combo-more">+${combo.items.length - 4} more</span>` : ""}
              </div>`}
          <h4>${escapeHtml(combo.name)}</h4>
          ${combo.description ? `<p class="combo-desc">${escapeHtml(combo.description)}</p>` : ""}
          <div class="combo-price-row">
            <b>${formatINR(combo.comboPrice)}</b>
            <s>${formatINR(combo.normalTotal)}</s>
            <span class="combo-save-pill">Save ${formatINR(combo.saving)}</span>
          </div>
          <button type="button" class="btn btn-primary btn-block" data-combo="${escapeHtml(combo.id)}">Grab this combo</button>
        </article>`).join("")}
    </div>`;

  host.querySelectorAll("[data-combo]").forEach(button => {
    button.addEventListener("click", () => {
      const combo = getComboById(button.getAttribute("data-combo"));
      if (!combo) return;
      Cart.addCombo(combo);
      window.location.href = "cart.html";
    });
  });
}

function renderProducts() {
  renderCombos();
  const list = filteredSorted();
  document.getElementById("resultCount").textContent = list.length + " products found";
  const totalPages = Math.max(1, Math.ceil(list.length / state.perPage));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * state.perPage;
  const pageItems = list.slice(start, start + state.perPage);

  const grid = document.getElementById("productGrid");
  if (pageItems.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="icon">' + icon("search", 30) + '</div><h3>No products match those filters</h3><p style="color:var(--text-light);margin-top:8px;">Try widening your price range or clearing filters.</p></div>';
  } else {
    grid.innerHTML = pageItems.map(renderProductCard).join("");
  }

  document.getElementById("pagination").innerHTML = paginationHtml(state.page, totalPages);
}

// A compact, non-overflowing pager: ‹ Prev, page 1, an ellipsis, a small window
// around the current page, an ellipsis, the last page, Next ›. Always anchored at
// page 1 so the row stays short no matter how many pages there are.
function pageButton(i, current) {
  return `<button class="${i === current ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
}

function paginationHtml(current, total) {
  if (total <= 1) return "";
  const items = [`<button class="pag-nav" ${current === 1 ? "disabled" : ""} onclick="goToPage(${current - 1})" aria-label="Previous page">‹</button>`];
  const wanted = [...new Set([1, current - 1, current, current + 1, total])]
    .filter(p => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  let prev = 0;
  for (const p of wanted) {
    if (p - prev > 1) items.push('<span class="pag-gap">…</span>');
    items.push(pageButton(p, current));
    prev = p;
  }
  items.push(`<button class="pag-nav" ${current === total ? "disabled" : ""} onclick="goToPage(${current + 1})" aria-label="Next page">›</button>`);
  return items.join("");
}

function goToPage(i) {
  state.page = i;
  renderProducts();
  window.scrollTo({ top: 300, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", async function () {
  await Promise.resolve(window.MT_CATALOG_READY);
  const cat = getParam("category");
  const brand = getParam("brand");
  const search = getParam("search");
  const collection = getParam("collection");
  if (collection && COLLECTIONS[collection]) {
    state.collection = collection;
    const meta = COLLECTIONS[collection];
    const heading = document.querySelector(".page-head h1");
    const crumb = document.querySelector(".page-head .breadcrumb span");
    if (heading) heading.textContent = meta.title;
    if (crumb) crumb.textContent = meta.title;
    document.title = meta.title + " · Muscle Tonik";
    const banner = document.getElementById("searchBanner");
    if (banner) {
      banner.textContent = meta.blurb;
      banner.style.display = "block";
    }
  }
  if (cat) state.categories = [cat];
  if (brand) state.brands = [brand];
  if (search) {
    state.search = search;
    const banner = document.getElementById("searchBanner");
    banner.textContent = 'Showing results for "' + search + '"';
    banner.style.display = "block";
  }
  // Open the price slider to the full catalogue range so nothing is hidden by
  // default; a page arriving via ?brand or ?category still shows every price.
  const maxP = catalogMaxPrice();
  state.maxPrice = maxP;
  const priceInput = document.getElementById("priceRange");
  if (priceInput) priceInput.max = maxP;
  buildFilters();
  document.getElementById("priceRange").value = state.maxPrice;
  document.getElementById("priceLabel").textContent = formatINR(state.maxPrice);
  // Once, at boot: filtering or paging must not restart the rotation.
  renderCollectionBanners();
  renderProducts();
});
