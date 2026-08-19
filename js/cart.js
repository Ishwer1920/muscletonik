/* ===========================================================
   MUSCLE TONIK - Cart page logic
   =========================================================== */

// The applied coupon is whatever the SERVER most recently approved for this
// exact cart. There is deliberately no local table of codes and rates here:
// the old { TONIK10: 0.10 } map meant every coupon created in the admin panel
// looked invalid on this page, and any code it did know was applied at a rate
// checkout might disagree with.
let appliedCoupon = null;   // { code, discount, freeShipping, message }

function renderCart() {
  const items = Cart.items();
  const root = document.getElementById("cartItems");
  const emptyState = document.getElementById("cartEmpty");
  const summaryWrap = document.getElementById("cartSummaryWrap");

  if (items.length === 0) {
    root.innerHTML = "";
    emptyState.style.display = "block";
    summaryWrap.style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  summaryWrap.style.display = "block";

  root.innerHTML = items.map(i => {
    const p = getProductById(i.id);
    if (!p) return "";
    return `<div class="cart-item">
      <div class="thumb" style="background:${p.color}18;display:flex;align-items:center;justify-content:center;">${productImage(p)}</div>
      <div>
        <h4>${p.name}</h4>
        <span style="font-size:12px;color:var(--text-light);">${getBrandById(p.brand).name}</span>
        <div class="qty-box" style="margin-top:10px;width:fit-content;">
          <button onclick="updateCartQty(${p.id},-1)">-</button>
          <span>${i.qty}</span>
          <button onclick="updateCartQty(${p.id},1)">+</button>
        </div>
        <div class="remove" onclick="Cart.remove(${p.id});renderCart();">Remove</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;font-family:'Poppins',sans-serif;">${formatINR(p.price * i.qty)}</div>
        <div style="font-size:12px;color:var(--text-light);text-decoration:line-through;">${formatINR(p.oldPrice * i.qty)}</div>
      </div>
    </div>`;
  }).join("");

  renderSummary();
}

function updateCartQty(id, delta) {
  const items = Cart.items();
  const found = items.find(i => i.id === id);
  if (found) Cart.setQty(id, found.qty + delta <= 0 ? 1 : found.qty + delta);
  renderCart();
}

function renderSummary() {
  const subtotal = Cart.total();
  const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
  const afterCoupon = Math.max(0, subtotal - couponDiscount);
  const gst = Math.round(afterCoupon * 0.05);
  let shipping = afterCoupon > 599 || afterCoupon === 0 ? 0 : 79;
  if (appliedCoupon && appliedCoupon.freeShipping) shipping = 0;
  const total = afterCoupon + gst + shipping;
  document.getElementById("sumSubtotal").textContent = formatINR(subtotal);
  document.getElementById("sumDiscount").textContent = "- " + formatINR(couponDiscount);
  document.getElementById("sumGst").textContent = formatINR(gst);
  document.getElementById("sumShipping").textContent = shipping === 0 ? "Free" : formatINR(shipping);
  document.getElementById("sumTotal").textContent = formatINR(total);
  renderCouponNote();
}

function renderCouponNote() {
  const note = document.getElementById("couponNote");
  if (!note) return;
  if (!appliedCoupon) {
    note.textContent = "";
    note.className = "coupon-note";
    return;
  }
  note.textContent = appliedCoupon.message || "";
  note.className = "coupon-note ok";
}

// Ask the API to price the code against this exact cart. The response carries
// the reason when a code is refused ("Add Rs.200 more...", "Only on Optimum
// Nutrition"), which is far more useful than a blanket "invalid coupon".
async function applyCoupon() {
  const input = document.getElementById("couponInput");
  const note = document.getElementById("couponNote");
  const code = input.value.trim().toUpperCase();

  if (!code) {
    appliedCoupon = null;
    renderSummary();
    return;
  }

  const items = Cart.items().map(i => ({ id: i.id, qty: i.qty }));
  if (!items.length) {
    showToast("Your cart is empty.");
    return;
  }

  if (note) { note.textContent = "Checking code..."; note.className = "coupon-note"; }
  try {
    const base = window.MT_API_BASE || (typeof getApiBase === "function" ? getApiBase() : "");
    const res = await fetch(base + "/checkout/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({ couponCode: code, items })
    });
    const data = await res.json().catch(() => ({}));

    if (data && data.valid) {
      appliedCoupon = {
        code: data.code,
        discount: data.discount || 0,
        freeShipping: !!data.freeShipping,
        message: data.message || ("Coupon applied: " + data.code)
      };
      Store.set("mt_coupon", appliedCoupon.code);
      showToast(appliedCoupon.message);
    } else {
      appliedCoupon = null;
      Store.set("mt_coupon", "");
      const message = (data && data.message) || "That coupon code is not valid.";
      showToast(message);
      if (note) { note.textContent = message; note.className = "coupon-note bad"; }
    }
  } catch (err) {
    appliedCoupon = null;
    showToast("Could not check that coupon. Please try again.");
  }
  renderSummary();
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderCart();

  const input = document.getElementById("couponInput");
  if (input) {
    // Enter applies too — people rarely reach for the button.
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); applyCoupon(); }
    });
    // Carry a code the shopper already entered (or arrived with via ?coupon=)
    // straight through to checkout instead of making them retype it.
    const fromUrl = new URLSearchParams(window.location.search).get("coupon");
    const remembered = fromUrl || Store.get("mt_coupon", "");
    if (remembered && Cart.items().length) {
      input.value = remembered;
      applyCoupon();
    }
  }
});
