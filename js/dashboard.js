/* ===========================================================
   MUSCLE TONIK - Authenticated customer dashboard
   Loads REAL user data from the backend (/auth/me, /orders).
   Redirects to login when there is no valid session.
   =========================================================== */

const ADMIN_ROLES = ["staff", "manager", "admin", "super_admin"];

const DASH_STATUS_LABEL = {
  pending: "Pending", confirmed: "Confirmed", packed: "Packed", ready_to_ship: "Ready to ship",
  shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered",
  cancelled: "Cancelled", returned: "Returned", refunded: "Refunded", paid: "Paid", failed: "Failed"
};
function dashStatus(v) { return DASH_STATUS_LABEL[v] || v || "—"; }

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MT";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function avatarMarkup(user, size) {
  if (user.avatarUrl) {
    return `<span class="avatar" style="width:${size}px;height:${size}px;"><img src="${escapeHtml(user.avatarUrl)}" alt="Profile photo"></span>`;
  }
  return `<span class="avatar avatar-initials" style="width:${size}px;height:${size}px;">${initials(user.name)}</span>`;
}

// Build a short, human notification feed from real account state.
function buildNotifications(user, orders) {
  const notes = [];
  if (!user.emailVerified) {
    notes.push({ icon: "shield", text: "Your email isn't verified yet. Check your inbox for the verification link.", tone: "warn" });
  }
  const latest = orders[0];
  if (latest) {
    notes.push({ icon: "cart", text: `Order ${latest.orderNumber} is ${dashStatus(latest.fulfillmentStatus).toLowerCase()}.`, tone: "info" });
  }
  const delivered = orders.filter(o => o.fulfillmentStatus === "delivered").length;
  if (delivered) {
    notes.push({ icon: "check", text: `${delivered} of your ${orders.length} orders ${delivered === 1 ? "has" : "have"} been delivered.`, tone: "ok" });
  }
  if (!orders.length) {
    notes.push({ icon: "star", text: "Welcome to Muscle Tonik! Place your first order to start earning Tonik Points.", tone: "info" });
  }
  return notes;
}

function statTile(label, value, href, iconName) {
  return `
    <a class="dash-stat" href="${href}">
      <span class="dash-stat-icon">${icon(iconName, 20)}</span>
      <span class="dash-stat-value">${value}</span>
      <span class="dash-stat-label">${label}</span>
    </a>`;
}

function recentOrderRow(order) {
  const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "";
  const count = order.items.reduce((s, i) => s + i.quantity, 0);
  return `
    <a class="dash-order" href="orders.html">
      <div>
        <strong>${order.orderNumber}</strong>
        <span class="dash-order-meta">${date} · ${count} item${count === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-order-right">
        <span class="dash-order-total">${formatINR(order.total)}</span>
        <span class="order-status-pill">${dashStatus(order.fulfillmentStatus)}</span>
      </div>
    </a>`;
}

function renderDashboard(user, orders) {
  const root = document.getElementById("dashboardRoot");
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—";
  const verified = user.emailVerified
    ? `<span class="badge-verified">${icon("check", 14)} Verified</span>`
    : `<span class="badge-unverified">Unverified</span>`;
  const recent = orders.slice(0, 4);
  const notes = buildNotifications(user, orders);
  const wishCount = typeof Wishlist !== "undefined" ? Wishlist.items().length : 0;
  const cartCount = typeof Cart !== "undefined" ? Cart.count() : 0;

  root.innerHTML = `
    <div class="dash-grid">
      <section class="dash-main">
        <div class="dash-hero card-box">
          ${avatarMarkup(user, 72)}
          <div class="dash-hero-info">
            <h2>${escapeHtml(user.name || "Customer")} ${verified}</h2>
            <p>${escapeHtml(user.email || "")}</p>
            <p class="dash-hero-sub">Member since ${memberSince}${user.phone ? " · " + escapeHtml(user.phone) : ""}</p>
          </div>
          <a class="btn btn-primary dash-hero-edit" href="profile.html">Edit Profile</a>
        </div>

        <div class="dash-stats">
          ${statTile("Total Orders", orders.length, "orders.html", "cart")}
          ${statTile("Wishlist", wishCount, "wishlist.html", "heart")}
          ${statTile("In Cart", cartCount, "cart.html", "cart")}
        </div>

        <div class="card-box">
          <div class="dash-section-head">
            <h3>Recent Orders</h3>
            <a href="orders.html">View all</a>
          </div>
          <div class="dash-orders">
            ${recent.length ? recent.map(recentOrderRow).join("") : `
              <div class="empty-state" style="padding:32px 12px;">
                <p style="color:var(--text-light);margin-bottom:16px;">You haven't placed any orders yet.</p>
                <a class="btn btn-primary" href="marketplace.html">Start Shopping</a>
              </div>`}
          </div>
        </div>
      </section>

      <aside class="dash-side">
        <div class="card-box">
          <h3>Notifications</h3>
          <div class="dash-notes">
            ${notes.map(n => `
              <div class="dash-note dash-note-${n.tone}">
                <span class="dash-note-icon">${icon(n.icon, 16)}</span>
                <span>${n.text}</span>
              </div>`).join("")}
          </div>
        </div>

        <div class="card-box">
          <h3>Account</h3>
          <div class="account-links">
            <a href="profile.html" class="account-link">Profile &amp; Settings</a>
            <a href="orders.html" class="account-link">My Orders</a>
            <a href="wishlist.html" class="account-link">Wishlist</a>
            <a href="change-password.html" class="account-link">Change Password</a>
            ${ADMIN_ROLES.includes(user.role) ? '<a href="/admin/dashboard.html" class="account-link">Admin Dashboard</a>' : ""}
            <a href="login.html" class="account-link account-link-danger" onclick="return logoutUser(event)">Logout</a>
          </div>
        </div>
      </aside>
    </div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  const user = await requireClientAuth();
  if (!user) return; // redirected to login

  let orders = [];
  try {
    const data = await mtAuthFetch("/orders", { method: "GET" });
    orders = data.orders || [];
  } catch (err) {
    /* dashboard still renders without the orders list */
  }
  renderDashboard(user, orders);
});
