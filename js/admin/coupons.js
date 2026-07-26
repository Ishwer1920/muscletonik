(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Promotions</span>
        <h2>Manage coupon rules in one place.</h2>
        <p>Create percentage, flat and free-shipping coupons with expiry controls, usage caps, and searchable history.</p>
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
        <div class="a-search" style="max-width:320px;"><span></span><input id="couponSearch" placeholder="Search code or title"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
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
  let state = { page: 1, search: "", status: "" };

  document.getElementById("couponAdd").addEventListener("click", () => openForm());
  document.getElementById("couponRefresh").addEventListener("click", () => load());
  document.getElementById("couponSearch").addEventListener("input", e => { state.search = e.target.value.trim(); load(); });
  document.getElementById("couponStatus").addEventListener("change", e => { state.status = e.target.value; load(); });
  document.getElementById("couponCancel").addEventListener("click", closeForm);
  document.getElementById("couponModalClose").addEventListener("click", closeForm);
  modal.addEventListener("click", e => { if (e.target === modal) closeForm(); });

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<div class="a-field"><label>${label}</label><input class="a-input" name="${name}" type="${type}" value="${AdminShell.esc(value)}" ${attrs}></div>`;
  }
  function select(label, name, value, options) {
    return `<div class="a-field"><label>${label}</label><select class="a-select" name="${name}">${options.map(o => `<option value="${o.id}" ${o.id === value ? "selected" : ""}>${AdminShell.esc(o.name)}</option>`).join("")}</select></div>`;
  }
  function textarea(label, name, value = "") {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="3">${AdminShell.esc(value)}</textarea></div>`;
  }

  function renderForm(c = {}) {
    body.innerHTML = `
      ${field("Coupon code", "code", c.code || "", "text", "required")}
      ${field("Title", "title", c.title || "", "text", "required")}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
        ${select("Type", "type", c.type || "percent", [
          { id: "percent", name: "Percentage" },
          { id: "flat", name: "Flat amount" },
          { id: "free_shipping", name: "Free shipping" }
        ])}
        ${field("Value", "value", c.value ?? "", "number", "min=0 step=1")}
        ${field("Min order", "minOrder", c.minOrder ?? "", "number", "min=0 step=1")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
        ${field("Max uses", "maxUses", c.maxUses ?? "", "number", "min=0 step=1")}
        ${field("Expiry", "expiresAt", c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0,10) : "", "date")}
        ${select("Status", "active", String(c.active ?? true), [{ id: "true", name: "Active" }, { id: "false", name: "Inactive" }])}
      </div>
      ${textarea("Notes", "notes", c.notes || "")}
      <div style="color:var(--a-text-soft);font-size:12px;">Usage count updates automatically when checkout uses the coupon.</div>
      <div id="couponError" style="color:var(--a-red);font-size:13px;margin-top:8px;"></div>`;
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

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    ["value", "minOrder", "maxUses"].forEach(k => { payload[k] = payload[k] === "" ? 0 : Number(payload[k]); });
    payload.active = payload.active === "true";
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

  async function load() {
    const q = new URLSearchParams({ page: String(state.page), search: state.search, status: state.status });
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
      <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Value</th><th>Limits</th><th>Status</th><th>Uses</th><th>Updated</th><th></th></tr></thead>
      <tbody>${data.coupons.map(c => `
        <tr>
          <td><strong>${AdminShell.esc(c.code)}</strong></td>
          <td>${AdminShell.esc(c.title)}</td>
          <td>${c.type.replace(/_/g, " ")}</td>
          <td>${c.type === "percent" ? `${c.value}%` : c.type === "flat" ? AdminShell.inr(c.value) : "Free shipping"}</td>
          <td style="color:var(--a-text-soft);">${c.minOrder ? `Min ${AdminShell.inr(c.minOrder)}` : "No min"}<br>${c.maxUses ? `Max ${c.maxUses}` : "Unlimited"}</td>
          <td><span class="badge ${c.active ? "green" : "gray"}">${c.active ? "Active" : "Inactive"}</span></td>
          <td>${c.usageCount}</td>
          <td style="color:var(--a-text-soft);">${AdminShell.fmtDate(c.createdAt)}</td>
          <td style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="a-btn ghost" data-edit="${c.id}" style="padding:7px 12px;">Edit</button>
            <button class="a-btn ghost" data-toggle="${c.id}" style="padding:7px 12px;">${c.active ? "Deactivate" : "Activate"}</button>
            <button class="a-btn ghost" data-delete="${c.id}" data-code="${c.code}" style="padding:7px 12px;color:var(--a-red);">Delete</button>
          </td>
        </tr>`).join("")}</tbody>`;
    root.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.dataset.edit;
      const record = data.coupons.find(c => c.id === id);
      if (record) openForm(record);
    }));
    root.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.dataset.toggle;
      const record = data.coupons.find(c => c.id === id);
      if (!record) return;
      await AdminShell.api(`/admin/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ ...record, active: !record.active }) });
      load();
    }));
    root.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => remove(btn.dataset.delete, btn.dataset.code)));
  }

  await load();
})();
