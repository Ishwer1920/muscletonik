/* Audit log: append-only record of privileged admin actions (super_admin). */
(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Audit Log</h1>
    <p class="a-page-sub">Every privileged action, who performed it, and when.</p>
    <div class="a-card"><div class="a-table-wrap"><table class="a-table" id="auditTable"><tbody><tr><td>Loading…</td></tr></tbody></table></div></div>`;

  const me = await AdminShell.init({ active: "audit_logs", title: "Audit Log", sub: "Security", requires: "audit_logs" });
  if (!me) return;

  try {
    const { logs } = await AdminShell.api("/admin/audit", { method: "GET" });
    const t = document.getElementById("auditTable");
    if (!logs.length) { t.innerHTML = `<tbody><tr><td class="a-empty">No audit entries yet.</td></tr></tbody>`; return; }
    t.innerHTML = `
      <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>${logs.map(l => `
        <tr>
          <td style="color:var(--a-text-soft);white-space:nowrap;">${AdminShell.fmtDate(l.createdAt)}</td>
          <td>${AdminShell.esc(l.actorEmail)}<br><span class="badge gray">${AdminShell.esc((l.actorRole || "").replace("_", " "))}</span></td>
          <td><span class="badge blue">${AdminShell.esc(l.action)}</span></td>
          <td>${AdminShell.esc(l.target)}</td>
          <td style="max-width:320px;"><code style="font-size:11.5px;color:var(--a-text-soft);word-break:break-word;">${AdminShell.esc(JSON.stringify(l.details || {}))}</code></td>
        </tr>`).join("")}</tbody>`;
  } catch (err) {
    document.getElementById("auditTable").innerHTML = `<tbody><tr><td style="color:var(--a-red);">${AdminShell.esc(err.message)}</td></tr></tbody>`;
  }
})();
