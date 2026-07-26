(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Performance</span>
        <h2>Turn order data into actions.</h2>
        <p>Revenue, conversion and product performance are now surfaced in one place with export support and filtered breakdowns.</p>
        <div class="a-hero-actions">
          <button class="a-btn primary" id="analyticsExport">Export CSV</button>
          <a class="a-btn" href="/admin/orders.html">Open orders</a>
        </div>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Revenue</span><strong id="aRev">—</strong><p>Paid orders in the last 30 days.</p></div>
        <div class="a-stat-card"><span>AOV</span><strong id="aAov">—</strong><p>Average value of paid orders.</p></div>
      </div>
    </div>
    <div class="kpi-grid" id="analyticsKpis"></div>
    <div class="grid-2">
      <div class="a-card">
        <div class="a-card-head"><h3>30 day revenue</h3><span class="badge orange" id="analyticsSeriesTotal">—</span></div>
        <div class="a-card-body"><div class="chart-wrap" id="analyticsChart"><div class="skel" style="height:240px;"></div></div></div>
      </div>
      <div class="a-card">
        <div class="a-card-head"><h3>Top products</h3></div>
        <div class="a-card-body" id="analyticsProducts"></div>
      </div>
    </div>
    <div class="grid-2">
      <div class="a-card"><div class="a-card-head"><h3>Order statuses</h3></div><div class="a-card-body" id="analyticsStatus"></div></div>
      <div class="a-card"><div class="a-card-head"><h3>Payment mix</h3></div><div class="a-card-body" id="analyticsProviders"></div></div>
    </div>`;

  const me = await AdminShell.init({ active: "reports", title: "Reports", sub: "Revenue and performance", requires: "analytics" });
  if (!me) return;

  document.getElementById("analyticsExport").addEventListener("click", () => {
    window.location.href = "/api/admin/analytics/export";
  });

  const data = await AdminShell.api("/admin/analytics", { method: "GET" });
  document.getElementById("aRev").textContent = AdminShell.inr(data.totals.paidRevenue);
  document.getElementById("aAov").textContent = AdminShell.inr(data.totals.avgOrderValue);
  document.getElementById("analyticsKpis").innerHTML = [
    metric("Orders", data.totals.totalOrders, "All orders in the system."),
    metric("Paid Orders", data.totals.paidOrders, "Completed checkout volume."),
    metric("Customers", data.totals.customers, "Registered customer accounts."),
    metric("Inventory Value", AdminShell.inr(data.totals.inventoryValue), "Stock value at current selling price.")
  ].join("");
  renderChart(data.revenueSeries);
  renderBars("analyticsStatus", data.byStatus, item => item.status || "unknown", item => item.count, "count");
  renderBars("analyticsProviders", data.byProvider, item => item.provider || "unknown", item => `${AdminShell.inr(item.revenue)} · ${item.count}`, "count");
  renderTopProducts(data.topProducts);

  function metric(label, value, hint) {
    return `<div class="kpi-card"><div class="top"><span class="label">${label}</span><span class="ic ic-blue">${AdminShell.esc(label[0])}</span></div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;
  }

  function renderChart(series) {
    const total = series.reduce((s, d) => s + d.revenue, 0);
    document.getElementById("analyticsSeriesTotal").textContent = AdminShell.inr(total);
    const W = 620, H = 240, padB = 30, padL = 42, padT = 14;
    const max = Math.max(1, ...series.map(d => d.revenue));
    const bw = (W - padL - 10) / series.length;
    const y = v => padT + (H - padB - padT) * (1 - v / max);
    const bars = series.map((d, i) => {
      const x = padL + i * bw + bw * 0.2, w = bw * 0.6;
      const yy = y(d.revenue), h = (H - padB - yy);
      return `<rect class="bar" x="${x}" y="${yy}" width="${w}" height="${Math.max(0, h)}" rx="4"><title>${d.date}: ${AdminShell.inr(d.revenue)}</title></rect>
      <text x="${x + w / 2}" y="${H - padB + 16}" text-anchor="middle">${d.date.slice(5)}</text>`;
    }).join("");
    document.getElementById("analyticsChart").innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${bars}</svg>`;
  }

  function renderBars(rootId, list, labelFn, valueFn, tone) {
    const root = document.getElementById(rootId);
    if (!list.length) {
      root.innerHTML = '<div class="a-empty" style="padding:22px 0;">No data available.</div>';
      return;
    }
    const max = Math.max(...list.map(item => Number(item.count || item.quantity || 0)));
    root.innerHTML = list.map(item => {
      const value = Number(item.count || item.quantity || 0);
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:6px;">
            <span style="font-weight:600;">${AdminShell.esc(labelFn(item))}</span>
            <span style="color:var(--a-text-soft);">${AdminShell.esc(valueFn(item))}</span>
          </div>
          <div style="height:7px;background:var(--a-surface-2);border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${Math.max(4, Math.round((value / max) * 100))}%;background:var(--a-primary);border-radius:999px;"></div>
          </div>
        </div>`;
    }).join("");
  }

  function renderTopProducts(list) {
    const root = document.getElementById("analyticsProducts");
    if (!list.length) {
      root.innerHTML = '<div class="a-empty">No product sales yet.</div>';
      return;
    }
    root.innerHTML = list.map(item => `
      <div style="padding:12px 0;border-bottom:1px solid var(--a-border);">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <strong style="font-size:13px;">${AdminShell.esc(item.name)}</strong>
          <span style="color:var(--a-text-soft);">${item.quantity} sold</span>
        </div>
        <div style="color:var(--a-text-soft);font-size:12px;margin-top:4px;">${AdminShell.inr(item.revenue)}</div>
      </div>
    `).join("");
  }
})();
