/* Customers — migrated to the reusable AdminTable. Real data from
   /api/admin/customers (search, sort, status + joined-date filters,
   pagination). Row/bulk actions block or unblock; detail drawer per row. */
(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Customers</h1>
    <p class="a-page-sub">Everyone who has registered on your store.</p>
    <div id="custTable"></div>`;

  const me = await AdminShell.init({ active: "customers", title: "Customers", sub: "Commerce", requires: "customers" });
  if (!me) return;

  const badge = s => `<span class="badge ${s === "active" ? "green" : "red"}">${s}</span>`;

  async function setStatus(ids, status) {
    for (const id of ids) await AdminShell.api("/admin/customers/" + id, { method: "PATCH", body: JSON.stringify({ status }) });
    AdminShell.toast(`${ids.length} customer(s) ${status === "blocked" ? "blocked" : "unblocked"}`);
  }

  const table = AdminTable.create({
    mount: "#custTable",
    label: "Customers",
    storageKey: "customers",
    exportName: "customers",
    searchPlaceholder: "Search name, email, phone…",
    sort: { key: "createdAt", dir: "desc" },
    rowId: r => r.id,
    emptyTitle: "No customers found",
    emptyText: "Try clearing the search or filters.",
    columns: [
      { key: "name", label: "Customer", sortable: true, render: r => `<strong>${AdminShell.esc(r.name)}</strong><br><span style="color:var(--a-text-soft);font-size:12px;">${AdminShell.esc(r.email)}</span>`, exportValue: r => `${r.name} <${r.email}>` },
      { key: "phone", label: "Phone", render: r => AdminShell.esc(r.phone) || "—" },
      { key: "orders", label: "Orders" },
      { key: "spent", label: "Spent", render: r => AdminShell.inr(r.spent), exportValue: r => r.spent },
      { key: "status", label: "Status", sortable: true, render: r => badge(r.status) },
      { key: "createdAt", label: "Joined", sortable: true, render: r => AdminShell.fmtDate(r.createdAt), exportValue: r => new Date(r.createdAt).toISOString() }
    ],
    filters: [
      { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }] },
      { label: "Joined", type: "daterange", fromKey: "from", toKey: "to" }
    ],
    rowActions: r => [
      { label: "View", onClick: openDetail },
      { label: r.status === "active" ? "Block" : "Unblock", danger: r.status === "active", onClick: async row => { await setStatus([row.id], row.status === "active" ? "blocked" : "active"); table.reload(); } }
    ],
    bulkActions: [
      { label: "Block", danger: true, run: async ids => setStatus(ids, "blocked") },
      { label: "Unblock", run: async ids => setStatus(ids, "active") }
    ],
    fetch: async (query) => {
      const data = await AdminShell.api("/admin/customers?" + AdminTable.qs(query), { method: "GET" });
      return { rows: data.customers, total: data.total, page: data.page, totalPages: data.totalPages };
    }
  });

  // ---- detail drawer (unchanged behaviour) ----
  const back = document.getElementById("custModalBack");
  document.getElementById("custModalClose").addEventListener("click", () => back.classList.remove("open"));
  back.addEventListener("click", e => { if (e.target === back) back.classList.remove("open"); });

  async function openDetail(row) {
    const body = document.getElementById("custModalBody");
    body.innerHTML = `<div class="skel" style="height:160px;"></div>`;
    back.classList.add("open");
    try {
      const data = await AdminShell.api("/admin/customers/" + row.id, { method: "GET" });
      const c = data.customer;
      document.getElementById("custModalName").textContent = c.name;
      const addr = (c.addresses || []).map(a => `${a.line1}, ${a.city}, ${a.state} ${a.postalCode}`).join("<br>") || "No saved addresses";
      body.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;">
          <div><div style="color:var(--a-text-soft);font-size:12px;">Email</div><b>${AdminShell.esc(c.email)}</b></div>
          <div><div style="color:var(--a-text-soft);font-size:12px;">Phone</div><b>${AdminShell.esc(c.phone) || "—"}</b></div>
          <div><div style="color:var(--a-text-soft);font-size:12px;">Status</div>${badge(c.status)}</div>
          <div><div style="color:var(--a-text-soft);font-size:12px;">Wishlist</div><b>${c.wishlistCount} item(s)</b></div>
        </div>
        <div style="margin-bottom:16px;"><div style="color:var(--a-text-soft);font-size:12px;margin-bottom:4px;">Addresses</div>${addr}</div>
        <div style="color:var(--a-text-soft);font-size:12px;margin-bottom:6px;">Recent orders (${data.orders.length})</div>
        ${data.orders.length ? `<div class="a-table-wrap"><table class="a-table"><tbody>${data.orders.map(o => `
          <tr><td><strong>${AdminShell.esc(o.orderNumber)}</strong></td><td>${AdminShell.inr(o.total)}</td>
          <td>${o.paymentProvider === "cod" ? '<span class="badge amber">COD</span>' : '<span class="badge blue">Online</span>'}</td>
          <td><span class="badge gray">${o.fulfillmentStatus.replace(/_/g, " ")}</span></td>
          <td style="color:var(--a-text-soft);">${AdminShell.fmtDate(o.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : "No orders yet."}`;
    } catch (err) { body.innerHTML = `<p style="color:var(--a-red);">${AdminShell.esc(err.message)}</p>`; }
  }
})();
