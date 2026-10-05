(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Moderation</span>
        <h2>Review moderation that feels built-in.</h2>
        <p>Approve, reject, feature, flag spam, and add merchant replies from one queue. Approved reviews feed the storefront.</p>
        <div class="a-hero-actions">
          <button class="a-btn primary" id="reviewAdd">Add review</button>
          <button class="a-btn" id="reviewRefresh">Refresh</button>
        </div>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Pending</span><strong id="reviewPending">0</strong><p>Waiting on moderation.</p></div>
        <div class="a-stat-card"><span>Approved</span><strong id="reviewApproved">0</strong><p>Visible on the storefront.</p></div>
      </div>
    </div>
    <div class="a-card">
      <div class="a-card-head">
        <div class="a-search" style="max-width:280px;"><span></span><input id="reviewSearch" placeholder="Search product, customer, text"></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <select class="a-select" id="reviewStatus" style="width:auto;">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="spam">Spam</option>
          </select>
          <select class="a-select" id="reviewRating" style="width:auto;">
            <option value="">Any rating</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars+</option>
            <option value="3">3 stars+</option>
          </select>
          <span id="reviewCount" style="color:var(--a-text-soft);font-weight:600;"></span>
        </div>
      </div>
      <div class="a-table-wrap"><table class="a-table" id="reviewTable"><tbody><tr><td>Loading...</td></tr></tbody></table></div>
    </div>`;

  const me = await AdminShell.init({ active: "reviews", title: "Reviews", sub: "Moderation and responses", requires: "reviews" });
  if (!me) return;

  const modal = document.getElementById("reviewModalBack");
  const form = document.getElementById("reviewForm");
  const body = document.getElementById("reviewModalBody");
  let editingId = null;
  let state = { search: "", status: "", rating: "" };

  document.getElementById("reviewAdd").addEventListener("click", () => openForm());
  document.getElementById("reviewRefresh").addEventListener("click", () => load());
  document.getElementById("reviewSearch").addEventListener("input", e => { state.search = e.target.value.trim(); load(); });
  document.getElementById("reviewStatus").addEventListener("change", e => { state.status = e.target.value; load(); });
  document.getElementById("reviewRating").addEventListener("change", e => { state.rating = e.target.value; load(); });
  document.getElementById("reviewCancel").addEventListener("click", closeForm);
  document.getElementById("reviewModalClose").addEventListener("click", closeForm);
  modal.addEventListener("click", e => { if (e.target === modal) closeForm(); });

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<div class="a-field"><label>${label}</label><input class="a-input" name="${name}" type="${type}" value="${AdminShell.esc(value)}" ${attrs}></div>`;
  }
  function textarea(label, name, value = "") {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="4">${AdminShell.esc(value)}</textarea></div>`;
  }
  function select(label, name, value, options) {
    return `<div class="a-field"><label>${label}</label><select class="a-select" name="${name}">${options.map(o => `<option value="${o.id}" ${o.id === value ? "selected" : ""}>${AdminShell.esc(o.name)}</option>`).join("")}</select></div>`;
  }

  function stars(value) { return "★".repeat(value) + "☆".repeat(5 - value); }

  function renderForm(r = {}) {
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field("Product ID", "productId", r.productId ?? "", "number", "required min=1")}
        ${field("Product name", "productName", r.productName || "", "text", "required")}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        ${field("Customer name", "customerName", r.customerName || "", "text", "required")}
        ${field("Customer email", "customerEmail", r.customerEmail || "")}
        ${field("Rating", "rating", r.rating ?? 5, "number", "required min=1 max=5")}
      </div>
      ${textarea("Review text", "text", r.text || "")}
      ${field("Image URL", "imageUrl", r.imageUrl || "")}
      ${textarea("Merchant reply", "reply", r.reply || "")}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        ${select("Status", "status", r.status || "pending", [
          { id: "pending", name: "Pending" },
          { id: "approved", name: "Approved" },
          { id: "rejected", name: "Rejected" },
          { id: "spam", name: "Spam" }
        ])}
        ${select("Featured", "featured", String(r.featured ?? false), [{ id: "true", name: "Yes" }, { id: "false", name: "No" }])}
        ${field("Tags", "tags", (r.tags || []).join(", "), "text")}
      </div>
      <div id="reviewError" style="color:var(--a-red);font-size:13px;margin-top:8px;"></div>`;
  }

  function openForm(review = null) {
    editingId = review?.id || null;
    document.getElementById("reviewModalTitle").textContent = editingId ? "Edit review" : "Add review";
    renderForm(review || {});
    modal.classList.add("open");
  }
  function closeForm() { modal.classList.remove("open"); editingId = null; }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.productId = Number(payload.productId);
    payload.rating = Number(payload.rating);
    payload.featured = payload.featured === "true";
    payload.tags = String(payload.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const saveBtn = document.getElementById("reviewSave");
    const origSave = saveBtn ? saveBtn.textContent : "";
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }
    try {
      if (editingId) await AdminShell.api(`/admin/reviews/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await AdminShell.api("/admin/reviews", { method: "POST", body: JSON.stringify(payload) });
      AdminShell.toast(editingId ? "Review updated" : "Review created");
      closeForm();
      await load();
    } catch (err) {
      document.getElementById("reviewError").textContent = err.message;
      AdminShell.toast("Failed to save review. Please try again.", "err");
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origSave; }
    }
  });

  async function remove(btn, id, name) {
    if (!confirm(`Are you sure you want to delete this review from ${name}? This cannot be undone.`)) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Deleting...";
    try {
      await AdminShell.api(`/admin/reviews/${id}`, { method: "DELETE" });
      AdminShell.toast("Review deleted");
      await load();
    } catch (err) {
      AdminShell.toast("Failed to delete review. Please try again.", "err");
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // Quick status change (Approve / Reject / Spam). Disables the button while
  // it runs, confirms with a toast, and re-renders so filters/counts stay in
  // sync. On failure it surfaces an error toast and restores the button.
  async function quickStatus(btn, id, status, verb) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = verb + "...";
    try {
      await AdminShell.api(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      AdminShell.toast(status === "spam" ? "Review marked as spam" : "Review " + status);
      await load();   // re-render replaces this button, so no manual restore needed
    } catch (err) {
      AdminShell.toast(`Failed to ${verb.toLowerCase()} review. Please try again.`, "err");
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function load() {
    const q = new URLSearchParams({ search: state.search, status: state.status, minRating: state.rating });
    const data = await AdminShell.api(`/admin/reviews?${q.toString()}`, { method: "GET" });
    document.getElementById("reviewCount").textContent = `${data.total} review(s)`;
    document.getElementById("reviewPending").textContent = data.summary.pending || 0;
    document.getElementById("reviewApproved").textContent = data.summary.approved || 0;
    const root = document.getElementById("reviewTable");
    if (!data.reviews.length) {
      root.innerHTML = `<tbody><tr><td class="a-empty">No reviews found.</td></tr></tbody>`;
      return;
    }
    root.innerHTML = `
      <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Status</th><th>Reply</th><th>Flags</th><th>Date</th><th></th></tr></thead>
      <tbody>${data.reviews.map(r => `
        <tr>
          <td><strong>${AdminShell.esc(r.productName)}</strong><br><span style="color:var(--a-text-soft);font-size:12px;">#${r.productId}</span></td>
          <td>${AdminShell.esc(r.customerName)}<br><span style="color:var(--a-text-soft);font-size:12px;">${AdminShell.esc(r.customerEmail || "")}</span></td>
          <td>${stars(r.rating)}</td>
          <td><span class="badge ${r.status === "approved" ? "green" : r.status === "pending" ? "amber" : r.status === "spam" ? "red" : "gray"}">${r.status}</span>${r.featured ? '<br><span class="badge blue" style="margin-top:4px;">Featured</span>' : ""}</td>
          <td style="max-width:220px;color:var(--a-text-soft);">${AdminShell.esc(r.reply || "—")}</td>
          <td style="color:var(--a-text-soft);">${(r.tags || []).join(", ") || "—"}</td>
          <td style="color:var(--a-text-soft);">${AdminShell.fmtDate(r.createdAt)}</td>
          <td style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="a-btn ghost" data-approve="${r.id}" style="padding:7px 11px;">Approve</button>
            <button class="a-btn ghost" data-reject="${r.id}" style="padding:7px 11px;">Reject</button>
            <button class="a-btn ghost" data-spam="${r.id}" style="padding:7px 11px;">Spam</button>
            <button class="a-btn ghost" data-edit="${r.id}" style="padding:7px 11px;">Edit</button>
            <button class="a-btn ghost" data-del="${r.id}" data-name="${AdminShell.esc(r.customerName)}" style="padding:7px 11px;color:var(--a-red);">Delete</button>
          </td>
        </tr>`).join("")}</tbody>`;
    root.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => quickStatus(btn, btn.dataset.approve, "approved", "Approving")));
    root.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => quickStatus(btn, btn.dataset.reject, "rejected", "Rejecting")));
    root.querySelectorAll("[data-spam]").forEach(btn => btn.addEventListener("click", () => quickStatus(btn, btn.dataset.spam, "spam", "Flagging")));
    root.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
      const row = data.reviews.find(r => r.id === btn.dataset.edit);
      if (row) openForm(row);
    }));
    root.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => remove(btn, btn.dataset.del, btn.dataset.name)));
  }

  await load();
})();
