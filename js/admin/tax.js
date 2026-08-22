/* ===========================================================
   MUSCLE TONIK ADMIN — Tax & GST

   The single screen where GST is configured:
     * Default GST rate  -> SiteSetting "taxes".gstRate, used by every
       product that has no override of its own.
     * Per-product rate  -> Product.gstRate. Blank means "use the default".

   The server is the authority: apps/checkout/pricing.py reads these same two
   values when it prices a cart, so what is saved here is what customers are
   actually charged.
   =========================================================== */
(async () => {
  "use strict";

  const DEFAULT_RATE = 5;
  const PAGE_SIZE = 20;

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Tax &amp; GST</h1>
    <p class="a-page-sub">Set the GST charged across the store, and override it for individual products.</p>
    <div class="a-card" style="margin-bottom:18px;">
      <div class="a-card-head"><h3>Default GST rate</h3></div>
      <div class="a-card-body" id="taxRateBox"></div>
    </div>
    <div class="a-card" style="margin-bottom:18px;">
      <div class="a-card-head"><h3>Per-brand GST</h3></div>
      <div class="a-card-body" id="taxBrandBox"></div>
    </div>
    <div class="a-card">
      <div class="a-card-head" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <h3 style="margin:0;">Per-product GST</h3>
        <input class="a-input" id="taxSearch" placeholder="Search name, SKU, brand…" style="max-width:280px;margin-left:auto;">
      </div>
      <div class="a-card-body" id="taxTableBox"></div>
    </div>`;

  const me = await AdminShell.init({ active: "tax", title: "Tax & GST", sub: "Administration", requires: "settings" });
  if (!me) return;

  const state = {
    rate: DEFAULT_RATE, enabled: true, brands: [],
    page: 1, search: "", total: 0, totalPages: 1, products: []
  };

  /* ---------- data ---------- */

  async function loadRate() {
    try {
      const res = await AdminShell.api("/admin/settings/taxes");
      const value = (res && res.setting && res.setting.value) || {};
      const parsed = Number(value.gstRate);
      state.rate = isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_RATE;
      state.enabled = value.gstEnabled !== false;
    } catch {
      // 404 just means the setting has never been saved — keep the default.
      state.rate = DEFAULT_RATE;
      state.enabled = true;
    }
    renderRate();
  }

  async function loadBrands() {
    try {
      const res = await AdminShell.api("/admin/taxonomy");
      state.brands = res.brands || [];
    } catch (err) {
      state.brands = [];
      AdminShell.toast(err.message, "err");
    }
    renderBrands();
  }

  async function saveBrandRate(id, raw) {
    const trimmed = String(raw == null ? "" : raw).trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!isFinite(parsed) || parsed < 0 || parsed > 100) {
        AdminShell.toast("GST rate must be between 0 and 100.", "err");
        renderBrands();
        return;
      }
    }
    try {
      await AdminShell.api(`/admin/taxonomy/brands/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ gstRate: trimmed === "" ? "" : Number(trimmed) })
      });
      const brand = state.brands.find(b => b.id === id);
      if (brand) {
        if (trimmed === "") delete brand.gstRate;
        else brand.gstRate = Number(trimmed);
      }
      AdminShell.toast(trimmed === "" ? "Brand override cleared" : `Brand GST set to ${trimmed}%`);
      renderBrands();
      renderTable();
    } catch (err) {
      AdminShell.toast(err.message, "err");
      renderBrands();
    }
  }

  async function loadProducts() {
    const qs = `?page=${state.page}&limit=${PAGE_SIZE}` +
      (state.search ? `&search=${encodeURIComponent(state.search)}` : "");
    try {
      const res = await AdminShell.api("/admin/products" + qs);
      state.products = res.products || [];
      state.total = res.total || 0;
      state.totalPages = res.totalPages || 1;
    } catch (err) {
      state.products = [];
      AdminShell.toast(err.message, "err");
    }
    renderTable();
  }

  /* ---------- save ---------- */

  async function saveRate(value, enabled) {
    const parsed = Number(value);
    if (!isFinite(parsed) || parsed < 0 || parsed > 100) {
      AdminShell.toast("GST rate must be between 0 and 100.", "err");
      return;
    }
    const nextEnabled = enabled === undefined ? state.enabled : !!enabled;
    try {
      await AdminShell.api("/admin/settings/taxes", {
        method: "PUT",
        body: JSON.stringify({
          key: "taxes", category: "store",
          value: { gstRate: parsed, gstEnabled: nextEnabled }
        })
      });
      state.rate = parsed;
      state.enabled = nextEnabled;
      AdminShell.toast(nextEnabled ? `Default GST set to ${parsed}%` : "GST turned off");
      renderRate();
      renderTable();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }

  async function saveProductRate(id, raw) {
    const trimmed = String(raw == null ? "" : raw).trim();
    let payload;
    if (trimmed === "") {
      payload = { gstRate: "" };
    } else {
      const parsed = Number(trimmed);
      if (!isFinite(parsed) || parsed < 0 || parsed > 100) {
        AdminShell.toast("GST rate must be between 0 and 100.", "err");
        renderTable();
        return;
      }
      payload = { gstRate: parsed };
    }
    try {
      await AdminShell.api(`/admin/products/${id}/tax`, { method: "PATCH", body: JSON.stringify(payload) });
      const row = state.products.find(p => p.id === id);
      if (row) row.gstRate = trimmed === "" ? null : Number(trimmed);
      AdminShell.toast(trimmed === "" ? "Override cleared — using default" : `Product GST set to ${trimmed}%`);
      renderTable();
    } catch (err) {
      AdminShell.toast(err.message, "err");
      renderTable();
    }
  }

  /* ---------- render ---------- */

  function renderRate() {
    const box = document.getElementById("taxRateBox");
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div class="a-field" style="flex:0 0 180px;margin:0;">
          <label for="taxRate">GST rate (%)</label>
          <input class="a-input" id="taxRate" type="number" min="0" max="100" step="0.01" value="${AdminShell.esc(state.rate)}">
        </div>
        <button class="a-btn primary" id="taxRateSave" type="button">Save default</button>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-left:6px;">
          <input type="checkbox" id="taxEnabled"${state.enabled ? " checked" : ""}> Charge GST
        </label>
      </div>
      <p style="margin-top:10px;font-size:12.5px;color:var(--a-muted);">
        Priority: <b>product override → brand override → this default</b>.
        Unticking "Charge GST" zeroes tax across cart, checkout and orders.
      </p>`;
    document.getElementById("taxRateSave").addEventListener("click", () => {
      saveRate(document.getElementById("taxRate").value);
    });
    document.getElementById("taxEnabled").addEventListener("change", e => {
      saveRate(document.getElementById("taxRate").value, e.target.checked);
    });
  }

  function renderBrands() {
    const box = document.getElementById("taxBrandBox");
    if (!box) return;

    if (!state.brands.length) {
      box.innerHTML = `<p style="font-size:13px;color:var(--a-muted);">No brands found.</p>`;
      return;
    }

    const rows = state.brands.map(b => {
      const override = b.gstRate == null || b.gstRate === "" ? "" : b.gstRate;
      const effective = override === "" ? state.rate : override;
      return `<tr>
        <td><b>${AdminShell.esc(b.name)}</b><br>
          <span style="font-size:12px;color:var(--a-muted);">${AdminShell.esc(b.id)}</span></td>
        <td><input class="a-input" type="number" min="0" max="100" step="0.01" style="width:110px;"
          value="${AdminShell.esc(override)}" placeholder="${AdminShell.esc(state.rate)}"
          data-brand-tax-id="${AdminShell.esc(b.id)}"></td>
        <td><span class="badge ${override === "" ? "gray" : "blue"}">${effective}% ${override === "" ? "default" : "brand rate"}</span></td>
      </tr>`;
    }).join("");

    box.innerHTML = `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Brand</th><th>GST %</th><th>Effective</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p style="margin-top:10px;font-size:12.5px;color:var(--a-muted);">
        Applies to every product of that brand with no override of its own.
        Leave blank to use the store default (${state.rate}%).
      </p>`;

    box.querySelectorAll("[data-brand-tax-id]").forEach(input => {
      input.addEventListener("change", () => saveBrandRate(input.getAttribute("data-brand-tax-id"), input.value));
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      });
    });
  }

  // What a product would actually be charged, following the same priority the
  // server uses, so the admin sees the real outcome rather than just its own tier.
  function effectiveFor(product) {
    const own = product.gstRate == null || product.gstRate === "" ? null : Number(product.gstRate);
    if (own !== null && isFinite(own)) return { rate: own, source: "product" };
    const brand = state.brands.find(b => String(b.id).toLowerCase() === String(product.brand || "").toLowerCase());
    if (brand && brand.gstRate != null && brand.gstRate !== "") return { rate: Number(brand.gstRate), source: "brand" };
    return { rate: state.rate, source: "default" };
  }

  function renderTable() {
    const box = document.getElementById("taxTableBox");
    if (!box) return;

    if (!state.products.length) {
      box.innerHTML = `<p style="font-size:13px;color:var(--a-muted);">No products found.</p>`;
      return;
    }

    const rows = state.products.map(p => {
      const override = p.gstRate == null || p.gstRate === "" ? "" : p.gstRate;
      const resolved = effectiveFor(p);
      const tone = resolved.source === "product" ? "amber" : resolved.source === "brand" ? "blue" : "gray";
      return `<tr>
        <td><b>${AdminShell.esc(p.name)}</b><br>
          <span style="font-size:12px;color:var(--a-muted);">${AdminShell.esc(p.sku || "")} · ${AdminShell.esc(p.brand || "")}</span></td>
        <td>${AdminShell.inr(p.sellingPrice)}</td>
        <td><input class="a-input" type="number" min="0" max="100" step="0.01" style="width:110px;"
          value="${AdminShell.esc(override)}" placeholder="${AdminShell.esc(state.rate)}"
          data-tax-id="${AdminShell.esc(p.id)}"></td>
        <td><span class="badge ${tone}">${resolved.rate}% ${resolved.source}</span></td>
      </tr>`;
    }).join("");

    box.innerHTML = `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Product</th><th>Price</th><th>GST %</th><th>Effective</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap;">
        <button class="a-btn" type="button" id="taxPrev"${state.page <= 1 ? " disabled" : ""}>Previous</button>
        <span style="font-size:12.5px;color:var(--a-muted);">Page ${state.page} of ${state.totalPages} · ${state.total} products</span>
        <button class="a-btn" type="button" id="taxNext"${state.page >= state.totalPages ? " disabled" : ""}>Next</button>
      </div>
      <p style="margin-top:10px;font-size:12.5px;color:var(--a-muted);">
        Leave a field blank to use the store default (${state.rate}%).
      </p>`;

    // Commit on change/Enter so a rate is never saved half-typed.
    box.querySelectorAll("[data-tax-id]").forEach(input => {
      input.addEventListener("change", () => saveProductRate(input.getAttribute("data-tax-id"), input.value));
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      });
    });

    const prev = document.getElementById("taxPrev");
    const next = document.getElementById("taxNext");
    if (prev) prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadProducts(); } });
    if (next) next.addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; loadProducts(); } });
  }

  const search = document.getElementById("taxSearch");
  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.search = search.value.trim();
      state.page = 1;
      loadProducts();
    }, 300);
  });

  await loadRate();
  await Promise.all([loadBrands(), loadProducts()]);
})();
