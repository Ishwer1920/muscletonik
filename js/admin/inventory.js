/* Inventory — migrated to the reusable AdminTable. Real data from
   /api/admin/inventory (search, sort, stock-state filter, pagination).
   KPIs update from the response; stock is editable inline (real PATCH).
   Product.stock stays the single source of truth used at checkout. */
(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Inventory</h1>
    <p class="a-page-sub">Live stock levels. Editing here changes the stock used at checkout.</p>
    <div class="kpi-grid" id="invKpis">
      <div class="kpi-card"><div class="skel" style="height:64px;"></div></div>
      <div class="kpi-card"><div class="skel" style="height:64px;"></div></div>
      <div class="kpi-card"><div class="skel" style="height:64px;"></div></div>
    </div>
    <div id="invTable"></div>`;

  const me = await AdminShell.init({ active: "inventory", title: "Inventory", sub: "Commerce", requires: "inventory" });
  if (!me) return;

  const STATE = { ok: { c: "green", t: "In stock" }, low: { c: "amber", t: "Low" }, out: { c: "red", t: "Out" } };
  const kpiCard = (label, value, hint, tone) =>
    `<div class="kpi-card"><div class="top"><span class="label">${label}</span><span class="ic ic-${tone}"></span></div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;

  async function patchStock(id, body) {
    return AdminShell.api(`/admin/inventory/${id}/stock`, { method: "PATCH", body: JSON.stringify(body) });
  }

  const table = AdminTable.create({
    mount: "#invTable",
    label: "Inventory",
    storageKey: "inventory",
    exportName: "inventory",
    searchPlaceholder: "Search product, SKU, brand…",
    sort: { key: "stock", dir: "asc" },
    rowId: r => r.id,
    emptyTitle: "No products found",
    emptyText: "Try clearing the search or filter.",
    columns: [
      { key: "name", label: "Product", sortable: true, render: r => `<strong>${AdminShell.esc(r.name)}</strong>` },
      { key: "sku", label: "SKU", sortable: true, render: r => `<span style="color:var(--a-text-soft)">${AdminShell.esc(r.sku)}</span>` },
      { key: "brand", label: "Brand", sortable: true },
      { key: "price", label: "Price", sortable: true, render: r => AdminShell.inr(r.price), exportValue: r => r.price },
      { key: "stock", label: "Stock", sortable: true, render: r => `<strong style="font-size:15px">${r.stock}</strong>` },
      { key: "state", label: "State", hideable: true, render: r => `<span class="badge ${STATE[r.state].c}">${STATE[r.state].t}</span>`, exportValue: r => STATE[r.state].t },
      { key: "adjust", label: "Set stock", hideable: false, exportValue: () => "", render: r => `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;"><input class="a-input inv-stock" type="number" min="0" value="${r.stock}" style="width:88px;padding:6px 9px;" aria-label="New stock for ${AdminShell.esc(r.name)}"><button class="a-btn primary inv-save" style="padding:6px 12px;">Save</button><span class="inv-note" style="font-size:12px;"></span></div>` }
    ],
    filters: [
      { key: "state", label: "Stock", type: "select", options: [{ value: "in", label: "In stock" }, { value: "low", label: "Low" }, { value: "out", label: "Out of stock" }] }
    ],
    bulkActions: [
      { label: "Restock +10", run: async ids => { for (const id of ids) await patchStock(id, { delta: 10 }); AdminShell.toast(`Restocked ${ids.length} product(s) (+10)`); } }
    ],
    onRowRender: (r, tr) => {
      const input = tr.querySelector(".inv-stock");
      const btn = tr.querySelector(".inv-save");
      const note = tr.querySelector(".inv-note");
      if (!btn) return;
      btn.addEventListener("click", async () => {
        const val = Number(input.value);
        btn.disabled = true; note.textContent = "Saving…"; note.style.color = "var(--a-text-soft)";
        try {
          await patchStock(r.id, { stock: val });
          note.textContent = "Saved ✓"; note.style.color = "var(--a-green)";
          AdminShell.toast("Stock updated");
          table.reload();
        } catch (err) { note.textContent = err.message; note.style.color = "var(--a-red)"; }
        finally { btn.disabled = false; }
      });
    },
    onLoad: (res) => {
      document.getElementById("invKpis").innerHTML = [
        kpiCard("Inventory Value", AdminShell.inr(res.inventoryValue), "at selling price", "green"),
        kpiCard("Total Units", (res.totalUnits || 0).toLocaleString("en-IN"), "in stock", "blue"),
        kpiCard("Products", res.total, `low-stock threshold ≤ ${res.lowStockThreshold}`, "orange")
      ].join("");
    },
    fetch: async (query) => {
      const data = await AdminShell.api("/admin/inventory?" + AdminTable.qs(query), { method: "GET" });
      return { rows: data.items, total: data.total, page: data.page, totalPages: data.totalPages, inventoryValue: data.inventoryValue, totalUnits: data.totalUnits, lowStockThreshold: data.lowStockThreshold };
    }
  });
})();
