/* ===========================================================
   MUSCLE TONIK - Customer "My Orders" page
   Lists the logged-in customer's own order history.
   =========================================================== */
async function ordersApi(path, options) {
  const base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : window.location.origin + "/api");
  const send = () => fetch(base + path, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    ...options
  });
  let res = await send();
  // Access token expired -> silently refresh once with the refresh cookie.
  if (res.status === 401) {
    if (await mtRefreshSession()) res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Unable to load orders");
    err.status = res.status;
    throw err;
  }
  return data;
}

const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
  paid: "Paid",
  failed: "Failed"
};

function statusLabel(value) {
  return STATUS_LABEL[value] || value || "—";
}

function paymentBadge(order) {
  if (order.paymentProvider === "cod") {
    return order.paymentStatus === "paid"
      ? "Cash on Delivery · Paid"
      : "Cash on Delivery · Pay on delivery";
  }
  return "Online · " + statusLabel(order.paymentStatus);
}

function orderCard(order) {
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const itemsHtml = order.items.map(item => `
    <div class="summary-row"><span>${item.name}${item.weight ? ` (${item.weight})` : ""} × ${item.quantity}</span><span>${formatINR(item.price * item.quantity)}</span></div>
  `).join("");
  return `
    <div class="card-box" style="margin-bottom:16px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;">${order.orderNumber}</h3>
          <p style="color:var(--text-light);font-size:13px;margin-top:4px;">${date}</p>
        </div>
        <span class="order-status-pill">${statusLabel(order.fulfillmentStatus)}</span>
      </div>
      <div style="margin-top:14px;">${itemsHtml}</div>
      <div class="summary-row"><span>GST + Delivery</span><span>${formatINR(order.gst + order.shipping)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${formatINR(order.total)}</span></div>
      ${deliveryBlock(order)}
      <p style="color:var(--text-light);font-size:13px;margin-top:10px;">${paymentBadge(order)}</p>
    </div>
  `;
}

// Delivery details, once an admin has filled them in (Admin -> Orders).
// Nothing is shown while they are blank rather than promising a date the
// shop has not committed to.
function deliveryBlock(order) {
  const rows = [];

  if (order.estimatedDeliveryDate) {
    const when = new Date(order.estimatedDeliveryDate);
    if (!isNaN(when)) {
      const label = order.fulfillmentStatus === "delivered" ? "Delivered on" : "Estimated delivery";
      rows.push(`<div class="order-delivery-row"><span>${label}</span>
        <b>${when.toLocaleDateString("en-IN", { dateStyle: "medium" })}</b></div>`);
    }
  }
  if (order.shippingProvider) {
    rows.push(`<div class="order-delivery-row"><span>Courier</span>
      <b>${escapeHtml(order.shippingProvider)}</b></div>`);
  }
  if (order.trackingNumber) {
    rows.push(`<div class="order-delivery-row"><span>Tracking number</span>
      <b class="order-tracking">${escapeHtml(order.trackingNumber)}</b></div>`);
  }
  if (!rows.length) return "";

  return `<div class="order-delivery">${rows.join("")}</div>`;
}

async function renderMyOrders() {
  const root = document.getElementById("ordersRoot");
  if (!root) return;

  try {
    const data = await ordersApi("/orders", { method: "GET" });
    const orders = data.orders || [];
    if (!orders.length) {
      root.innerHTML = `
        <div class="empty-state" style="padding:60px 20px;">
          <h3>No orders yet</h3>
          <p style="color:var(--text-light);margin:10px 0 22px;">Once you place an order it will show up here.</p>
          <a href="marketplace.html" class="btn btn-primary">Start Shopping</a>
        </div>`;
      return;
    }
    root.innerHTML = orders.map(orderCard).join("");
  } catch (err) {
    if (err.status === 401) {
      // Session gone — send them to login with a return link to this page.
      window.location.replace("login.html?next=" + encodeURIComponent("orders.html"));
      return;
    }
    root.innerHTML = `<p style="color:var(--primary);">${err.message}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  // Protected page: require a valid session before showing anything.
  const user = await requireClientAuth();
  if (!user) return; // redirected to login
  renderMyOrders();
});
