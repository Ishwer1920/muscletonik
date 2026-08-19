/* ===========================================================
   MUSCLE TONIK - Payment gateway page (HealthKart-style)
   Two methods only: Debit/Credit Card + Pay Using UPI.
   Card uses Razorpay Custom Checkout (razorpay.js) so the card
   is entered on OUR page; UPI opens Razorpay's secure QR window.
   =========================================================== */

const PAY_STORAGE_KEY = "mt_payment_payload";

const PayState = {
  payload: null,   // items + address + coupon, saved by checkout.html
  summary: null,   // authoritative totals from POST /checkout/session
  user: null,
  method: "card",
  busy: false
};

function rupees(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

async function payApi(path, options) {
  const base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : window.location.origin + "/api");
  const send = () => fetch(base + path, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    ...options
  });
  let res = await send();
  if (res.status === 401) {
    if (await mtRefreshSession()) res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Array.isArray(data.errors) ? data.errors.map(e => e.msg || e.message).filter(Boolean) : [];
    throw new Error(errors.length ? errors.join(" ") : (data.message || "Payment failed"));
  }
  return data;
}

function showPayError(text) {
  const box = document.getElementById("payMessage");
  box.textContent = text || "";
  box.hidden = !text;
}

/* ---------- method tabs ---------- */
function switchMethod(method) {
  PayState.method = method;
  document.querySelectorAll(".pay-method").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  document.getElementById("panelCard").hidden = method !== "card";
  document.getElementById("panelUpi").hidden = method !== "upi";
  showPayError("");
}

/* ---------- fake QR preview (blurred, like HealthKart) ---------- */
function drawQrPreview() {
  const canvas = document.getElementById("upiQrPreview");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const cells = 22, size = canvas.width / cells;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1b1b1b";
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (Math.random() > 0.55) ctx.fillRect(x * size, y * size, size, size);
    }
  }
  // the three "finder" squares that make it read as a QR code
  [[0, 0], [cells - 7, 0], [0, cells - 7]].forEach(([cx, cy]) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx * size, cy * size, size * 7, size * 7);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(cx * size, cy * size, size * 7, size * 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect((cx + 1) * size, (cy + 1) * size, size * 5, size * 5);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect((cx + 2) * size, (cy + 2) * size, size * 3, size * 3);
  });
}

/* ---------- card helpers ---------- */
function cardDigits() {
  return document.getElementById("cardNumber").value.replace(/\D/g, "");
}

function detectBrand(digits) {
  if (/^4/.test(digits)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "MC";
  if (/^3[47]/.test(digits)) return "AMEX";
  if (/^(60|65|81|82|508)/.test(digits)) return "RUPAY";
  return "";
}

function luhnValid(digits) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

function parseExpiry(value) {
  const m = value.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]), year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return null;
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return null;
  return { month: m[1], year: String(year) };
}

function cardFormValid() {
  const digits = cardDigits();
  const brand = detectBrand(digits);
  const wantLen = brand === "AMEX" ? 15 : 16;
  const cvvLen = brand === "AMEX" ? 4 : 3;
  const name = document.getElementById("cardName").value.trim();
  const expiry = parseExpiry(document.getElementById("cardExpiry").value);
  const cvv = document.getElementById("cardCvv").value;
  return digits.length === wantLen && luhnValid(digits) && name.length >= 2 && !!expiry && cvv.length === cvvLen;
}

function refreshCardUI() {
  const brand = detectBrand(cardDigits());
  const brandEl = document.getElementById("cardBrand");
  if (brand) brandEl.textContent = brand;
  else brandEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
  const btn = document.getElementById("cardPayBtn");
  btn.disabled = PayState.busy || !cardFormValid() || !PayState.summary;
  btn.textContent = PayState.summary ? "Securely Pay " + rupees(PayState.summary.total) : "Securely Pay";
}

function bindCardInputs() {
  const number = document.getElementById("cardNumber");
  const expiry = document.getElementById("cardExpiry");
  const cvv = document.getElementById("cardCvv");
  const name = document.getElementById("cardName");

  number.addEventListener("input", () => {
    const digits = number.value.replace(/\D/g, "").slice(0, 16);
    number.value = digits.replace(/(.{4})/g, "$1 ").trim();
    refreshCardUI();
  });
  expiry.addEventListener("input", () => {
    let v = expiry.value.replace(/\D/g, "").slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
    expiry.value = v;
    refreshCardUI();
  });
  cvv.addEventListener("input", () => {
    cvv.value = cvv.value.replace(/\D/g, "").slice(0, 4);
    refreshCardUI();
  });
  name.addEventListener("input", refreshCardUI);
}

/* ---------- Razorpay flows ---------- */
async function createGatewayOrder() {
  return payApi("/checkout/order", { method: "POST", body: JSON.stringify(PayState.payload) });
}

async function verifyAndFinish(response) {
  const verified = await payApi("/checkout/verify", {
    method: "POST",
    body: JSON.stringify({
      ...PayState.payload,
      session: PayState.payload,
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
      paymentStatus: "paid"
    })
  });
  Cart.clear();
  sessionStorage.removeItem(PAY_STORAGE_KEY);
  window.location.href = "order-success.html?order=" + encodeURIComponent(verified.order.orderNumber);
}

function setBusy(busy) {
  PayState.busy = busy;
  document.getElementById("upiBtn").disabled = busy;
  document.getElementById("stripPayBtn").disabled = busy;
  refreshCardUI();
}

// Standard Razorpay popup restricted to one method. Used for UPI (shows the
// scan-to-pay QR) and as a fallback for cards if custom checkout is blocked.
function openRestrictedCheckout(order, method) {
  const blocks = {};
  blocks[method] = {
    name: method === "upi" ? "Pay Using UPI" : "Debit / Credit Card",
    instruments: [method === "upi" ? { method: "upi", flows: ["qr", "collect", "intent"] } : { method: "card" }]
  };
  const rzp = new Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,
    name: "Muscle Tonik",
    description: "Supplement order payment",
    prefill: {
      name: PayState.payload.shippingAddress.fullName,
      contact: PayState.payload.shippingAddress.phone,
      email: PayState.user && PayState.user.email ? PayState.user.email : undefined
    },
    config: {
      display: {
        blocks,
        sequence: ["block." + method],
        preferences: { show_default_blocks: false }
      }
    },
    handler: response => {
      verifyAndFinish(response).catch(err => { showPayError(err.message); setBusy(false); });
    },
    modal: {
      ondismiss: () => {
        showPayError("Payment was cancelled. You can retry anytime.");
        setBusy(false);
      }
    }
  });
  rzp.on("payment.failed", response => {
    showPayError(response.error && response.error.description ? response.error.description : "Payment failed. Please try again.");
  });
  rzp.open();
}

async function payWithCard() {
  if (!cardFormValid() || PayState.busy) return;
  showPayError("");
  setBusy(true);
  const btn = document.getElementById("cardPayBtn");
  btn.textContent = "Processing...";
  try {
    const order = await createGatewayOrder();
    const expiry = parseExpiry(document.getElementById("cardExpiry").value);
    const custom = window.RazorpayCustom;

    // Custom checkout keeps the whole card flow on our page (3-D Secure OTP
    // opens in a bank popup). If it is unavailable, fall back to Razorpay's
    // popup restricted to cards so the customer can still pay.
    let rz = null;
    try { rz = custom ? new custom({ key: order.keyId }) : null; } catch (e) { rz = null; }
    if (!rz || typeof rz.createPayment !== "function") {
      openRestrictedCheckout(order, "card");
      return;
    }
    rz.createPayment({
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      email: PayState.user && PayState.user.email ? PayState.user.email : "customer@muscletonik.local",
      contact: String(PayState.payload.shippingAddress.phone || "9999999999"),
      method: "card",
      "card[name]": document.getElementById("cardName").value.trim(),
      "card[number]": cardDigits(),
      "card[cvv]": document.getElementById("cardCvv").value,
      "card[expiry_month]": expiry.month,
      "card[expiry_year]": expiry.year.slice(-2)
    });
    rz.on("payment.success", response => {
      verifyAndFinish(response).catch(err => { showPayError(err.message); setBusy(false); });
    });
    rz.on("payment.error", response => {
      showPayError(response && response.error && response.error.description ? response.error.description : "Payment failed. Please try again.");
      setBusy(false);
    });
  } catch (err) {
    showPayError(err.message);
    setBusy(false);
  }
}

async function payWithUpi() {
  if (PayState.busy) return;
  showPayError("");
  setBusy(true);
  const btn = document.getElementById("upiBtn");
  const original = btn.innerHTML;
  btn.textContent = "Generating QR...";
  try {
    const order = await createGatewayOrder();
    openRestrictedCheckout(order, "upi");
  } catch (err) {
    showPayError(err.message);
    setBusy(false);
  } finally {
    btn.innerHTML = original;
  }
}

/* ---------- summary ---------- */
function renderSummary(summary, itemCount) {
  document.getElementById("summaryCount").textContent = "(" + itemCount + (itemCount === 1 ? " Item)" : " Items)");
  document.getElementById("payItemTotal").textContent = rupees(summary.subtotal);
  document.getElementById("payGst").textContent = rupees(summary.gst);
  const shippingEl = document.getElementById("payShipping");
  if (summary.shipping === 0) {
    shippingEl.textContent = "FREE";
    shippingEl.className = "free";
  } else {
    shippingEl.textContent = rupees(summary.shipping);
  }
  if (summary.discount > 0) {
    document.getElementById("payDiscountRow").hidden = false;
    document.getElementById("payDiscount").textContent = "- " + rupees(summary.discount);
  }
  document.getElementById("payTotal").textContent = rupees(summary.total);
  document.getElementById("payStripAmount").textContent = rupees(summary.total);
  document.getElementById("upiAmount").textContent = rupees(summary.total);

  const points = Math.floor(summary.total * 0.02);
  if (points > 0) {
    document.getElementById("payReward").hidden = false;
    document.getElementById("payRewardPoints").textContent = String(points);
  }
}

/* ---------- init ---------- */
async function initPaymentPage() {
  drawQrPreview();
  bindCardInputs();

  document.querySelectorAll(".pay-method").forEach(btn => {
    btn.addEventListener("click", () => switchMethod(btn.dataset.method));
  });
  document.getElementById("cardForm").addEventListener("submit", event => {
    event.preventDefault();
    payWithCard();
  });
  document.getElementById("upiBtn").addEventListener("click", payWithUpi);
  document.getElementById("stripPayBtn").addEventListener("click", () => {
    if (PayState.method === "upi") payWithUpi();
    else if (cardFormValid()) payWithCard();
    else showPayError("Enter your card details above, or switch to Pay Using UPI.");
  });

  // The address step stores everything we need in sessionStorage.
  try {
    PayState.payload = JSON.parse(sessionStorage.getItem(PAY_STORAGE_KEY));
  } catch (e) { PayState.payload = null; }
  if (!PayState.payload || !Array.isArray(PayState.payload.items) || !PayState.payload.items.length) {
    window.location.href = "checkout.html";
    return;
  }

  const topMessage = document.getElementById("payTopMessage");
  try {
    const me = await payApi("/auth/me", { method: "GET" });
    PayState.user = me.user || null;
    if (me.user) Store.set("mt_user", me.user);
  } catch (err) {
    topMessage.textContent = "Please log in to continue. Redirecting...";
    topMessage.hidden = false;
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
    return;
  }

  try {
    const session = await payApi("/checkout/session", { method: "POST", body: JSON.stringify(PayState.payload) });
    PayState.summary = session.summary;
    renderSummary(session.summary, session.items.length);
    refreshCardUI();
  } catch (err) {
    topMessage.textContent = err.message + " — go back to your cart and try again.";
    topMessage.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", initPaymentPage);
