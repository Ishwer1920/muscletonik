(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Promotions</span>
        <h2>Manage coupon rules in one place.</h2>
        <p>Say what each code is for, who it belongs to, which brands or products it covers, and how often it can be used.</p>
        <div class="a-hero-actions">
          <button class="a-btn primary" id="couponAdd">Add coupon</button>
          <button class="a-btn" id="couponRefresh">Refresh</button>
        </div>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Active</span><strong id="couponActive">0</strong><p>Coupons currently available at checkout.</p></div>
        <div class="a-stat-card"><span>Redemptions</span><strong id="couponRedemptions">0</strong><p>Total uses recorded by checkout.</p></div>
      </div>
    </div>
    <div class="a-card">
      <div class="a-card-head">
        <div class="a-search" style="max-width:320px;"><span></span><input id="couponSearch" placeholder="Search code, title or owner"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <select class="a-select" id="couponPurpose" style="width:auto;"><option value="">All purposes</option></select>
          <select class="a-select" id="couponStatus" style="width:auto;"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <span id="couponCount" style="color:var(--a-text-soft);font-weight:600;"></span>
        </div>
      </div>
      <div class="a-table-wrap"><table class="a-table" id="couponTable"><tbody><tr><td>Loading...</td></tr></tbody></table></div>
    </div>`;

  const me = await AdminShell.init({ active: "coupons", title: "Coupons", sub: "Promotions and checkout discounts", requires: "coupons" });
  if (!me) return;

  const modal = document.getElementById("couponModalBack");
  const form = document.getElementById("couponForm");
  const body = document.getElementById("couponModalBody");
  let editingId = null;
  let state = { page: 1, search: "", status: "", purpose: "" };

  // Brand/category lists come from the live catalog so an admin can only
  // target something that actually exists — a typed-by-hand brand name that
  // matches nothing would make the coupon look broken at checkout instead.
  let targets = { brands: [], categories: [], purposes: [], scopes: [] };
  try {
    targets = await AdminShell.api("/admin/coupons/targets", { method: "GET" });
  } catch (err) {
    AdminShell.toast("Could not load brand/category list: " + err.message, "err");
  }

  const PURPOSE_LABELS = {
    general: "General promo",
    referral: "Referral code",
    welcome: "Welcome / signup",
    seasonal: "Seasonal campaign",
    influencer: "Influencer / partner",
    loyalty: "Loyalty reward",
    clearance: "Clearance"
  };
  const SCOPE_LABELS = {
    all: "Everything in the catalog",
    brands: "Only selected brands",
    categories: "Only selected categories",
    products: "Only selected products"
  };
  const purposeName = p => PURPOSE_LABELS[p] || p || "General promo";

  const purposeFilter = document.getElementById("couponPurpose");
  (targets.purposes || []).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = purposeName(p);
    purposeFilter.appendChild(opt);
  });

  document.getElementById("couponAdd").addEventListener("click", () => openForm());
  document.getElementById("couponRefresh").addEventListener("click", () => load());
  document.getElementById("couponSearch").addEventListener("input", e => { state.search = e.target.value.trim(); state.page = 1; load(); });
  document.getElementById("couponStatus").addEventListener("change", e => { state.status = e.target.value; state.page = 1; load(); });
  purposeFilter.addEventListener("change", e => { state.purpose = e.target.value; state.page = 1; load(); });
  document.getElementById("couponCancel").addEventListener("click", closeForm);
  document.getElementById("couponModalClose").addEventListener("click", closeForm);
  modal.addEventListener("click", e => { if (e.target === modal) closeForm(); });

  function field(label, name, value = "", type = "text", attrs = "", hint = "") {
    return `<div class="a-field"><label>${label}</label>
      <input class="a-input" name="${name}" type="${type}" value="${AdminShell.esc(value)}" ${attrs}>
      ${hint ? `<span style="font-size:11px;color:var(--a-text-soft);">${hint}</span>` : ""}</div>`;
  }
  function select(label, name, value, options, attrs = "") {
    return `<div class="a-field"><label>${label}</label><select class="a-select" name="${name}" ${attrs}>${options.map(o => `<option value="${o.id}" ${o.id === value ? "selected" : ""}>${AdminShell.esc(o.name)}</option>`).join("")}</select></div>`;
  }
  function multi(label, name, values, options, hint) {
    const chosen = new Set((values || []).map(v => String(v).toLowerCase()));
    return `<div class="a-field"><label>${label}</label>
      <select class="a-select" name="${name}" multiple size="6" style="height:auto;padding:8px;">
        ${options.map(o => `<option value="${AdminShell.esc(o)}" ${chosen.has(String(o).toLowerCase()) ? "selected" : ""}>${AdminShell.esc(o)}</option>`).join("")}
      </select>
      <span style="font-size:11px;color:var(--a-text-soft);">${hint}</span></div>`;
  }
  function textarea(label, name, value = "", hint = "") {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="2">${AdminShell.esc(value)}</textarea>
      ${hint ? `<span style="font-size:11px;color:var(--a-text-soft);">${hint}</span>` : ""}</div>`;
  }
  function check(label, name, checked, hint) {
    return `<div class="a-field"><label>${label}</label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;">
        <input type="checkbox" name="${name}" ${checked ? "checked" : ""} style="width:auto;">
        <span style="font-size:12px;color:var(--a-text-soft);">${hint}</span>
      </label></div>`;
  }
  const row = inner => `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">${inner}</div>`;
  const heading = t => `<div style="margin:16px 0 4px;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--a-text-soft);">${t}</div>`;
  const dateValue = v => v ? new Date(v).toISOString().slice(0, 10) : "";

  function renderForm(c = {}) {
    const purposeOptions = (targets.purposes || Object.keys(PURPOSE_LABELS)).map(p => ({ id: p, name: purposeName(p) }));
    const scopeOptions = (targets.scopes || Object.keys(SCOPE_LABELS)).map(s => ({ id: s, name: SCOPE_LABELS[s] || s }));

    body.innerHTML = `
      ${heading("What this coupon is")}
      ${row(`
        ${field("Coupon code", "code", c.code || "", "text", "required placeholder=SUMMER20")}
        ${field("Title", "title", c.title || "", "text", "required placeholder=Summer sale 20% off")}
        ${select("Purpose", "purpose", c.purpose || "general", purposeOptions)}
      `)}
      ${textarea("What is it for", "description", c.description || "", "Shown to you here and on the customer's cart when the code is applied.")}
      ${row(`
        ${field("Campaign", "campaign", c.campaign || "", "text", "placeholder=Optional grouping tag")}
        ${field("Owner / referrer", "ownerEmail", c.ownerEmail || "", "text", "placeholder=Email or partner name", "For referral and influencer codes.")}
        <div></div>
      `)}

      ${heading("What it applies to")}
      ${select("Applies to", "appliesTo", c.appliesTo || "all", scopeOptions)}
      <div id="scopeTargets"></div>

      ${heading("The discount")}
      ${row(`
        ${select("Type", "type", c.type || "percent", [
          { id: "percent", name: "Percentage off" },
          { id: "flat", name: "Flat amount off" },
          { id: "free_shipping", name: "Free shipping" }
        ])}
        ${field("Value", "value", c.value ?? "", "number", "min=0 step=1", "Percent, or rupees for a flat code.")}
        ${field("Max discount", "maxDiscount", c.maxDiscount ?? "", "number", "min=0 step=1", "Cap in rupees. 0 = no cap.")}
      `)}
      ${row(`
        ${field("Min order", "minOrder", c.minOrder ?? "", "number", "min=0 step=1", "0 = no minimum.")}
        ${field("Max uses (total)", "maxUses", c.maxUses ?? "", "number", "min=0 step=1", "0 = unlimited.")}
        ${field("Max uses per customer", "perUserLimit", c.perUserLimit ?? "", "number", "min=0 step=1", "0 = unlimited.")}
      `)}
      ${row(`
        ${check("First order only", "firstOrderOnly", !!c.firstOrderOnly, "Reject if the customer has ordered before.")}
        ${field("Starts", "startsAt", dateValue(c.startsAt), "date", "", "Blank = live immediately.")}
        ${field("Expiry", "expiresAt", dateValue(c.expiresAt), "date", "", "Blank = never expires.")}
      `)}

      ${heading("Admin")}
      ${row(`
        ${select("Status", "active", String(c.active ?? true), [{ id: "true", name: "Active" }, { id: "false", name: "Inactive" }])}
        <div style="grid-column:span 2;">${textarea("Internal notes", "notes", c.notes || "")}</div>
      `)}
      <div style="color:var(--a-text-soft);font-size:12px;">Usage count updates automatically when checkout uses the coupon.</div>
      <div id="couponError" style="color:var(--a-red);font-size:13px;margin-top:8px;"></div>`;

    const scopeSelect = body.querySelector('select[name="appliesTo"]');
    const typeSelect = body.querySelector('select[name="type"]');
    const renderTargets = () => {
      const scope = scopeSelect.value;
      const host = document.getElementById("scopeTargets");
      if (scope === "brands") {
        host.innerHTML = multi("Brands", "brands", c.brands, targets.brands || [], "Ctrl/Cmd-click to pick more than one.");
      } else if (scope === "categories") {
        host.innerHTML = multi("Categories", "categories", c.categories, targets.categories || [], "Ctrl/Cmd-click to pick more than one.");
      } else if (scope === "products") {
        host.innerHTML = textarea("Product SKUs", "productSkus", (c.productSkus || []).join(", "),
          "Comma separated, e.g. MT-14, MT-22. Find a SKU on the Products page.");
      } else {
        host.innerHTML = "";
      }
    };
    const syncType = () => {
      // Free shipping has no amount to enter, and only percent codes can be capped.
      const isShipping = typeSelect.value === "free_shipping";
      const valueField = body.querySelector('input[name="value"]');
      const capField = body.querySelector('input[name="maxDiscount"]');
      valueField.closest(".a-field").style.display = isShipping ? "none" : "";
      capField.closest(".a-field").style.display = typeSelect.value === "percent" ? "" : "none";
    };
    scopeSelect.addEventListener("change", renderTargets);
    typeSelect.addEventListener("change", syncType);
    renderTargets();
    syncType();
  }

  function openForm(coupon = null) {
    editingId = coupon?.id || null;
    document.getElementById("couponModalTitle").textContent = editingId ? "Edit coupon" : "Add coupon";
    renderForm(coupon || {});
    modal.classList.add("open");
  }
  function closeForm() {
    modal.classList.remove("open");
    editingId = null;
  }

  function readForm() {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    ["value", "minOrder", "maxDiscount", "maxUses", "perUserLimit"].forEach(k => {
      payload[k] = payload[k] === "" || payload[k] === undefined ? 0 : Number(payload[k]);
    });
    payload.active = payload.active === "true";
    payload.firstOrderOnly = fd.get("firstOrderOnly") === "on";

    // A <select multiple> only yields its last value through Object.fromEntries.
    const multiField = name => {
      const el = form.querySelector(`select[name="${name}"][multiple]`);
      return el ? Array.from(el.selectedOptions).map(o => o.value) : [];
    };
    payload.brands = multiField("brands");
    payload.categories = multiField("categories");
    payload.productSkus = String(payload.productSkus || "").split(",").map(s => s.trim()).filter(Boolean);
    return payload;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = readForm();
    try {
      if (editingId) await AdminShell.api(`/admin/coupons/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await AdminShell.api("/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
      AdminShell.toast(editingId ? "Coupon updated" : "Coupon created");
      closeForm();
      load();
    } catch (err) {
      document.getElementById("couponError").textContent = err.message;
    }
  });

  async function remove(id, code) {
    if (!confirm(`Delete coupon ${code}?`)) return;
    try {
      await AdminShell.api(`/admin/coupons/${id}`, { method: "DELETE" });
      AdminShell.toast("Coupon deleted");
      load();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }

  function valueCell(c) {
    if (c.type === "percent") return `${c.value}%` + (c.maxDiscount ? `<br><span style="font-size:11px;color:var(--a-text-soft);">up to ${AdminShell.inr(c.maxDiscount)}</span>` : "");
    if (c.type === "flat") return AdminShell.inr(c.value);
    return "Free shipping";
  }

  function limitsCell(c) {
    const bits = [];
    bits.push(c.minOrder ? `Min ${AdminShell.inr(c.minOrder)}` : "No min");
    bits.push(c.maxUses ? `Max ${c.maxUses} total` : "Unlimited");
    if (c.perUserLimit) bits.push(`${c.perUserLimit} per customer`);
    if (c.firstOrderOnly) bits.push("First order only");
    if (c.expiresAt) bits.push("Till " + new Date(c.expiresAt).toLocaleDateString("en-IN", { dateStyle: "medium" }));
    return bits.join("<br>");
  }

  async function load() {
    const q = new URLSearchParams({ page: String(state.page), search: state.search, status: state.status, purpose: state.purpose });
    const data = await AdminShell.api(`/admin/coupons?${q.toString()}`, { method: "GET" });
    document.getElementById("couponCount").textContent = `${data.total} coupon(s)`;
    document.getElementById("couponActive").textContent = data.summary.active || 0;
    document.getElementById("couponRedemptions").textContent = data.summary.usage || 0;
    const root = document.getElementById("couponTable");
    if (!data.coupons.length) {
      root.innerHTML = `<tbody><tr><td class="a-empty">No coupons found.</td></tr></tbody>`;
      return;
    }
    root.innerHTML = `
      <thead><tr><th>Code</th><th>What it is for</th><th>Applies to</th><th>Type</th><th>Value</th><th>Limits</th><th>Status</th><th>Uses</th><th></th></tr></thead>
      <tbody>${data.coupons.map(c => `
        <tr>
          <td><strong>${AdminShell.esc(c.code)}</strong><br><span style="font-size:11px;color:var(--a-text-soft);">${AdminShell.esc(c.title)}</span></td>
          <td>
            <span class="badge">${AdminShell.esc(purposeName(c.purpose))}</span>
            ${c.description ? `<div style="font-size:11px;color:var(--a-text-soft);margin-top:4px;">${AdminShell.esc(c.description)}</div>` : ""}
            ${c.ownerEmail ? `<div style="font-size:11px;color:var(--a-text-soft);">by ${AdminShell.esc(c.ownerEmail)}</div>` : ""}
          </td>
          <td style="color:var(--a-text-soft);">${AdminShell.esc(c.scopeLabel || "All products")}</td>
          <td>${c.type.replace(/_/g, " ")}</td>
          <td>${valueCell(c)}</td>
          <td style="color:var(--a-text-soft);font-size:12px;">${limitsCell(c)}</td>
          <td><span class="badge ${c.active ? "green" : "gray"}">${c.active ? "Active" : "Inactive"}</span></td>
          <td>${c.usageCount}</td>
          <td style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="a-btn ghost" data-edit="${c.id}" style="padding:7px 12px;">Edit</button>
            <button class="a-btn ghost" data-toggle="${c.id}" style="padding:7px 12px;">${c.active ? "Deactivate" : "Activate"}</button>
            <button class="a-btn ghost" data-delete="${c.id}" data-code="${c.code}" style="padding:7px 12px;color:var(--a-red);">Delete</button>
          </td>
        </tr>`).join("")}</tbody>`;
    root.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
      const record = data.coupons.find(c => c.id === btn.dataset.edit);
      if (record) openForm(record);
    }));
    root.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", async () => {
      const record = data.coupons.find(c => c.id === btn.dataset.toggle);
      if (!record) return;
      try {
        // PATCH is partial server-side, so this one key is the whole request.
        await AdminShell.api(`/admin/coupons/${record.id}`, { method: "PATCH", body: JSON.stringify({ active: !record.active }) });
        load();
      } catch (err) {
        AdminShell.toast(err.message, "err");
      }
    }));
    root.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => remove(btn.dataset.delete, btn.dataset.code)));
  }

  await load();
})();
