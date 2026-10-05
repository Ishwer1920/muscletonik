/* ===========================================================
   MUSCLE TONIK - Admin: Website Alerts / Announcements.
   CRUD over /api/admin/alerts. Published alerts feed the
   storefront notification bell. Admin-created only — nothing
   is generated automatically.
   =========================================================== */
(async () => {
  const previewSync = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mt-preview") : null;
  const notifyPreview = () => previewSync?.postMessage({ type: "cms-updated" });

  const TYPES = [
    ["new_product", "New Product"],
    ["new_brand", "New Brand"],
    ["new_deal", "New Deal"],
    ["new_banner", "New Banner / Offer"],
    ["sale", "Sale"],
    ["update", "Website Update"],
    ["general", "General Announcement"]
  ];

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Website alerts</span>
        <h2>Announce new products, brands, deals and offers.</h2>
        <p>Published alerts appear in the storefront notification bell. Nothing is sent automatically — you control every announcement.</p>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Shown in</span><strong>Bell dropdown</strong><p>Across the whole storefront, for signed-in and guest visitors.</p></div>
        <div class="a-stat-card"><span>Storage</span><strong>MongoDB</strong><p>Saved as alert documents with publish + schedule control.</p></div>
      </div>
    </div>
    <div class="a-card">
      <div class="a-card-head">
        <h3>All alerts</h3>
        <button class="a-btn primary" type="button" id="newAlertBtn">New alert</button>
      </div>
      <div class="a-card-body" style="padding:0;"><div id="alertsTable"></div></div>
    </div>

    <div class="a-modal-back" id="alertModal">
      <div class="a-modal">
        <div class="a-modal-head"><span id="alertModalTitle">New alert</span><button class="a-btn ghost" type="button" id="alertClose" aria-label="Close">✕</button></div>
        <div class="a-modal-body" id="alertForm"></div>
        <div class="a-modal-foot">
          <button class="a-btn ghost" type="button" id="alertCancel">Cancel</button>
          <button class="a-btn primary" type="button" id="alertSave">Save alert</button>
        </div>
      </div>
    </div>`;

  const me = await AdminShell.init({ active: "alerts", title: "Website Alerts", sub: "Announcements shown in the storefront bell", requires: "settings" });
  if (!me) return;

  let list = [];
  let editingId = null;

  document.getElementById("newAlertBtn").addEventListener("click", () => openForm(null));
  document.getElementById("alertClose").addEventListener("click", closeForm);
  document.getElementById("alertCancel").addEventListener("click", closeForm);
  document.getElementById("alertSave").addEventListener("click", save);
  document.getElementById("alertModal").addEventListener("click", e => { if (e.target.id === "alertModal") closeForm(); });

  await refresh();

  function typeLabel(t) { const f = TYPES.find(x => x[0] === t); return f ? f[1] : t; }
  function statusPill(s) {
    const live = s === "published";
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${live ? "background:#e7f7ee;color:#1c7a45;" : "background:#ececec;color:#777;"}">${live ? "Published" : "Draft"}</span>`;
  }

  async function refresh() {
    try {
      const res = await AdminShell.api("/admin/alerts", { method: "GET" });
      list = res.alerts || [];
    } catch (err) {
      AdminShell.toast(err.message, "err");
      list = [];
    }
    renderTable();
  }

  function renderTable() {
    const host = document.getElementById("alertsTable");
    if (!list.length) {
      host.innerHTML = `<div class="a-empty"><h3>No alerts yet</h3><p>Create your first announcement for the notification bell.</p></div>`;
      return;
    }
    host.innerHTML = `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>
              <strong>${AdminShell.esc(a.title)}</strong>
              ${a.description ? `<div style="color:var(--a-muted);font-size:12px;margin-top:2px;max-width:420px;">${AdminShell.esc(a.description)}</div>` : ""}
              ${a.link ? `<div style="color:var(--a-muted);font-size:11.5px;margin-top:2px;">→ ${AdminShell.esc(a.link)}</div>` : ""}
            </td>
            <td>${AdminShell.esc(typeLabel(a.type))}</td>
            <td>${statusPill(a.status)}</td>
            <td style="white-space:nowrap;color:var(--a-muted);font-size:12.5px;">${AdminShell.fmtDate(a.createdAt)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="a-btn ghost" type="button" data-toggle="${a.id}">${a.status === "published" ? "Unpublish" : "Publish"}</button>
              <button class="a-btn ghost" type="button" data-edit="${a.id}">Edit</button>
              <button class="a-btn danger" type="button" data-del="${a.id}">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
    host.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openForm(list.find(a => a.id === b.dataset.edit))));
    host.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => toggle(b.dataset.toggle)));
    host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => remove(b.dataset.del)));
  }

  // ISO -> value for <input type="datetime-local"> (local wall time, 16 chars).
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openForm(alert) {
    editingId = alert ? alert.id : null;
    const a = alert || { title: "", description: "", type: "general", link: "", icon: "", image: "", status: "draft", important: false, duration: 5, startDate: "", endDate: "" };
    document.getElementById("alertModalTitle").textContent = editingId ? "Edit alert" : "New alert";
    document.getElementById("alertForm").innerHTML = `
      <div class="a-field"><label>Title</label><input class="a-input" name="title" maxlength="160" value="${AdminShell.esc(a.title)}" placeholder="New Whey Protein products added"></div>
      <div class="a-field"><label>Description</label><textarea class="a-input" name="description" rows="3" placeholder="Check out our latest supplements.">${AdminShell.esc(a.description)}</textarea></div>
      <div class="a-field"><label>Type</label><select class="a-select" name="type">${TYPES.map(t => `<option value="${t[0]}" ${t[0] === a.type ? "selected" : ""}>${t[1]}</option>`).join("")}</select></div>
      <div class="a-field"><label>Link / destination (optional)</label><input class="a-input" name="link" value="${AdminShell.esc(a.link)}" placeholder="/marketplace"></div>
      <div class="a-field"><label>Icon (optional emoji, e.g. 🔥)</label><input class="a-input" name="icon" maxlength="40" value="${AdminShell.esc(a.icon)}" placeholder="Leave blank to use the type icon"></div>
      <div class="a-field"><label>Image URL (optional)</label><input class="a-input" name="image" value="${AdminShell.esc(a.image)}" placeholder="/uploads/..."></div>
      <div class="a-field"><label>Status</label><select class="a-select" name="status">
        <option value="draft" ${a.status !== "published" ? "selected" : ""}>Draft</option>
        <option value="published" ${a.status === "published" ? "selected" : ""}>Published</option>
      </select></div>
      <div class="a-field" style="background:var(--a-surface-2,#f6f6f8);border:1px solid var(--a-border,#e6e6e6);border-radius:10px;padding:12px 14px;">
        <label style="display:flex;align-items:center;gap:9px;font-weight:700;font-size:13.5px;margin:0;"><input type="checkbox" name="important" ${a.important ? "checked" : ""}> ⚡ Important alert — also slide in as a storefront popup</label>
      </div>
      <div class="a-field"><label>Popup display duration</label>
        <select class="a-select" name="duration">${[3, 5, 8, 10, 15].map(d => `<option value="${d}" ${Number(a.duration || 5) === d ? "selected" : ""}>${d} seconds</option>`).join("")}</select></div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr;gap:12px;">
        <div class="a-field"><label>Start date (optional)</label><input class="a-input" type="datetime-local" name="startDate" value="${toLocalInput(a.startDate)}"></div>
        <div class="a-field"><label>End date (optional)</label><input class="a-input" type="datetime-local" name="endDate" value="${toLocalInput(a.endDate)}"></div>
      </div>`;
    document.getElementById("alertModal").classList.add("open");
  }

  function closeForm() {
    document.getElementById("alertModal").classList.remove("open");
    editingId = null;
  }

  function readForm() {
    const form = document.getElementById("alertForm");
    const val = n => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ""; };
    const importantEl = form.querySelector('[name="important"]');
    return {
      title: val("title"),
      description: val("description"),
      type: val("type"),
      link: val("link"),
      icon: val("icon"),
      image: val("image"),
      status: val("status"),
      important: importantEl ? importantEl.checked : false,
      duration: Number(val("duration")) || 5,
      startDate: val("startDate"),
      endDate: val("endDate")
    };
  }

  async function save() {
    const data = readForm();
    if (!data.title) { AdminShell.toast("A title is required.", "err"); return; }
    const btn = document.getElementById("alertSave");
    btn.disabled = true;
    try {
      if (editingId) {
        await AdminShell.api(`/admin/alerts/${editingId}`, { method: "PUT", body: JSON.stringify(data) });
        AdminShell.toast("Alert saved");
      } else {
        await AdminShell.api("/admin/alerts", { method: "POST", body: JSON.stringify(data) });
        AdminShell.toast("Alert created");
      }
      closeForm();
      notifyPreview();
      await refresh();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  async function toggle(id) {
    try {
      await AdminShell.api(`/admin/alerts/${id}/toggle`, { method: "PATCH" });
      notifyPreview();
      await refresh();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }

  async function remove(id) {
    const a = list.find(x => x.id === id);
    if (!confirm(`Delete alert "${a ? a.title : ""}"? This cannot be undone.`)) return;
    try {
      await AdminShell.api(`/admin/alerts/${id}`, { method: "DELETE" });
      AdminShell.toast("Alert deleted");
      notifyPreview();
      await refresh();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }
})();
