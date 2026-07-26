/* ===========================================================
   MUSCLE TONIK - Cart page logic
   =========================================================== */

let appliedCoupon = null;
const COUPONS = { TONIK10: 0.10, FIRST15: 0.15 };

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
  const couponDiscount = appliedCoupon ? Math.round(subtotal * appliedCoupon) : 0;
  const afterCoupon = subtotal - couponDiscount;
  const gst = Math.round(afterCoupon * 0.05);
  const shipping = afterCoupon > 599 || afterCoupon === 0 ? 0 : 79;
  const total = afterCoupon + gst + shipping;
  document.getElementById("sumSubtotal").textContent = formatINR(subtotal);
  document.getElementById("sumDiscount").textContent = "- " + formatINR(couponDiscount);
  document.getElementById("sumGst").textContent = formatINR(gst);
  document.getElementById("sumShipping").textContent = shipping === 0 ? "Free" : formatINR(shipping);
  document.getElementById("sumTotal").textContent = formatINR(total);
}

function applyCoupon() {
  const code = document.getElementById("couponInput").value.trim().toUpperCase();
  if (COUPONS[code]) {
    appliedCoupon = COUPONS[code];
    showToast("Coupon applied: " + code);
  } else {
    appliedCoupon = null;
    showToast("Invalid coupon code");
  }
  renderSummary();
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderCart();
});
