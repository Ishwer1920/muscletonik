/* ===========================================================
   MUSCLE TONIK ADMIN — Merchandising

   Marks products into the storefront collections:
     * Crazy Deal  (+ optional deal price, which becomes the real sale price)
     * New Arrival
     * Near Expiry (ticked manually, or derived from an expiry date)

   Everything here writes through PATCH /admin/products/<id>/merchandising,
   which only touches these fields — the full product editor stays in Products.
   =========================================================== */
(async () => {
  "use strict";

  const PAGE_SIZE = 20;

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Merchandising</h1>
    <p class="a-page-sub">Choose which products appear under Crazy Deals, New Arrivals and Near Expiry.</p>
    <div class="a-card">
      <div class="a-card-head" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <h3 style="margin:0;">Products</h3>
        <select class="a-input" id="mdFilter" style="max-width:190px;margin-left:auto;">
          <option value="">All products</option>
          <option value="crazyDeal">Crazy Deals only</option>
          <option value="newArrival">New Arrivals only</option>
          <option value="nearExpiry">Near Expiry only</option>
        </select>
        <input class="a-input" id="mdSearch" placeholder="Search name, SKU, brand…" style="max-width:250px;">
      </div>
      <div class="a-card-body" id="mdBox"></div>
    </div>`;

  const me = await AdminShell.init({ active: "merchandising", title: "Merchandising", sub: "Commerce", requires: "products" });
  if (!me) return;

  const esc = AdminShell.esc;
  const state = { page: 1, search: "", filter: "", total: 0, totalPages: 1, products: [], loading: true };

  async function load() {
    state.loading = true;
    render();
    const qs = `?page=${state.page}&limit=${PAGE_SIZE}` +
      (state.search ? `&search=${encodeURIComponent(state.search)}` : "");
    try {
      const res = await AdminShell.api("/admin/products" + qs);
      state.products = res.products || [];
      state.total = res.total || 0;
      state.totalPages = res.totalPages || 1;
    } catch (err) {
      state.products = null;
      AdminShell.toast(err.message, "err");
    }
    state.loading = false;
    render();
  }

  async function patch(id, payload, note) {
    try {
      const res = await AdminShell.api(`/admin/products/${id}/merchandising`, {
        method: "PATCH", body: JSON.stringify(payload)
      });
      const row = state.products.find(p => p.id === id);
      if (row) Object.assign(row, res.product);
      AdminShell.toast(note || "Saved");
      render();
    } catch (err) {
      AdminShell.toast(err.message, "err");
      render();
    }
  }

  function visible() {
    if (!state.products) return [];
    return state.filter ? state.products.filter(p => p[state.filter]) : state.products;
  }

  function render() {
    const box = document.getElementById("mdBox");

    if (state.loading) {
      box.innerHTML = `<div class="skel" style="height:120px;"></div>`;
      return;
    }
    if (state.products === null) {
      box.innerHTML = `<p style="font-size:13.5px;">Could not load products.
        <button class="a-btn" type="button" id="mdRetry">Retry</button></p>`;
      document.getElementById("mdRetry").addEventListener("click", load);
      return;
    }

    const rows = visible();
    if (!rows.length) {
      box.innerHTML = `<p style="font-size:13px;color:var(--a-muted);">
        No products match this view${state.filter ? " on this page — try clearing the filter or another page" : ""}.</p>`;
      return;
    }

    box.innerHTML = `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr>
          <th>Product</th><th>Price</th><th>Crazy Deal</th><th>Deal price</th>
          <th>New Arrival</th><th>Near Expiry</th><th>Expiry date</th>
        </tr></thead>
        <tbody>${rows.map(p => `
          <tr>
            <td><b>${esc(p.name)}</b><br>
              <span style="font-size:12px;color:var(--a-muted);">${esc(p.sku || "")} · ${esc(p.brand || "")}</span></td>
            <td>${AdminShell.inr(p.sellingPrice)}</td>
            <td><input type="checkbox" data-md-flag="crazyDeal" data-md-id="${esc(p.id)}" ${p.crazyDeal ? "checked" : ""}></td>
            <td><input class="a-input" style="width:110px;" type="number" min="0" step="1"
                  data-md-price="${esc(p.id)}" value="${p.crazyDealPrice ? esc(p.crazyDealPrice) : ""}"
                  placeholder="${esc(p.sellingPrice)}"></td>
            <td><input type="checkbox" data-md-flag="newArrival" data-md-id="${esc(p.id)}" ${p.newArrival ? "checked" : ""}></td>
            <td><input type="checkbox" data-md-flag="nearExpiry" data-md-id="${esc(p.id)}" ${p.nearExpiry ? "checked" : ""}></td>
            <td><input class="a-input" style="width:150px;" type="date"
                  data-md-date="${esc(p.id)}" value="${p.expiryDate ? esc(String(p.expiryDate).slice(0, 10)) : ""}"></td>
          </tr>`).join("")}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap;">
        <button class="a-btn" type="button" id="mdPrev"${state.page <= 1 ? " disabled" : ""}>Previous</button>
        <span style="font-size:12.5px;color:var(--a-muted);">Page ${state.page} of ${state.totalPages} · ${state.total} products</span>
        <button class="a-btn" type="button" id="mdNext"${state.page >= state.totalPages ? " disabled" : ""}>Next</button>
      </div>
      <p style="margin-top:10px;font-size:12.5px;color:var(--a-muted);">
        A deal price replaces the selling price on the storefront and at checkout, and must not exceed it.
        Leave it blank to run a Crazy Deal at the normal price. An expiry date within
        the store threshold marks a product Near Expiry automatically.
      </p>`;

    box.querySelectorAll("[data-md-flag]").forEach(el => {
      el.addEventListener("change", () => {
        const flag = el.getAttribute("data-md-flag");
        patch(el.getAttribute("data-md-id"), { [flag]: el.checked },
          `${flag === "crazyDeal" ? "Crazy Deal" : flag === "newArrival" ? "New Arrival" : "Near Expiry"} ${el.checked ? "on" : "off"}`);
      });
    });
    box.querySelectorAll("[data-md-price]").forEach(el => {
      el.addEventListener("change", () =>
        patch(el.getAttribute("data-md-price"), { crazyDealPrice: el.value.trim() }, "Deal price saved"));
    });
    box.querySelectorAll("[data-md-date]").forEach(el => {
      el.addEventListener("change", () =>
        patch(el.getAttribute("data-md-date"), { expiryDate: el.value }, "Expiry date saved"));
    });

    const prev = document.getElementById("mdPrev");
    const next = document.getElementById("mdNext");
    if (prev) prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
    if (next) next.addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; load(); } });
  }

  const search = document.getElementById("mdSearch");
  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.search = search.value.trim(); state.page = 1; load(); }, 300);
  });
  document.getElementById("mdFilter").addEventListener("change", e => {
    state.filter = e.target.value;
    render();
  });

  await load();
})();
