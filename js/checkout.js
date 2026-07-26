async function checkoutApi(path, options) {
  const base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : window.location.origin + "/api");
  const send = () => fetch(base + path, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    credentials: "include",
    ...options
  });

  let res = await send();
  // The access-token cookie lives for 15 minutes. If it has expired the request
  // comes back 401 — silently refresh it using the long-lived refresh cookie and
  // retry once. This keeps the session alive without weakening auth.
  if (res.status === 401) {
    const refreshed = await fetch(base + "/auth/refresh", { method: "POST", credentials: "include" }).catch(() => null);
    if (refreshed && refreshed.ok) res = await send();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Array.isArray(data.errors) ? data.errors.map(e => e.msg || e.message).filter(Boolean) : [];
    throw new Error(errors.length ? errors.join(" ") : (data.message || "Checkout failed"));
  }
  return data;
}

function renderCheckoutSummary(summary) {
  document.getElementById("checkoutSubtotal").textContent = formatINR(summary.subtotal);
  document.getElementById("checkoutDiscount").textContent = "- " + formatINR(summary.discount);
  document.getElementById("checkoutGst").textContent = formatINR(summary.gst);
  document.getElementById("checkoutShipping").textContent = summary.shipping === 0 ? "Free" : formatINR(summary.shipping);
  document.getElementById("checkoutTotal").textContent = formatINR(summary.total);
}

function renderCheckoutItems() {
  const root = document.getElementById("checkoutItems");
  const items = Cart.items().map(item => ({ ...item, product: getProductById(item.id) })).filter(item => item.product);
  if (!items.length) {
    root.innerHTML = '<div class="empty-state"><h3>Your cart is empty</h3><p style="color:var(--text-light);margin-top:8px;">Add items before starting checkout.</p><a class="btn btn-primary" href="marketplace.html" style="margin-top:16px;">Browse Products</a></div>';
    return false;
  }
  root.innerHTML = items.map(item => `
    <div class="cart-item">
      <div class="thumb" style="background:${item.product.color}18;display:flex;align-items:center;justify-content:center;">${productImage(item.product)}</div>
      <div>
        <h4>${item.product.name}</h4>
        <div style="font-size:12px;color:var(--text-light);margin-top:4px;">Qty ${item.qty}</div>
      </div>
      <div style="text-align:right;font-weight:800;font-family:'Poppins',sans-serif;">${formatINR(item.product.price * item.qty)}</div>
    </div>
  `).join("");
  return true;
}

async function initCheckout() {
  await Promise.resolve(window.MT_CATALOG_READY);
  if (!renderCheckoutItems()) return;
  const form = document.getElementById("checkoutForm");
  const message = document.getElementById("checkoutMessage");

  try {
    const me = await checkoutApi("/auth/me", { method: "GET" });
    if (me.user) Store.set("mt_user", me.user);
    updateAuthUI();
  } catch (err) {
    message.textContent = "Please log in to continue checkout.";
    return;
  }

  function buildPayload() {
    const fd = new FormData(form);
    return {
      items: Cart.items(),
      couponCode: String(fd.get("couponCode") || "").trim(),
      shippingAddress: {
        fullName: fd.get("fullName"),
        phone: fd.get("phone"),
        line1: fd.get("line1"),
        line2: fd.get("line2"),
        city: fd.get("city"),
        state: fd.get("state"),
        postalCode: fd.get("postalCode")
      }
    };
  }

  // Live order summary: totals (GST, shipping, coupon) are computed by the
  // server so the address step shows exactly what the payment step charges.
  async function refreshSummary() {
    try {
      const session = await checkoutApi("/checkout/session", {
        method: "POST",
        body: JSON.stringify(buildPayload())
      });
      renderCheckoutSummary(session.summary);
    } catch (err) {
      /* summary stays blank; submit will surface the real error */
    }
  }
  refreshSummary();
  const couponInput = form.querySelector('input[name="couponCode"]');
  if (couponInput) couponInput.addEventListener("change", refreshSummary);

  // Address step only collects details; the actual gateway (Card / UPI)
  // lives on payment.html, HealthKart-style.
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait...";
    message.textContent = "";

    try {
      const payload = buildPayload();
      // Validate cart + coupon + stock server-side before moving on.
      await checkoutApi("/checkout/session", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      sessionStorage.setItem("mt_payment_payload", JSON.stringify(payload));
      window.location.href = "payment.html";
    } catch (err) {
      message.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

document.addEventListener("DOMContentLoaded", initCheckout);
