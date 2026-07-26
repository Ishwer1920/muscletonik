/* Team & Roles: list admin-panel accounts, add members, change role/status. */
(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div><h1 class="a-page-title">Team & Roles</h1><p class="a-page-sub">Manage admins, managers and staff, and what each can access.</p></div>
      <button class="a-btn primary" id="addBtn">+ Add member</button>
    </div>
    <div class="a-card">
      <div class="a-table-wrap"><table class="a-table" id="teamTable"><tbody><tr><td>Loading…</td></tr></tbody></table></div>
    </div>
    <div class="a-card">
      <div class="a-card-head"><h3>Role permissions reference</h3></div>
      <div class="a-card-body" id="permRef"></div>
    </div>`;

  const me = await AdminShell.init({ active: "team", title: "Team & Roles", sub: "Access control", requires: "team" });
  if (!me) return;

  const ROLE_TONE = { super_admin: "orange", admin: "blue", manager: "green", staff: "gray" };
  let data;

  async function load() {
    try {
      data = await AdminShell.api("/admin/team", { method: "GET" });
      renderTable();
      renderPermRef();
    } catch (err) {
      document.getElementById("teamTable").innerHTML = `<tbody><tr><td style="color:var(--a-red);">${AdminShell.esc(err.message)}</td></tr></tbody>`;
    }
  }

  function renderTable() {
    const rolesOpts = data.roles.map(r => r).join("|");
    const t = document.getElementById("teamTable");
    t.innerHTML = `
      <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
      <tbody>${data.team.map(m => {
        const isSelf = m.id === me.id;
        return `<tr data-id="${m.id}">
          <td><strong>${AdminShell.esc(m.name)}</strong><br><span style="color:var(--a-text-soft);font-size:12px;">${AdminShell.esc(m.email)}</span></td>
          <td>
            <select class="a-select role-sel" data-id="${m.id}" ${isSelf ? "disabled title='You cannot change your own role'" : ""} style="max-width:160px;">
              ${data.roles.map(r => `<option value="${r}" ${r === m.role ? "selected" : ""}>${r.replace("_", " ")}</option>`).join("")}
            </select>
          </td>
          <td><span class="badge ${m.status === "active" ? "green" : "red"}">${m.status}</span></td>
          <td style="color:var(--a-text-soft);">${AdminShell.fmtDate(m.createdAt)}</td>
          <td style="display:flex;gap:8px;">
            <button class="a-btn ghost save-btn" data-id="${m.id}" style="padding:7px 12px;">Save</button>
            ${isSelf ? "" : `<button class="a-btn ghost toggle-btn" data-id="${m.id}" data-status="${m.status}" style="padding:7px 12px;">${m.status === "active" ? "Block" : "Unblock"}</button>`}
          </td>
        </tr>`;
      }).join("")}</tbody>`;

    t.querySelectorAll(".save-btn").forEach(b => b.addEventListener("click", () => saveMember(b.dataset.id)));
    t.querySelectorAll(".toggle-btn").forEach(b => b.addEventListener("click", () => toggleStatus(b.dataset.id, b.dataset.status)));
  }

  function renderPermRef() {
    const MATRIX = {
      "Super Admin": "Everything — full platform control, team management, settings, audit logs.",
      "Admin": "Products, Orders, Customers, Inventory, Coupons, Analytics, Reviews, Content, Tasks.",
      "Manager": "Orders, Customers, Inventory, Shipping, Tasks (day-to-day fulfilment).",
      "Staff / Editor": "Content, Reviews and Product descriptions/images."
    };
    document.getElementById("permRef").innerHTML = Object.entries(MATRIX).map(([r, d]) =>
      `<div style="display:flex;gap:14px;padding:9px 0;border-bottom:1px solid var(--a-border);">
        <div style="min-width:130px;font-weight:700;">${r}</div>
        <div style="color:var(--a-text-soft);">${d}</div>
      </div>`).join("");
  }

  async function saveMember(id) {
    const sel = document.querySelector(`.role-sel[data-id="${id}"]`);
    try {
      await AdminShell.api("/admin/team/" + id, { method: "PATCH", body: JSON.stringify({ role: sel.value }) });
      AdminShell.toast("Role updated");
      load();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  async function toggleStatus(id, status) {
    const next = status === "active" ? "blocked" : "active";
    try {
      await AdminShell.api("/admin/team/" + id, { method: "PATCH", body: JSON.stringify({ status: next }) });
      AdminShell.toast("Member " + (next === "blocked" ? "blocked" : "unblocked"));
      load();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  // ---- Add-member modal ----
  const back = document.getElementById("teamModalBack");
  const form = document.getElementById("teamForm");
  const openModal = () => { form.reset(); document.getElementById("teamFormError").textContent = ""; back.classList.add("open"); };
  const closeModal = () => back.classList.remove("open");
  document.getElementById("addBtn").addEventListener("click", openModal);
  document.getElementById("teamCancel").addEventListener("click", closeModal);
  document.getElementById("teamModalClose").addEventListener("click", closeModal);
  back.addEventListener("click", e => { if (e.target === back) closeModal(); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await AdminShell.api("/admin/team", { method: "POST", body: JSON.stringify(payload) });
      AdminShell.toast("Team member created");
      closeModal();
      load();
    } catch (err) {
      document.getElementById("teamFormError").textContent = err.message;
    } finally { btn.disabled = false; }
  });

  load();
})();
