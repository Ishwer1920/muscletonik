/* Products: CRUD against the same MongoDB collection the storefront reads.
   Create/edit/delete here appears on the customer site on next load. */
(async () => {
  const previewSync = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mt-preview") : null;
  function notifyPreview() {
    previewSync?.postMessage({ type: "catalog-updated" });
  }

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div><h1 class="a-page-title">Products</h1><p class="a-page-sub">Managed in MongoDB - changes show on the storefront immediately.</p></div>
      <button class="a-btn primary" id="addProd">+ Add product</button>
    </div>
    <div class="a-card">
      <div class="a-card-head">
        <div class="a-search" style="max-width:340px;"><span></span><input id="prodSearch" placeholder="Search name, SKU, brand..."></div>
        <span id="prodCount" style="color:var(--a-text-soft);font-weight:600;"></span>
      </div>
      <div class="a-table-wrap"><table class="a-table" id="prodTable"><tbody><tr><td>Loading...</td></tr></tbody></table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;">
        <button class="a-btn ghost" id="prodPrev">Previous</button>
        <span id="prodPage" style="color:var(--a-text-soft);"></span>
        <button class="a-btn ghost" id="prodNext">Next</button>
      </div>
    </div>`;

  const me = await AdminShell.init({ active: "products", title: "Products", sub: "Commerce", requires: "products" });
  if (!me) return;

  let page = 1;
  let search = "";
  let totalPages = 1;
  let lookups = { brands: [], categories: [] };
  try { lookups = await AdminShell.api("/catalog/lookups", { method: "GET" }); } catch {}

  // One badge per collection the product belongs to, so the table shows the
  // same set of flags the editor can toggle.
  function flagBadges(p) {
    return [
      ["featured", "Featured", "orange"],
      ["trending", "Trending", "gray"],
      ["deal", "Deal", "amber"],
      ["crazyDeal", "Crazy Deal", "amber"],
      ["newArrival", "New Arrival", "green"],
      ["nearExpiry", "Near Expiry", "gray"],
    ].filter(([key]) => p[key])
     .map(([, label, tone]) => `<span class="badge ${tone}">${label}</span>`)
     .join(" ") || '<span style="color:var(--a-muted);">-</span>';
  }

  async function load() {
    const t = document.getElementById("prodTable");
    try {
      const data = await AdminShell.api(`/admin/products?page=${page}&search=${encodeURIComponent(search)}`, { method: "GET" });
      totalPages = data.totalPages;
      document.getElementById("prodCount").textContent = data.total + " product(s)";
      document.getElementById("prodPage").textContent = `Page ${data.page} of ${data.totalPages}`;
      document.getElementById("prodPrev").disabled = data.page <= 1;
      document.getElementById("prodNext").disabled = data.page >= data.totalPages;
      if (!data.products.length) {
        t.innerHTML = `<tbody><tr><td class="a-empty">No products found.</td></tr></tbody>`;
        return;
      }
      t.innerHTML = `
        <thead><tr><th>Product</th><th>Brand</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th>Status</th><th></th></tr></thead>
        <tbody>${data.products.map(p => `
          <tr>
            <td>
              <strong>${AdminShell.esc(p.name)}</strong><br>
              <span style="color:var(--a-text-soft);font-size:12px;">${AdminShell.esc(p.sku)}</span>
            </td>
            <td>${AdminShell.esc(p.brand)}</td>
            <td>${AdminShell.esc(p.category)}</td>
            <td style="font-weight:700;">${AdminShell.inr(p.sellingPrice)}${p.mrp > p.sellingPrice ? `<br><span style="color:var(--a-muted);font-weight:500;font-size:12px;text-decoration:line-through;">${AdminShell.inr(p.mrp)}</span>` : ""}</td>
            <td style="font-weight:700;">${p.stock}</td>
            <td style="line-height:1.9;">${flagBadges(p)}</td>
            <td><span class="badge ${p.status === "active" ? "green" : "gray"}">${p.status}</span></td>
            <td style="display:flex;gap:8px;">
              <button class="a-btn ghost edit-btn" data-id="${p.id}" style="padding:7px 12px;">Edit</button>
              <button class="a-btn ghost del-btn" data-id="${p.id}" data-name="${AdminShell.esc(p.name)}" style="padding:7px 12px;color:var(--a-red);">Delete</button>
            </td>
          </tr>`).join("")}</tbody>`;
      t.querySelectorAll(".edit-btn").forEach(b => b.addEventListener("click", () => openForm(b.dataset.id)));
      t.querySelectorAll(".del-btn").forEach(b => b.addEventListener("click", () => remove(b.dataset.id, b.dataset.name)));
    } catch (err) {
      t.innerHTML = `<tbody><tr><td style="color:var(--a-red);">${AdminShell.esc(err.message)}</td></tr></tbody>`;
    }
  }

  // Every boolean the product editor owns. Used both to render the checkboxes
  // and to serialize them, so the two can never drift apart.
  const FLAG_FIELDS = ["featured", "trending", "deal", "crazyDeal", "newArrival", "nearExpiry"];

  const back = document.getElementById("prodModalBack");
  const form = document.getElementById("prodForm");
  let editingId = null;
  let currentProduct = null;

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<div class="a-field"><label>${label}</label><input class="a-input" name="${name}" type="${type}" value="${AdminShell.esc(value)}" ${attrs}></div>`;
  }
  function select(label, name, options, value) {
    return `<div class="a-field"><label>${label}</label><select class="a-select" name="${name}">
      ${optionsHTML(options, value)}</select></div>`;
  }
  function optionsHTML(options, value) {
    return options.map(o => `<option value="${o.id}" ${o.id === value ? "selected" : ""}>${AdminShell.esc(o.name)}</option>`).join("");
  }
  function textarea(label, name, value = "", rows = 2) {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="${rows}" style="resize:vertical;">${AdminShell.esc(value)}</textarea></div>`;
  }
  function checkbox(label, name, checked) {
    return `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-right:18px;"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;
  }
  // One editable pack/weight row. The inputs are intentionally NOT named, so the
  // generic FormData loop ignores them; the submit handler reads them by class
  // and serialises the whole set into the "weightOptions" JSON field.
  function weightOptRow(opt) {
    opt = opt || {};
    return `<div class="wo-row" style="display:grid;grid-template-columns:1.1fr 1fr 1fr .8fr auto;gap:8px;align-items:end;margin-bottom:8px;">
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">Pack label</label><input class="a-input wo-label" type="text" value="${AdminShell.esc(opt.label || "")}" placeholder="2 KG"></div>
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">Price Rs</label><input class="a-input wo-price" type="number" min="0" step="1" value="${AdminShell.esc(opt.price ?? "")}"></div>
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">MRP Rs</label><input class="a-input wo-mrp" type="number" min="0" step="1" value="${AdminShell.esc(opt.mrp || "")}"></div>
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">Stock</label><input class="a-input wo-stock" type="number" min="0" step="1" value="${AdminShell.esc(opt.stock ?? "")}"></div>
      <button type="button" class="a-btn ghost wo-del" style="padding:7px 10px;color:var(--a-red);" aria-label="Remove pack">✕</button>
    </div>`;
  }

  // One editable flavour row (name + optional image). Like the pack rows, the
  // inputs are NOT named — the submit handler reads them by class and serialises
  // the whole set into the "flavors" JSON field.
  function flavorRow(f) {
    f = f || {};
    return `<div class="fl-row" style="display:grid;grid-template-columns:1.1fr 1.7fr auto;gap:8px;align-items:end;margin-bottom:8px;">
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">Flavour name</label><input class="a-input fl-name" type="text" value="${AdminShell.esc(f.name || "")}" placeholder="Chocolate"></div>
      <div class="a-field" style="margin:0;"><label style="font-size:11px;">Image URL (optional)</label><input class="a-input fl-image" type="text" value="${AdminShell.esc(f.image || "")}" placeholder="https://..."></div>
      <button type="button" class="a-btn ghost fl-del" style="padding:7px 10px;color:var(--a-red);" aria-label="Remove flavour">✕</button>
    </div>`;
  }

  // <input type="date"> only accepts YYYY-MM-DD, but the API returns a full
  // ISO timestamp (or null), so trim it back to the date part.
  function dateValue(iso) {
    return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
  }

  function toTextList(list) {
    return Array.isArray(list) ? list.join("\n") : "";
  }

  function imagePreviewHTML(images, files = []) {
    const fileItems = files.map(file => ({ src: URL.createObjectURL(file), label: file.name, file: true }));
    const existing = (images || []).map(src => ({ src, label: src.split("/").pop() || "Image", file: false }));
    const all = [...existing, ...fileItems];
    if (!all.length) {
      return `<div class="a-empty" style="padding:28px 16px;">No images yet. Add URLs or choose files.</div>`;
    }
    return `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
        ${all.map(item => `
          <div style="border:1px solid var(--a-border);border-radius:14px;overflow:hidden;background:var(--a-surface-2);">
            <div style="aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:#fff;">
              <img src="${item.src}" alt="${item.label}" style="max-width:100%;max-height:100%;object-fit:contain;padding:10px;">
            </div>
            <div style="padding:8px 10px;font-size:11px;color:var(--a-text-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${AdminShell.esc(item.label)}</div>
          </div>
        `).join("")}
      </div>`;
  }

  function renderForm(p = {}) {
    const brandOpts = lookups.brands.length ? lookups.brands : [{ id: p.brand || "", name: p.brand || "Brand" }];
    const catOpts = lookups.categories.length ? lookups.categories : [{ id: p.category || "", name: p.category || "Category" }];
    currentProduct = p;
    document.getElementById("prodModalBody").innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:18px;">
        <div>
          ${field("Product name", "name", p.name || "", "text", "required")}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="a-field">
              <label style="display:flex;justify-content:space-between;align-items:center;">Brand
                <button type="button" class="tax-toggle" data-kind="brand" style="background:none;border:none;color:var(--a-accent,#ff7a00);font-size:12px;font-weight:600;cursor:pointer;padding:0;">+ Manage</button>
              </label>
              <select class="a-select" name="brand" id="brandSelect">${optionsHTML(brandOpts, p.brand)}</select>
            </div>
            <div class="a-field">
              <label style="display:flex;justify-content:space-between;align-items:center;">Category
                <button type="button" class="tax-toggle" data-kind="category" style="background:none;border:none;color:var(--a-accent,#ff7a00);font-size:12px;font-weight:600;cursor:pointer;padding:0;">+ Manage</button>
              </label>
              <select class="a-select" name="category" id="categorySelect">${optionsHTML(catOpts, p.category)}</select>
            </div>
          </div>
          <div id="taxPanel" style="display:none;margin:0 0 12px;border:1px solid var(--a-border);border-radius:12px;padding:12px;background:var(--a-surface-2);"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            ${field("Selling price Rs", "sellingPrice", p.sellingPrice ?? "", "number", "min=0 step=1 required")}
            ${field("MRP Rs", "mrp", p.mrp ?? "", "number", "min=0 step=1")}
            ${field("Stock", "stock", p.stock ?? 0, "number", "min=0 step=1")}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${field("Badge", "badge", p.badge || "")}
            ${field("Accent color", "color", p.color || "#111111")}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            ${field("Protein", "protein", p.protein || "")}
            ${field("Calories", "calories", p.calories ?? 0, "number", "min=0")}
            ${field("Servings", "servings", p.servings ?? 0, "number", "min=0")}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${field("Rating (1.0 - 5.0, shown as stars)", "rating", p.rating ?? "", "number", "min=0 max=5 step=0.1")}
            ${field("Review count (shown next to the stars)", "reviewCount", p.reviewCount ?? 0, "number", "min=0 step=1")}
          </div>
          ${field("Weight / Size (optional, e.g. 1kg, 250g, 60 caps)", "weight", p.weight || "")}
          <div style="margin-top:14px;border-top:1px solid var(--a-border);padding-top:14px;">
            <h4 style="margin-bottom:4px;font-size:14px;">Pack / weight pricing (optional)</h4>
            <p style="font-size:12px;color:var(--a-muted);margin:0 0 10px;">
              Add sizes like 1 KG, 2 KG, 5 KG — each with its own price. The storefront then shows a
              pack selector and the price follows the chosen pack. Leave empty for a single-price product.
            </p>
            <div id="weightOptRows">${(p.weightOptions || []).map(weightOptRow).join("")}</div>
            <button type="button" class="a-btn ghost" id="addWeightOpt" style="margin-top:8px;">+ Add pack</button>
          </div>
          <div style="margin-top:14px;border-top:1px solid var(--a-border);padding-top:14px;">
            <h4 style="margin-bottom:4px;font-size:14px;">Flavours (optional)</h4>
            <p style="font-size:12px;color:var(--a-muted);margin:0 0 10px;">
              Add each flavour, e.g. Chocolate, Vanilla. With two or more, the storefront shows a
              flavour selector on the product page. The image is optional (shown on the flavour chip).
            </p>
            <div id="flavorRows">${(p.flavors || []).map(flavorRow).join("")}</div>
            <button type="button" class="a-btn ghost" id="addFlavor" style="margin-top:8px;">+ Add flavour</button>
          </div>
          ${field("Short description", "shortDescription", p.shortDescription || "")}
          ${textarea("Full description", "description", p.description || "", 4)}
          ${textarea("Ingredients", "ingredients", p.ingredients || "", 3)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${field("SEO title", "seoTitle", p.seoTitle || "")}
            ${select("Status", "status", [{ id: "active", name: "Active" }, { id: "archived", name: "Archived" }], p.status || "active")}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${field("GST rate % (blank = inherit)", "gstRate", p.gstRate == null ? "" : p.gstRate, "number", "min=0 max=100 step=0.01")}
            ${select("GST on this price", "taxMode", [
              { id: "", name: "Use brand / store default" },
              { id: "exclusive", name: "Exclusive - add GST at checkout" },
              { id: "inclusive", name: "Inclusive - GST already in the price" }
            ], p.taxMode || "")}
          </div>
          <p style="font-size:12px;color:var(--a-muted);margin:-4px 0 0;">
            Inclusive products charge the listed price and show "Inclusive of all taxes" at checkout.
          </p>
          <div style="margin-top:14px;border-top:1px solid var(--a-border);padding-top:14px;">
            <h4 style="margin-bottom:4px;font-size:14px;">Storefront collections</h4>
            <p style="font-size:12px;color:var(--a-muted);margin:0 0 10px;">
              Ticking a box puts this product in that collection on the site.
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:2px 0;">
              ${checkbox("Featured", "featured", p.featured)}
              ${checkbox("Trending", "trending", p.trending)}
              ${checkbox("Deal", "deal", p.deal)}
              ${checkbox("Crazy Deal", "crazyDeal", p.crazyDeal)}
              ${checkbox("New Arrival", "newArrival", p.newArrival)}
              ${checkbox("Near Expiry", "nearExpiry", p.nearExpiry)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px;">
              ${field("Deal price Rs", "crazyDealPrice", p.crazyDealPrice || "", "number", "min=0 step=1")}
              ${field("Arrival date", "arrivalDate", dateValue(p.arrivalDate), "date")}
              ${field("Expiry date", "expiryDate", dateValue(p.expiryDate), "date")}
            </div>
            <p style="font-size:12px;color:var(--a-muted);margin:-4px 0 0;">
              Crazy Deal price replaces the selling price while the deal runs - leave blank to sell at the normal price.
            </p>
          </div>
          <div style="margin-top:14px;border-top:1px solid var(--a-border);padding-top:14px;">
            <h4 style="margin-bottom:10px;font-size:14px;">Media</h4>
            ${textarea("Image URLs", "imageUrls", toTextList(p.images || []), 3)}
            ${textarea("Gallery URLs", "galleryUrls", toTextList(p.galleryImages || []), 3)}
            <div class="a-field">
              <label>Upload from device</label>
              <input class="a-input" id="prodFiles" name="images" type="file" accept="image/*" multiple>
            </div>
          </div>
        </div>
        <div>
          <div style="position:sticky;top:12px;display:grid;gap:12px;">
            <div class="a-card" style="box-shadow:none;">
              <div class="a-card-head"><h3>Media preview</h3></div>
              <div class="a-card-body" id="prodMediaPreview">${imagePreviewHTML(p.images || [], [])}</div>
            </div>
            <div class="a-card" style="box-shadow:none;">
              <div class="a-card-head"><h3>Current summary</h3></div>
              <div class="a-card-body" style="display:grid;gap:8px;font-size:13px;color:var(--a-text-soft);">
                <div><strong style="color:var(--a-text);">${AdminShell.esc(p.name || "New product")}</strong></div>
                <div>${AdminShell.esc(p.brand || "Brand")} · ${AdminShell.esc(p.category || "Category")}</div>
                <div>${AdminShell.inr(p.sellingPrice || 0)}${p.mrp > p.sellingPrice ? ` <span style="text-decoration:line-through;">${AdminShell.inr(p.mrp)}</span>` : ""}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="prodFormError" style="color:var(--a-red);font-size:13px;margin-top:8px;"></div>`;
    wireMediaPreview();
    wireTaxonomy();
  }

  // In-form manager for brands and categories. Add/delete hit the admin API,
  // then the two dropdowns and this panel refresh in place so the product
  // form the user is filling out is never wiped.
  let openTaxKind = null;

  async function loadLookups() {
    try { lookups = await AdminShell.api("/admin/taxonomy", { method: "GET" }); } catch {}
  }

  function refreshSelects() {
    ["brand", "category"].forEach(kind => {
      const el = document.getElementById(kind === "brand" ? "brandSelect" : "categorySelect");
      if (!el) return;
      const list = kind === "brand" ? lookups.brands : lookups.categories;
      const prev = el.value;
      el.innerHTML = optionsHTML(list, prev);
      if (!list.some(o => o.id === prev) && list[0]) el.value = list[0].id;
    });
  }

  function renderTaxPanel(kind) {
    const panel = document.getElementById("taxPanel");
    if (!panel) return;
    const items = kind === "brand" ? lookups.brands : lookups.categories;
    const label = kind === "brand" ? "Brands" : "Categories";
    const isBrand = kind === "brand";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:13px;">${label}</strong>
        <button type="button" class="tax-close a-btn ghost" style="padding:4px 10px;font-size:12px;">Close</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:230px;overflow:auto;">
        ${items.length ? items.map(it => {
          const mark = isBrand ? `<span style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${it.logo ? "#fff" : (it.color || "#111")};border:1px solid var(--a-border);font-size:10px;font-weight:800;color:#fff;">${it.logo ? `<img src="${AdminShell.esc(it.logo)}" alt="" style="width:100%;height:100%;object-fit:contain;">` : AdminShell.esc(it.initials || "?")}</span>` : "";
          const logoBtns = isBrand ? `
            <label class="a-btn ghost" style="padding:4px 10px;font-size:12px;cursor:pointer;margin:0;">${it.logo ? "Change" : "Logo"}<input type="file" accept="image/*" class="tax-logo-input" data-id="${it.id}" style="display:none;"></label>
            ${it.logo ? `<button type="button" class="tax-logo-clear a-btn ghost" data-id="${it.id}" style="padding:4px 10px;font-size:12px;">Clear</button>` : ""}` : "";
          return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--a-border);">
            <span style="display:flex;align-items:center;gap:8px;min-width:0;">${mark}<span style="font-size:13px;">${AdminShell.esc(it.name)} <span style="color:var(--a-text-soft);font-size:11px;">${AdminShell.esc(it.id)}</span></span></span>
            <span style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${logoBtns}<button type="button" class="tax-del a-btn ghost" data-id="${it.id}" style="padding:4px 10px;font-size:12px;color:var(--a-red);">Delete</button></span>
          </div>`;
        }).join("") : `<span style="color:var(--a-text-soft);font-size:12px;">None yet.</span>`}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input class="a-input tax-new" placeholder="New ${kind} name" style="flex:1;">
        <button type="button" class="tax-add a-btn primary" style="padding:8px 14px;">Add</button>
      </div>
      <div class="tax-err" style="color:var(--a-red);font-size:12px;margin-top:6px;"></div>`;

    const errBox = panel.querySelector(".tax-err");
    const input = panel.querySelector(".tax-new");
    const showErr = msg => { if (errBox) errBox.textContent = msg; };

    panel.querySelector(".tax-close").addEventListener("click", () => togglePanel(kind));
    panel.querySelectorAll(".tax-del").forEach(b => b.addEventListener("click", () => delTax(kind, b.dataset.id, showErr)));
    panel.querySelectorAll(".tax-logo-input").forEach(inp =>
      inp.addEventListener("change", () => uploadBrandLogo(inp.dataset.id, inp.files && inp.files[0], showErr)));
    panel.querySelectorAll(".tax-logo-clear").forEach(b =>
      b.addEventListener("click", () => setBrandLogo(b.dataset.id, "", showErr)));
    const add = () => addTax(kind, input.value, showErr, input);
    panel.querySelector(".tax-add").addEventListener("click", add);
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  }

  function togglePanel(kind) {
    const panel = document.getElementById("taxPanel");
    if (!panel) return;
    if (openTaxKind === kind) {
      panel.style.display = "none";
      openTaxKind = null;
      return;
    }
    openTaxKind = kind;
    panel.style.display = "block";
    renderTaxPanel(kind);
  }

  async function addTax(kind, name, showErr, input) {
    const clean = String(name || "").trim();
    if (!clean) { showErr("Enter a name."); return; }
    const path = kind === "brand" ? "/admin/taxonomy/brands" : "/admin/taxonomy/categories";
    try {
      const data = await AdminShell.api(path, { method: "POST", body: JSON.stringify({ name: clean }) });
      await loadLookups();
      refreshSelects();
      const created = kind === "brand" ? data.brand : data.category;
      const sel = document.getElementById(kind === "brand" ? "brandSelect" : "categorySelect");
      if (sel && created) sel.value = created.id;
      renderTaxPanel(kind);
      AdminShell.toast(`${kind === "brand" ? "Brand" : "Category"} added`);
      notifyPreview();
    } catch (err) { showErr(err.message); }
  }

  // Upload a brand logo image, then attach its URL to the brand.
  async function uploadBrandLogo(id, file, showErr) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("images", file);
      const res = await AdminShell.api("/admin/uploads/brands", { method: "POST", body: fd });
      const url = res && res.files && res.files[0] && res.files[0].url;
      if (!url) throw new Error("Upload failed.");
      await setBrandLogo(id, url, showErr);
    } catch (err) { showErr(err.message); }
  }

  // Persist (or clear, when logo is "") a brand's logo URL and refresh the UI.
  async function setBrandLogo(id, logo, showErr) {
    try {
      await AdminShell.api(`/admin/taxonomy/brands/${id}`, { method: "PATCH", body: JSON.stringify({ logo }) });
      await loadLookups();
      refreshSelects();
      renderTaxPanel("brand");
      AdminShell.toast(logo ? "Logo updated" : "Logo cleared");
      notifyPreview();
    } catch (err) { showErr(err.message); }
  }

  async function delTax(kind, id, showErr) {
    const path = kind === "brand" ? `/admin/taxonomy/brands/${id}` : `/admin/taxonomy/categories/${id}`;
    try {
      await AdminShell.api(path, { method: "DELETE" });
      await loadLookups();
      refreshSelects();
      renderTaxPanel(kind);
      AdminShell.toast(`${kind === "brand" ? "Brand" : "Category"} deleted`);
      notifyPreview();
    } catch (err) { showErr(err.message); }
  }

  function wireTaxonomy() {
    openTaxKind = null;
    document.querySelectorAll(".tax-toggle").forEach(b =>
      b.addEventListener("click", () => togglePanel(b.dataset.kind)));
  }

  function wireMediaPreview() {
    const files = document.getElementById("prodFiles");
    const urls = form.querySelector('[name="imageUrls"]');
    const gallery = form.querySelector('[name="galleryUrls"]');
    const refresh = () => {
      const fileList = files ? Array.from(files.files || []) : [];
      const urlList = parseLines(urls?.value || "");
      const galleryList = parseLines(gallery?.value || "");
      const preview = document.getElementById("prodMediaPreview");
      if (preview) preview.innerHTML = imagePreviewHTML([...urlList, ...galleryList], fileList);
    };
    files?.addEventListener("change", refresh);
    urls?.addEventListener("input", refresh);
    gallery?.addEventListener("input", refresh);
  }

  function parseLines(text) {
    return String(text || "").split(/[\n,]/).map(v => v.trim()).filter(Boolean);
  }

  async function openForm(id) {
    editingId = id || null;
    document.getElementById("prodModalTitle").textContent = id ? "Edit product" : "Add product";
    document.getElementById("prodFormError")?.remove();
    if (id) {
      try {
        const { product } = await AdminShell.api("/admin/products/" + id, { method: "GET" });
        renderForm(product);
      } catch (err) { AdminShell.toast(err.message, "err"); return; }
    } else {
      renderForm({ images: [], galleryImages: [] });
    }
    back.classList.add("open");
  }

  function closeForm() {
    back.classList.remove("open");
    editingId = null;
    currentProduct = null;
  }

  document.getElementById("addProd").addEventListener("click", () => openForm(null));
  document.getElementById("prodCancel").addEventListener("click", closeForm);
  document.getElementById("prodModalClose").addEventListener("click", closeForm);
  back.addEventListener("click", e => { if (e.target === back) closeForm(); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("prodSave");
    btn.disabled = true;
    const fd = new FormData(form);
    const payload = new FormData();
    for (const [k, v] of fd.entries()) {
      if (!FLAG_FIELDS.includes(k) && k !== "images") payload.set(k, v);
    }
    // An unticked checkbox is simply absent from FormData, so reading only
    // what the form submitted could never turn a flag back off. Send every
    // flag explicitly instead.
    FLAG_FIELDS.forEach(name => payload.set(name, fd.get(name) === "on" ? "true" : "false"));
    const fileInput = document.getElementById("prodFiles");
    Array.from(fileInput?.files || []).forEach(file => payload.append("images", file));
    payload.set("imageUrls", JSON.stringify(parseLines(fd.get("imageUrls") || "")));
    payload.set("galleryUrls", JSON.stringify(parseLines(fd.get("galleryUrls") || "")));
    // Pack/weight options: read the (unnamed) editor rows and send the whole set
    // as JSON. Always sent — an empty array clears the field server-side, turning
    // the product back into a single-price item.
    const weightOpts = Array.from(document.querySelectorAll("#weightOptRows .wo-row")).map(r => ({
      label: (r.querySelector(".wo-label")?.value || "").trim(),
      price: r.querySelector(".wo-price")?.value || "",
      mrp: r.querySelector(".wo-mrp")?.value || "",
      stock: r.querySelector(".wo-stock")?.value || ""
    })).filter(o => o.label && o.price !== "");
    payload.set("weightOptions", JSON.stringify(weightOpts));
    // Flavours: read the (unnamed) editor rows and send the whole set as JSON.
    // Always sent — an empty array clears flavours server-side. The server also
    // syncs the flat "flavor" string from these names.
    const flavorList = Array.from(document.querySelectorAll("#flavorRows .fl-row")).map(r => ({
      name: (r.querySelector(".fl-name")?.value || "").trim(),
      image: (r.querySelector(".fl-image")?.value || "").trim()
    })).filter(f => f.name);
    payload.set("flavors", JSON.stringify(flavorList));
    // Blank numeric fields are dropped so the server keeps the existing value —
    // rating/reviewCount included, so an empty rating never overwrites a set one.
    ["sellingPrice", "mrp", "stock", "calories", "servings", "rating", "reviewCount"].forEach(n => {
      if (!payload.get(n)) payload.delete(n);
    });
    // These stay in the payload when blank - an empty value is how the admin
    // clears a deal price or a date (see CLEARABLE in views_products.py).
    try {
      const data = editingId
        ? await AdminShell.api(`/admin/products/${editingId}`, { method: "PATCH", body: payload })
        : await AdminShell.api("/admin/products", { method: "POST", body: payload });
      AdminShell.toast(editingId ? "Product updated" : "Product created");
      closeForm();
      load();
      notifyPreview();
    } catch (err) {
      const box = document.getElementById("prodFormError");
      if (box) box.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Add / remove pack rows. Delegated on the persistent form element so it keeps
  // working after renderForm() replaces the modal body on each open.
  form.addEventListener("click", e => {
    if (e.target.closest("#addWeightOpt")) {
      const rows = document.getElementById("weightOptRows");
      if (rows) rows.insertAdjacentHTML("beforeend", weightOptRow({}));
    } else if (e.target.closest(".wo-del")) {
      const row = e.target.closest(".wo-row");
      if (row) row.remove();
    } else if (e.target.closest("#addFlavor")) {
      const rows = document.getElementById("flavorRows");
      if (rows) rows.insertAdjacentHTML("beforeend", flavorRow({}));
    } else if (e.target.closest(".fl-del")) {
      const row = e.target.closest(".fl-row");
      if (row) row.remove();
    }
  });

  async function remove(id, name) {
    if (!window.confirm(`Delete "${name}"? This removes it from the storefront.`)) return;
    try {
      await AdminShell.api("/admin/products/" + id, { method: "DELETE" });
      AdminShell.toast("Product deleted");
      load();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  let timer;
  document.getElementById("prodSearch").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { search = e.target.value.trim(); page = 1; load(); }, 300); });
  document.getElementById("prodPrev").addEventListener("click", () => { if (page > 1) { page--; load(); } });
  document.getElementById("prodNext").addEventListener("click", () => { if (page < totalPages) { page++; load(); } });

  load();
})();
