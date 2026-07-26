/* ===========================================================
   MUSCLE TONIK - Products page logic
   =========================================================== */

let state = {
  categories: [],
  brands: [],
  minRating: 0,
  maxPrice: 5000,
  sort: "popularity",
  search: "",
  page: 1,
  perPage: 20
};

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
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
    state = { categories: [], brands: [], minRating: 0, maxPrice: 5000, sort: "popularity", search: state.search, page: 1, perPage: 20 };
    document.getElementById("priceRange").value = 5000;
    document.getElementById("priceLabel").textContent = formatINR(5000);
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

function filteredSorted() {
  let list = PRODUCTS.filter(p => {
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

function renderProducts() {
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
  if (cat) state.categories = [cat];
  if (brand) state.brands = [brand];
  if (search) {
    state.search = search;
    const banner = document.getElementById("searchBanner");
    banner.textContent = 'Showing results for "' + search + '"';
    banner.style.display = "block";
  }
  buildFilters();
  document.getElementById("priceRange").value = state.maxPrice;
  document.getElementById("priceLabel").textContent = formatINR(state.maxPrice);
  renderProducts();
});
