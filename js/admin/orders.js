/* ===========================================================
   MUSCLE TONIK - Admin Orders dashboard
   Lists every order and lets an admin update fulfillment /
   payment status. Server enforces admin-only access; this page
   only renders what the API returns (403 -> access denied).
   =========================================================== */
async function adminApi(path, options) {
  const base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : window.location.origin + "/api");
  const send = () => fetch(base + path, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    ...options
  });
  let res = await send();
  if (res.status === 401) {
    // Share AdminShell's single in-flight refresh so parallel calls on this
    // page can't race each other into a bogus "session expired" sign-out.
    const refreshed = await AdminShell.refreshSession();
    if (refreshed) res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

const FULFILLMENT_OPTIONS = ["pending", "confirmed", "packed", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"];
const PAYMENT_OPTIONS = ["pending", "paid", "failed", "refunded"];
const LABEL = {
  pending: "Pending", confirmed: "Confirmed", packed: "Packed", ready_to_ship: "Ready to ship",
  shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered",
  cancelled: "Cancelled", returned: "Returned", refunded: "Refunded", paid: "Paid", failed: "Failed"
};
const label = v => LABEL[v] || v || "—";

function addressLine(a) {
  if (!a) return "";
  return [a.fullName, a.phone, a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", ");
}

function selectHtml(id, options, current) {
  return `<select class="admin-select" data-field="${id}">
    ${options.map(o => `<option value="${o}" ${o === current ? "selected" : ""}>${label(o)}</option>`).join("")}
  </select>`;
}

function orderRow(order) {
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const items = order.items.map(i => `${i.name} × ${i.quantity}`).join("<br>");
  const customer = order.customer ? `${order.customer.name || ""}<br><span style="color:var(--text-light);font-size:12px;">${order.customer.email || ""}</span>` : "—";
  const payType = order.paymentProvider === "cod" ? "Cash on Delivery" : "Online";
  return `
    <tr data-id="${order.id}">
      <td>
        <strong>${order.orderNumber}</strong><br>
        <span style="color:var(--text-light);font-size:12px;">${date}</span>
      </td>
      <td>${customer}</td>
      <td style="font-size:13px;">${items}</td>
      <td style="max-width:220px;font-size:12px;color:var(--text-light);">${addressLine(order.shippingAddress)}</td>
      <td style="font-weight:700;">${formatINR(order.total)}<br><span style="font-weight:500;color:var(--text-light);font-size:12px;">${payType}</span></td>
      <td>${selectHtml("fulfillmentStatus", FULFILLMENT_OPTIONS, order.fulfillmentStatus)}</td>
      <td>${selectHtml("paymentStatus", PAYMENT_OPTIONS, order.paymentStatus)}</td>
      <td><button class="btn btn-primary btn-save" type="button" style="padding:7px 14px;font-size:13px;">Save</button><span class="save-note" style="display:block;font-size:12px;margin-top:4px;"></span></td>
    </tr>`;
}

async function saveRow(tr) {
  const id = tr.getAttribute("data-id");
  const note = tr.querySelector(".save-note");
  const btn = tr.querySelector(".btn-save");
  const body = {};
  tr.querySelectorAll("select[data-field]").forEach(sel => { body[sel.getAttribute("data-field")] = sel.value; });
  btn.disabled = true;
  note.textContent = "Saving…";
  note.style.color = "var(--text-light)";
  try {
    await adminApi("/orders/admin/" + id, { method: "PATCH", body: JSON.stringify(body) });
    note.textContent = "Saved ✓";
    note.style.color = "green";
  } catch (err) {
    note.textContent = err.message;
    note.style.color = "var(--primary)";
  } finally {
    btn.disabled = false;
  }
}

async function loadOrders() {
  const root = document.getElementById("adminOrdersRoot");
  const controls = document.getElementById("adminOrdersControls");
  const provider = document.getElementById("providerFilter").value;
  const fulfillment = document.getElementById("fulfillmentFilter").value;
  const qs = [];
  if (provider) qs.push("paymentProvider=" + encodeURIComponent(provider));
  if (fulfillment) qs.push("fulfillmentStatus=" + encodeURIComponent(fulfillment));

  try {
    const data = await adminApi("/orders/admin" + (qs.length ? "?" + qs.join("&") : ""), { method: "GET" });
    controls.style.display = "flex";
    document.getElementById("ordersCount").textContent = data.count + " order(s)";
    if (!data.orders.length) {
      root.innerHTML = `<div class="empty-state" style="padding:50px 20px;"><h3>No orders match this filter</h3></div>`;
      return;
    }
    root.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Order</th><th>Customer</th><th>Items</th><th>Ship to</th><th>Total</th><th>Fulfillment</th><th>Payment</th><th></th>
          </tr></thead>
          <tbody>${data.orders.map(orderRow).join("")}</tbody>
        </table>
      </div>`;
    root.querySelectorAll(".btn-save").forEach(btn => {
      btn.addEventListener("click", () => saveRow(btn.closest("tr")));
    });
  } catch (err) {
    controls.style.display = "none";
    if (err.status === 403) {
      root.innerHTML = `<div class="empty-state" style="padding:60px 20px;"><h3>Admin access only</h3><p style="color:var(--text-light);margin:10px 0 22px;">Sign in with an administrator account to manage orders.</p><a href="login.html" class="btn btn-primary">Admin Login</a></div>`;
    } else if (err.status === 401) {
      root.innerHTML = `<div class="empty-state" style="padding:60px 20px;"><h3>Please log in</h3><p style="color:var(--text-light);margin:10px 0 22px;">You need to be signed in as an admin.</p><a href="login.html" class="btn btn-primary">Login</a></div>`;
    } else {
      root.innerHTML = `<p style="color:var(--primary);">${err.message}</p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  document.getElementById("refreshOrders").addEventListener("click", loadOrders);
  document.getElementById("providerFilter").addEventListener("change", loadOrders);
  document.getElementById("fulfillmentFilter").addEventListener("change", loadOrders);
  loadOrders();
});
