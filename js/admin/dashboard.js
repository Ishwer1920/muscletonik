/* Dashboard: premium hero + KPI widgets + 7-day revenue chart + recent orders + best sellers. */
(async () => {
  const STATUS_TONE = {
    delivered: "green",
    cancelled: "red",
    returned: "red",
    refunded: "red",
    pending: "gray",
    confirmed: "blue",
    packed: "blue",
    ready_to_ship: "blue",
    shipped: "amber",
    out_for_delivery: "amber"
  };

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <section class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">${AdminShell.esc("Premium workspace")}</span>
        <h2>Run Muscle Tonik like a modern ecommerce platform.</h2>
        <p>Review drafts, preview changes, and publish only when the team is ready. This shell is designed to feel closer to Shopify and Stripe than a CRUD dashboard.</p>
        <div class="a-hero-actions">
          <button type="button" class="a-btn primary" id="dashPreviewBtn">${AdminShell.esc("Preview Website")}</button>
          <button type="button" class="a-btn" id="dashReviewBtn">${AdminShell.esc("Request Review")}</button>
          <button type="button" class="a-btn" id="dashShareBtn">${AdminShell.esc("Share Preview")}</button>
        </div>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card">
          <span>Workspace</span>
          <strong>Production</strong>
          <p>Switch instantly from Production to Preview, Development, or Draft in the sidebar.</p>
        </div>
        <div class="a-stat-card">
          <span>Workflow</span>
          <strong>Draft first</strong>
          <p>Changes stay editable until the team approves review and you explicitly publish.</p>
        </div>
      </div>
    </section>
    <div class="kpi-grid" id="kpiGrid">${skeletonKpis()}</div>
    <div class="grid-2">
      <div class="a-card">
        <div class="a-card-head"><h3>Revenue - last 7 days</h3><span class="badge orange" id="revTotal">-</span></div>
        <div class="a-card-body"><div class="chart-wrap" id="chart"><div class="skel" style="height:230px;"></div></div></div>
      </div>
      <div class="a-card">
        <div class="a-card-head"><h3>Best sellers</h3></div>
        <div class="a-card-body" id="bestSellers"><div class="skel" style="height:180px;"></div></div>
      </div>
    </div>
    <div class="a-card">
      <div class="a-card-head"><h3>Recent orders</h3><a class="a-btn ghost" href="/admin/orders.html">Manage orders</a></div>
      <div class="a-table-wrap"><table class="a-table" id="recentOrders"><tbody><tr><td>Loading...</td></tr></tbody></table></div>
    </div>`;

  const me = await AdminShell.init({ active: "dashboard", title: "Dashboard", sub: "Store overview", requires: "dashboard" });
  if (!me) return;

  document.getElementById("dashPreviewBtn")?.addEventListener("click", () => AdminShell.openPreviewWebsite());
  document.getElementById("dashReviewBtn")?.addEventListener("click", () => AdminShell.toast("Review request sent to your team"));
  document.getElementById("dashShareBtn")?.addEventListener("click", async () => {
    const url = window.location.origin + "/index.html?mt_preview=1";
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
      AdminShell.toast("Preview link copied");
    } else {
      AdminShell.toast("Preview link ready");
    }
  });

  try {
    const data = await AdminShell.api("/admin/stats", { method: "GET" });
    renderKpis(data.kpis);
    renderChart(data.revenueSeries);
    renderBestSellers(data.bestSellers);
    renderRecentOrders(data.recentOrders);
  } catch (err) {
    content.querySelector("#kpiGrid").innerHTML = `<p style="color:var(--a-red);">${AdminShell.esc(err.message)}</p>`;
  }

  function skeletonKpis() {
    return Array.from({ length: 5 }).map(() => `<div class="kpi-card"><div class="skel" style="height:64px;"></div></div>`).join("");
  }

  function kpi(label, value, hint, tone, icon) {
    const icons = {
      revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
    };
    return `<div class="kpi-card">
      <div class="top"><span class="label">${label}</span><span class="ic ic-${tone}">${icons[icon]}</span></div>
      <div class="value">${value}</div>
      <div class="hint">${hint}</div>
    </div>`;
  }

  function renderKpis(k) {
    document.getElementById("kpiGrid").innerHTML = [
      kpi("Today's Revenue", AdminShell.inr(k.todaysRevenue), `${k.todaysOrders} order(s) today`, "green", "revenue"),
      kpi("Pending Orders", k.pendingOrders, `${k.deliveredOrders} delivered · ${k.cancelledOrders} cancelled`, "orange", "clock"),
      kpi("Customers", k.customers, `${k.newUsersToday} new today`, "blue", "users"),
      kpi("Pending COD Value", AdminShell.inr(k.pendingCodValue), "to collect on delivery", "amber", "cart"),
      kpi("Inventory Alerts", k.lowStock + k.outOfStock, `${k.lowStock} low · ${k.outOfStock} out of stock`, k.outOfStock ? "red" : "amber", "alert")
    ].join("");
  }

  function renderChart(series) {
    const total = series.reduce((s, d) => s + d.revenue, 0);
    document.getElementById("revTotal").textContent = AdminShell.inr(total) + " total";
    const W = 620, H = 230, padB = 28, padL = 44, padT = 12;
    const max = Math.max(1, ...series.map(d => d.revenue));
    const bw = (W - padL - 10) / series.length;
    const y = v => padT + (H - padB - padT) * (1 - v / max);
    const gridLines = [0, 0.5, 1].map(f => {
      const val = max * f, yy = y(val);
      return `<line class="axis" x1="${padL}" y1="${yy}" x2="${W}" y2="${yy}"/><text x="${padL - 8}" y="${yy + 3}" text-anchor="end">${f === 0 ? 0 : "₹" + Math.round(val).toLocaleString("en-IN")}</text>`;
    }).join("");
    const bars = series.map((d, i) => {
      const x = padL + i * bw + bw * 0.2, w = bw * 0.6;
      const yy = y(d.revenue), h = (H - padB - yy);
      return `<rect class="bar" x="${x}" y="${yy}" width="${w}" height="${Math.max(0, h)}" rx="4"><title>${d.label}: ${AdminShell.inr(d.revenue)} (${d.orders} orders)</title></rect>
        <text x="${x + w / 2}" y="${H - padB + 16}" text-anchor="middle">${d.label}</text>`;
    }).join("");
    document.getElementById("chart").innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${gridLines}${bars}</svg>`;
  }

  function renderBestSellers(list) {
    const root = document.getElementById("bestSellers");
    if (!list.length) {
      root.innerHTML = `<div class="a-empty" style="padding:30px;">No sales yet.</div>`;
      return;
    }
    const max = Math.max(...list.map(b => b.quantity));
    root.innerHTML = list.map(b => `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
          <span style="font-weight:600;">${AdminShell.esc(b.name)}</span>
          <span style="color:var(--a-text-soft);">${b.quantity} sold · ${AdminShell.inr(b.revenue)}</span>
        </div>
        <div style="height:7px;background:var(--a-surface-2);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${Math.round((b.quantity / max) * 100)}%;background:var(--a-primary);border-radius:5px;"></div>
        </div>
      </div>`).join("");
  }

  function renderRecentOrders(orders) {
    const t = document.getElementById("recentOrders");
    if (!orders.length) {
      t.innerHTML = `<tbody><tr><td class="a-empty">No orders yet.</td></tr></tbody>`;
      return;
    }
    t.innerHTML = `
      <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${orders.map(o => `
        <tr>
          <td><strong>${AdminShell.esc(o.orderNumber)}</strong></td>
          <td>${AdminShell.esc(o.customer)}</td>
          <td style="font-weight:700;">${AdminShell.inr(o.total)}</td>
          <td>${o.paymentProvider === "cod" ? '<span class="badge amber">COD</span>' : '<span class="badge blue">Online</span>'}</td>
          <td><span class="badge ${STATUS_TONE[o.fulfillmentStatus] || "gray"}">${o.fulfillmentStatus.replace(/_/g, " ")}</span></td>
          <td style="color:var(--a-text-soft);">${AdminShell.fmtDate(o.createdAt)}</td>
        </tr>`).join("")}</tbody>`;
  }
})();
