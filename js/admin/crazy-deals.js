/* ===========================================================
   MUSCLE TONIK ADMIN — Crazy Deals

   Builds the combo offers that appear on the storefront's Crazy Deals page:
   pick 2–100 products, give the bundle a name, description and photo, and set
   one flat price for the whole set.

   The price is a price, not a discount: buying the same products one at a time
   from the catalogue still costs the normal total. The bundle rate only holds
   while the cart contains exactly what the combo lists — see
   checkout/pricing.apply_combo_pricing.
   =========================================================== */
(async () => {
  "use strict";

  const MIN_ITEMS = 2;
  const MAX_ITEMS = 100;

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 class="a-page-title">Crazy Deals</h1>
        <p class="a-page-sub">Combo offers shown on the storefront's Crazy Deals page.</p>
      </div>
      <button class="a-btn primary" type="button" id="cdNew">+ Make combo</button>
    </div>
    <div id="cdEditor"></div>
    <div class="a-card">
      <div class="a-card-head"><h3>Combos</h3><span id="cdCount" style="color:var(--a-text-soft);font-weight:600;"></span></div>
      <div class="a-card-body" id="cdList"></div>
    </div>`;

  const me = await AdminShell.init({ active: "crazy-deals", title: "Crazy Deals", sub: "Commerce", requires: "products" });
  if (!me) return;

  const esc = AdminShell.esc;
  // `query` is kept in state so the results list survives a re-render: adding
  // a product re-renders the editor, and without this the admin would have to
  // retype the search for every single product in a combo.
  const state = { combos: [], loading: true, editing: null, results: [], searching: false, query: "" };

  /* ---------- data ---------- */

  async function load() {
    state.loading = true;
    renderList();
    try {
      const res = await AdminShell.api("/admin/combos");
      state.combos = res.combos || [];
    } catch (err) {
      state.combos = [];
      AdminShell.toast(err.message, "err");
    }
    state.loading = false;
    renderList();
  }

  function blank() {
    return { id: null, name: "", description: "", image: "", comboPrice: "", isActive: true, items: [] };
  }

  /* ---------- product picker ---------- */

  // Typing an id for a hundred products would be unusable, so products are
  // searched by name/SKU/brand and added from the results.
  let searchTimer = null;

  // The catalogue is listed as soon as the builder opens, so the picker is
  // never an empty box waiting for a search. Typing narrows the same list.
  async function loadProducts(query) {
    state.searching = true;
    renderEditor(query);
    try {
      const qs = "/admin/products?limit=24" + (query ? "&search=" + encodeURIComponent(query) : "");
      const res = await AdminShell.api(qs);
      state.results = res.products || [];
    } catch (err) {
      state.results = [];
      AdminShell.toast(err.message, "err");
    }
    state.searching = false;
    renderEditor(query);
  }

  function onSearch(term) {
    clearTimeout(searchTimer);
    const query = term.trim();
    state.query = query;
    searchTimer = setTimeout(() => loadProducts(query), 280);
  }

  function addProduct(product) {
    const combo = state.editing;
    if (!combo) return;
    const existing = combo.items.find(i => Number(i.catalogId) === Number(product.catalogId));
    if (existing) {
      existing.quantity += 1;
    } else {
      if (combo.items.length >= MAX_ITEMS) {
        AdminShell.toast(`A combo can hold at most ${MAX_ITEMS} products.`, "err");
        return;
      }
      combo.items.push({
        catalogId: Number(product.catalogId),
        quantity: 1,
        name: product.name,
        price: product.sellingPrice,
        image: (product.images || [])[0] || ""
      });
    }
    renderEditor(state.query);
  }

  /* ---------- editor ---------- */

  function normalTotal(combo) {
    return combo.items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  }

  function pickedMarkup(combo) {
    if (!combo.items.length) {
      return `<p style="font-size:13px;color:var(--a-muted);margin:0;">
        No products picked yet. Use the <b>Add</b> buttons above.</p>`;
    }
    // Its own heading, so the picked set is never mistaken for the results
    // list sitting directly above it.
    return `<p style="font-size:11.5px;color:var(--a-muted);margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;">
      In this combo (${combo.items.length})
    </p>` + combo.items.map((item, index) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--a-border);">
        <span style="width:40px;height:40px;border-radius:9px;background:var(--a-surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 40px;">
          ${item.image ? `<img src="${esc(item.image)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : ""}
        </span>
        <span style="flex:1;min-width:0;font-size:13px;">
          <b>${esc(item.name || ("Product " + item.catalogId))}</b>
          <span style="display:block;color:var(--a-muted);font-size:11.5px;">MT-${esc(item.catalogId)} · ${AdminShell.inr(item.price || 0)}</span>
        </span>
        <input class="a-input" type="number" min="1" step="1" style="width:76px;" value="${esc(item.quantity)}" data-cd-qty="${index}">
        <button class="a-btn ghost" type="button" data-cd-drop="${index}" style="padding:6px 10px;color:var(--a-red);">&#10005;</button>
      </div>`).join("");
  }

  function resultsMarkup(query) {
    if (state.searching) {
      return `<p style="font-size:12.5px;color:var(--a-muted);margin:10px 0 0;">Searching...</p>`;
    }
    if (!state.results.length) {
      return `<p style="font-size:12.5px;color:var(--a-muted);margin:10px 0 0;">${
        query ? `No products match "${esc(query)}".` : "No products found."}</p>`;
    }

    const picked = {};
    (state.editing ? state.editing.items : []).forEach(i => { picked[Number(i.catalogId)] = i.quantity; });

    return `
      <p style="font-size:11.5px;color:var(--a-muted);margin:10px 0 6px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;">
        ${query ? "Results" : "All products"}
      </p>
      <div style="border:1px solid var(--a-border);border-radius:12px;overflow:hidden;max-height:330px;overflow-y:auto;">
        ${state.results.map(p => {
          const inCombo = picked[Number(p.catalogId)];
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--a-border);">
            <span style="width:36px;height:36px;border-radius:8px;background:var(--a-surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 36px;">
              ${(p.images || [])[0] ? `<img src="${esc((p.images || [])[0])}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : ""}
            </span>
            <span style="flex:1;min-width:0;font-size:13px;">
              <b>${esc(p.name)}</b>
              <span style="display:block;color:var(--a-muted);font-size:11.5px;">
                ${esc(p.sku)} &middot; ${esc(p.brand)} &middot; ${AdminShell.inr(p.sellingPrice)}
              </span>
            </span>
            ${inCombo ? `<span style="font-size:11.5px;color:#0a8f4c;font-weight:700;">In combo &times;${inCombo}</span>` : ""}
            <button class="a-btn${inCombo ? "" : " primary"}" type="button" data-cd-add="${esc(p.catalogId)}"
              style="padding:6px 14px;flex:0 0 auto;">Add</button>
          </div>`;
        }).join("")}
      </div>`;
  }

  function renderEditor(query) {
    const host = document.getElementById("cdEditor");
    const combo = state.editing;
    if (!combo) { host.innerHTML = ""; return; }

    const total = normalTotal(combo);
    const price = Number(combo.comboPrice) || 0;
    const saving = total - price;

    host.innerHTML = `
      <div class="a-card" style="margin-bottom:18px;border:1px solid var(--a-accent,#ff7a00);">
        <div class="a-card-head"><h3>${combo.id ? "Edit combo" : "Make a combo"}</h3></div>
        <div class="a-card-body">
          <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:20px;">
            <div>
              <div class="a-field"><label>Combo name</label>
                <input class="a-input" id="cdName" value="${esc(combo.name)}" placeholder="Buy Any 3 Wellness @ 999"></div>
              <div class="a-field"><label>Description</label>
                <input class="a-input" id="cdDesc" value="${esc(combo.description)}" placeholder="Create your own bundle"></div>

              <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">
                Products in this combo
                <span style="font-weight:400;color:var(--a-muted);">(${combo.items.length} of ${MIN_ITEMS}–${MAX_ITEMS})</span>
              </label>
              <input class="a-input" id="cdSearch" placeholder="Search a product by name, SKU or brand…" value="${esc(query || "")}" autocomplete="off">
              <div id="cdResults">${resultsMarkup(query)}</div>
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--a-border);max-height:320px;overflow-y:auto;">${pickedMarkup(combo)}</div>
            </div>

            <div>
              <div class="a-field"><label>Combo photo</label>
                <div style="display:flex;gap:8px;">
                  <input class="a-input" id="cdImage" value="${esc(combo.image)}" placeholder="/uploads/products/…">
                  <button class="a-btn" type="button" id="cdUpload">Upload</button>
                </div>
              </div>
              <div style="border:1px solid var(--a-border);border-radius:14px;overflow:hidden;background:#fff;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;">
                ${combo.image
                  ? `<img src="${esc(combo.image)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">`
                  : `<span style="font-size:12.5px;color:var(--a-muted);padding:16px;text-align:center;">No photo yet.<br>The storefront falls back to the product images.</span>`}
              </div>
              <input type="file" id="cdFile" accept="image/*" style="display:none;">

              <div class="a-field" style="margin-top:14px;"><label>Combo price Rs</label>
                <input class="a-input" id="cdPrice" type="number" min="1" step="1" value="${esc(combo.comboPrice)}"></div>
              <div style="font-size:12.5px;color:var(--a-muted);line-height:1.7;">
                Normal total <b style="color:var(--a-text);">${AdminShell.inr(total)}</b><br>
                ${price > 0 && saving > 0
                  ? `Customer saves <b style="color:#0a8f4c;">${AdminShell.inr(saving)}</b>`
                  : `<span style="color:var(--a-red);">Set a price below the normal total.</span>`}
              </div>
              <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-top:12px;">
                <input type="checkbox" id="cdActive"${combo.isActive ? " checked" : ""}> Live on the storefront
              </label>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:16px;">
            <button class="a-btn primary" type="button" id="cdSave">${combo.id ? "Save combo" : "Create combo"}</button>
            <button class="a-btn ghost" type="button" id="cdCancel">Cancel</button>
          </div>
          <div id="cdErr" style="color:var(--a-red);font-size:13px;margin-top:8px;"></div>
        </div>
      </div>`;

    wireEditor(query);
  }

  // Copy the editor's inputs back into state before any re-render, so nothing
  // typed is lost when a product is added or removed.
  function readEditor() {
    const combo = state.editing;
    if (!combo || !document.getElementById("cdName")) return;
    combo.name = document.getElementById("cdName").value;
    combo.description = document.getElementById("cdDesc").value;
    combo.image = document.getElementById("cdImage").value.trim();
    combo.comboPrice = document.getElementById("cdPrice").value;
    combo.isActive = document.getElementById("cdActive").checked;
    combo.items.forEach((item, index) => {
      const el = document.querySelector(`[data-cd-qty="${index}"]`);
      if (el) item.quantity = Math.max(1, Number(el.value) || 1);
    });
  }

  function wireEditor(query) {
    const search = document.getElementById("cdSearch");
    if (search) {
      search.addEventListener("input", e => { readEditor(); onSearch(e.target.value); });
      if (query) { search.focus(); search.setSelectionRange(query.length, query.length); }
    }

    document.querySelectorAll("[data-cd-add]").forEach(btn => btn.addEventListener("click", () => {
      readEditor();
      const id = Number(btn.getAttribute("data-cd-add"));
      const found = state.results.find(p => Number(p.catalogId) === id);
      if (found) addProduct(found);
    }));

    document.querySelectorAll("[data-cd-drop]").forEach(btn => btn.addEventListener("click", () => {
      readEditor();
      state.editing.items.splice(Number(btn.getAttribute("data-cd-drop")), 1);
      renderEditor(state.query);
    }));

    // Price and quantities feed the live "customer saves" figure.
    ["cdPrice", "cdImage"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { readEditor(); renderEditor(state.query); });
    });
    document.querySelectorAll("[data-cd-qty]").forEach(el =>
      el.addEventListener("change", () => { readEditor(); renderEditor(state.query); }));

    const upload = document.getElementById("cdUpload");
    const file = document.getElementById("cdFile");
    if (upload && file) {
      upload.addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        if (!file.files || !file.files[0]) return;
        readEditor();
        const fd = new FormData();
        fd.append("images", file.files[0]);
        try {
          const res = await AdminShell.api("/admin/uploads/products", { method: "POST", body: fd });
          const url = res.files && res.files[0] && res.files[0].url;
          if (!url) throw new Error("Upload returned no file URL.");
          state.editing.image = url;
          AdminShell.toast("Photo uploaded");
          renderEditor(state.query);
        } catch (err) {
          AdminShell.toast(err.message, "err");
        }
      });
    }

    const cancel = document.getElementById("cdCancel");
    if (cancel) cancel.addEventListener("click", () => {
      state.editing = null; state.results = []; state.query = "";
      renderEditor();
    });

    const save = document.getElementById("cdSave");
    if (save) save.addEventListener("click", onSave);
  }

  async function onSave() {
    readEditor();
    const combo = state.editing;
    const errBox = document.getElementById("cdErr");
    if (combo.items.length < MIN_ITEMS) {
      errBox.textContent = `Pick at least ${MIN_ITEMS} products for the combo.`;
      return;
    }
    const payload = {
      name: combo.name,
      description: combo.description,
      image: combo.image,
      comboPrice: Number(combo.comboPrice),
      isActive: combo.isActive,
      items: combo.items.map(i => ({ catalogId: Number(i.catalogId), quantity: Number(i.quantity) || 1 }))
    };
    try {
      if (combo.id) await AdminShell.api("/admin/combos/" + combo.id, { method: "PATCH", body: JSON.stringify(payload) });
      else await AdminShell.api("/admin/combos", { method: "POST", body: JSON.stringify(payload) });
      AdminShell.toast(combo.id ? "Combo saved" : "Combo created");
      state.editing = null;
      state.results = [];
      renderEditor();
      await load();
    } catch (err) {
      errBox.textContent = err.message;
    }
  }

  /* ---------- list ---------- */

  function renderList() {
    const box = document.getElementById("cdList");
    const count = document.getElementById("cdCount");
    if (!box) return;

    if (state.loading) {
      box.innerHTML = `<p style="font-size:13px;color:var(--a-muted);">Loading combos…</p>`;
      return;
    }
    if (count) count.textContent = state.combos.length + " combo(s)";
    if (!state.combos.length) {
      box.innerHTML = `<p style="font-size:13px;color:var(--a-muted);">No combos yet. Use "Make combo" to build one.</p>`;
      return;
    }

    box.innerHTML = `<div class="a-table-wrap"><table class="a-table">
      <thead><tr><th>Combo</th><th>Products</th><th>Normal</th><th>Combo price</th><th>Saving</th><th>Status</th><th></th></tr></thead>
      <tbody>${state.combos.map(c => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:44px;height:44px;border-radius:10px;background:var(--a-surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 44px;">
                ${c.image ? `<img src="${esc(c.image)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : ""}
              </span>
              <span><b>${esc(c.name)}</b>${c.description ? `<br><span style="font-size:12px;color:var(--a-muted);">${esc(c.description)}</span>` : ""}</span>
            </div>
          </td>
          <td style="font-size:12.5px;">${c.items.length} product${c.items.length === 1 ? "" : "s"}
            ${c.items.some(i => i.missing) ? '<br><span class="badge gray">has missing product</span>' : ""}</td>
          <td>${AdminShell.inr(c.normalTotal)}</td>
          <td style="font-weight:700;">${AdminShell.inr(c.comboPrice)}</td>
          <td><span class="badge green">${AdminShell.inr(c.saving)}</span></td>
          <td><span class="badge ${c.isActive ? "green" : "gray"}">${c.isActive ? "Live" : "Off"}</span></td>
          <td style="display:flex;gap:8px;">
            <button class="a-btn ghost" type="button" data-cd-edit="${c.id}" style="padding:7px 12px;">Edit</button>
            <button class="a-btn ghost" type="button" data-cd-del="${c.id}" style="padding:7px 12px;color:var(--a-red);">Delete</button>
          </td>
        </tr>`).join("")}</tbody></table></div>`;

    box.querySelectorAll("[data-cd-edit]").forEach(btn => btn.addEventListener("click", () => {
      const found = state.combos.find(c => c.id === btn.getAttribute("data-cd-edit"));
      if (!found) return;
      state.editing = {
        id: found.id, name: found.name, description: found.description, image: found.image,
        comboPrice: found.comboPrice, isActive: found.isActive,
        items: found.items.map(i => ({
          catalogId: i.catalogId, quantity: i.quantity, name: i.name, price: i.price, image: i.image
        }))
      };
      state.results = [];
      state.query = "";
      renderEditor();
      loadProducts("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));

    box.querySelectorAll("[data-cd-del]").forEach(btn => btn.addEventListener("click", async () => {
      if (!window.confirm("Delete this combo? It disappears from Crazy Deals.")) return;
      try {
        await AdminShell.api("/admin/combos/" + btn.getAttribute("data-cd-del"), { method: "DELETE" });
        AdminShell.toast("Combo deleted");
        await load();
      } catch (err) { AdminShell.toast(err.message, "err"); }
    }));
  }

  document.getElementById("cdNew").addEventListener("click", () => {
    state.editing = blank();
    state.results = [];
    state.query = "";
    renderEditor();
    loadProducts("");
  });

  await load();
})();
