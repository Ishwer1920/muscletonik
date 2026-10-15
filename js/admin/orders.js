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

// <input type="date"> needs YYYY-MM-DD; the API sends a full ISO timestamp.
function dateValue(iso) {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
}

function deliveryCell(order) {
  return `
    <div style="display:grid;gap:6px;min-width:190px;">
      <label style="font-size:11px;color:var(--text-light);">Est. delivery
        <input class="admin-select" type="date" data-field="estimatedDeliveryDate"
          value="${dateValue(order.estimatedDeliveryDate)}" style="width:100%;">
      </label>
      <input class="admin-select" type="text" data-field="shippingProvider" placeholder="Courier"
        value="${escapeHtml(order.shippingProvider || "")}" style="width:100%;">
      <input class="admin-select" type="text" data-field="trackingNumber" placeholder="Tracking number"
        value="${escapeHtml(order.trackingNumber || "")}" style="width:100%;">
    </div>`;
}

// Image sets for the lightbox. Each item line that carries photos pushes its
// set here while the row HTML is built; the clickable name/thumb keeps the set's
// index in data-lb, and one delegated handler opens the viewer. Reset on every
// render so indices never point at a stale set.
let MT_LB_SETS = [];
function registerLightbox(images, name) {
  MT_LB_SETS.push({ images: images.slice(), name: name || "" });
  return MT_LB_SETS.length - 1;
}

// Every photo the admin added for a product, newest-fallbacks included.
function itemImages(item) {
  if (Array.isArray(item.images) && item.images.length) return item.images.filter(Boolean);
  return item.image ? [item.image] : [];
}

// A thumbnail for one order line. Reuses the storefront's productImage() so a
// dead/absent photo URL falls back to the branded silhouette in the product's
// own tone instead of showing a broken-image icon.
function itemThumb(item) {
  const p = {
    images: item.image ? [item.image] : [],
    color: item.color || "#111111",
    name: item.productName || item.name || "Product"
  };
  if (typeof productImage === "function") return productImage(p);
  return item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : "";
}

// The "Items" cell: every product in the order on its own line, each with a
// photo, the full catalogue name, the chosen pack/weight and the quantity.
// Clicking the name (or thumbnail) opens every photo of that product in a
// lightbox with previous/next controls.
function itemsCell(order) {
  const list = order.items || [];
  if (!list.length) return `<span style="color:var(--text-light);">—</span>`;
  const lines = list.map(i => {
    const name = i.productName || i.name || "Item";
    const qty = Number(i.quantity) || 1;
    const images = itemImages(i);
    const meta = [];
    // Flavour first — it's what an admin scans for when packing a variant.
    if (i.flavor) meta.push(`<span class="ord-item-flavor">${escapeHtml(i.flavor)}</span>`);
    if (i.weight) meta.push(escapeHtml(i.weight));
    meta.push(`<span class="ord-item-qty">× ${qty}</span>`);

    let thumbClass = "ord-item-thumb";
    let nameHtml = `<span class="ord-item-name">${escapeHtml(name)}</span>`;
    if (images.length) {
      const idx = registerLightbox(images, name);
      const count = images.length > 1
        ? `<span class="ord-item-imgcount" title="${images.length} photos">${images.length}</span>` : "";
      thumbClass += " ord-lb-open";
      nameHtml = `<button type="button" class="ord-item-name ord-lb-open" data-lb="${idx}">${escapeHtml(name)}${count}</button>`;
      var thumbData = ` data-lb="${idx}" role="button" tabindex="0" title="View ${images.length} photo${images.length > 1 ? "s" : ""}"`;
    }
    const thumbAttrs = images.length ? thumbData : "";
    return `<div class="ord-item">
      <span class="${thumbClass}"${thumbAttrs} style="background:${escapeHtml(i.color || "#111111")}14;">${itemThumb(i)}</span>
      <span class="ord-item-info">
        ${nameHtml}
        <span class="ord-item-meta">${meta.join(" · ")}</span>
      </span>
    </div>`;
  }).join("");
  return `<div class="ord-items">${lines}</div>`;
}

// Build the image lightbox once, lazily, and reuse it. Returns { open }.
function ensureLightbox() {
  if (window.__mtOrdersLightbox) return window.__mtOrdersLightbox;
  const overlay = document.createElement("div");
  overlay.className = "ord-lightbox";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="ord-lb-backdrop" data-lb-close></div>
    <div class="ord-lb-dialog" role="dialog" aria-modal="true" aria-label="Product images">
      <button type="button" class="ord-lb-x" data-lb-close aria-label="Close">×</button>
      <button type="button" class="ord-lb-nav ord-lb-prev" aria-label="Previous image">‹</button>
      <div class="ord-lb-stage"><img class="ord-lb-img" alt=""></div>
      <button type="button" class="ord-lb-nav ord-lb-next" aria-label="Next image">›</button>
      <div class="ord-lb-cap"><span class="ord-lb-title"></span><span class="ord-lb-count"></span></div>
    </div>`;
  document.body.appendChild(overlay);

  const state = { images: [], index: 0, name: "" };
  const imgEl = overlay.querySelector(".ord-lb-img");
  const titleEl = overlay.querySelector(".ord-lb-title");
  const countEl = overlay.querySelector(".ord-lb-count");
  const prevBtn = overlay.querySelector(".ord-lb-prev");
  const nextBtn = overlay.querySelector(".ord-lb-next");

  function show(i) {
    const n = state.images.length;
    if (!n) return;
    state.index = (i + n) % n;          // wrap around both ends
    imgEl.classList.remove("is-broken");
    imgEl.src = state.images[state.index];
    titleEl.textContent = state.name;
    countEl.textContent = n > 1 ? `${state.index + 1} / ${n}` : "";
    const many = n > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
  }
  function open(images, name, start) {
    state.images = images || [];
    state.name = name || "";
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    show(start || 0);
  }
  function close() {
    overlay.hidden = true;
    imgEl.removeAttribute("src");
    document.body.style.overflow = "";
  }

  prevBtn.addEventListener("click", () => show(state.index - 1));
  nextBtn.addEventListener("click", () => show(state.index + 1));
  overlay.addEventListener("click", e => { if (e.target.hasAttribute("data-lb-close")) close(); });
  imgEl.addEventListener("error", () => { imgEl.classList.add("is-broken"); });
  document.addEventListener("keydown", e => {
    if (overlay.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(state.index - 1);
    else if (e.key === "ArrowRight") show(state.index + 1);
  });

  window.__mtOrdersLightbox = { open, close };
  return window.__mtOrdersLightbox;
}

function openItemLightbox(idx) {
  const set = MT_LB_SETS[idx];
  if (!set || !set.images.length) return;
  ensureLightbox().open(set.images, set.name, 0);
}

function orderRow(order) {
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const items = itemsCell(order);
  const customer = order.customer ? `${order.customer.name || ""}<br><span style="color:var(--text-light);font-size:12px;">${order.customer.email || ""}</span>` : "—";
  const payType = order.paymentProvider === "cod" ? "Cash on Delivery" : "Online";
  return `
    <tr data-id="${order.id}">
      <td>
        <strong>${order.orderNumber}</strong><br>
        <span style="color:var(--text-light);font-size:12px;">${date}</span>
      </td>
      <td>${customer}</td>
      <td style="vertical-align:top;">${items}</td>
      <td style="max-width:220px;font-size:12px;color:var(--text-light);">${addressLine(order.shippingAddress)}</td>
      <td style="font-weight:700;">${formatINR(order.total)}<br><span style="font-weight:500;color:var(--text-light);font-size:12px;">${payType}</span></td>
      <td>${selectHtml("fulfillmentStatus", FULFILLMENT_OPTIONS, order.fulfillmentStatus)}</td>
      <td>${selectHtml("paymentStatus", PAYMENT_OPTIONS, order.paymentStatus)}</td>
      <td>${deliveryCell(order)}</td>
      <td><button class="btn btn-primary btn-save" type="button" style="padding:7px 14px;font-size:13px;">Save</button><span class="save-note" style="display:block;font-size:12px;margin-top:4px;"></span></td>
    </tr>`;
}

async function saveRow(tr) {
  const id = tr.getAttribute("data-id");
  const note = tr.querySelector(".save-note");
  const btn = tr.querySelector(".btn-save");
  const body = {};
  tr.querySelectorAll("[data-field]").forEach(el => { body[el.getAttribute("data-field")] = el.value; });
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
    // Reset the lightbox registry before orderRow()/itemsCell() repopulate it.
    MT_LB_SETS = [];
    root.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Order</th><th>Customer</th><th>Items</th><th>Ship to</th><th>Total</th><th>Fulfillment</th><th>Payment</th><th>Delivery</th><th></th>
          </tr></thead>
          <tbody>${data.orders.map(orderRow).join("")}</tbody>
        </table>
      </div>`;
    root.querySelectorAll(".btn-save").forEach(btn => {
      btn.addEventListener("click", () => saveRow(btn.closest("tr")));
    });
    // Open the product image lightbox from a clicked name or thumbnail.
    root.querySelectorAll(".ord-lb-open").forEach(el => {
      el.addEventListener("click", () => openItemLightbox(Number(el.getAttribute("data-lb"))));
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openItemLightbox(Number(el.getAttribute("data-lb")));
        }
      });
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

// Step back to wherever the admin came from. history.back() alone is not
// enough: opened in a fresh tab there is nothing behind this page, so the
// button would do nothing at all. Fall back to the storefront home in that
// case, and never step back to another site.
function wireBackButton() {
  const button = document.getElementById("pageBack");
  if (!button) return;
  button.addEventListener("click", () => {
    const cameFromHere = document.referrer && document.referrer.indexOf(window.location.origin) === 0;
    if (cameFromHere && window.history.length > 1) window.history.back();
    else window.location.href = "/index.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Wired before the catalogue await so the button works while orders load.
  wireBackButton();
  await Promise.resolve(window.MT_CATALOG_READY);
  document.getElementById("refreshOrders").addEventListener("click", loadOrders);
  document.getElementById("providerFilter").addEventListener("change", loadOrders);
  document.getElementById("fulfillmentFilter").addEventListener("change", loadOrders);
  loadOrders();
});
