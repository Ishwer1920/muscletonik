/* ===========================================================
   MUSCLE TONIK - Categories / Brands / Deals page logic
   =========================================================== */

function renderAllCategories() {
  const root = document.getElementById("allCategoryGrid");
  if (!root) return;
  root.innerHTML = CATEGORIES.map(c => {
    const count = PRODUCTS.filter(p => p.category === c.id).length;
    return `<a class="cat-card reveal" href="marketplace.html?category=${c.id}">
      <div class="icon">${icon(c.icon, 26)}</div>
      <span>${c.name}</span>
      <div style="font-size:11.5px;color:var(--text-light);margin-top:4px;">${count} products</div>
    </a>`;
  }).join("");
}

function renderAllBrands() {
  const root = document.getElementById("allBrandGrid");
  if (!root) return;
  root.innerHTML = BRANDS.map(b => {
    const count = PRODUCTS.filter(p => p.brand === b.id).length;
    return `<a class="brand-card reveal" href="marketplace.html?brand=${b.id}" style="flex:auto;">
      <div class="brand-mark${b.logo ? " has-logo" : ""}" style="background:${b.logo ? "#fff" : b.color}">${brandMarkInner(b)}</div>
      <h4>${b.name}</h4>
      <span>${b.desc} · ${count} products</span>
    </a>`;
  }).join("");
}

function renderDeals() {
  const root = document.getElementById("dealsGrid");
  if (!root) return;
  const list = dealProducts().sort((a, b) => discountPct(b.price, b.oldPrice) - discountPct(a.price, a.oldPrice));
  const count = document.getElementById("dealsCount");
  if (count) count.textContent = list.length + " items on deal right now";
  root.innerHTML = list.map(renderProductCard).join("");
}

document.addEventListener("DOMContentLoaded", async function () {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderAllCategories();
  renderAllBrands();
  renderDeals();
  if (document.getElementById("deals-h")) startCountdown("deals", 3 * 3600 + 40 * 60 + 10);
  initReveal();
});
