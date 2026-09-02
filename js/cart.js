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

  // Lines come back with combo pricing already worked out, so what the cart
  // shows is what checkout will charge.
  const lines = Cart.pricedLines();
  const rendered = [];
  const doneCombos = {};

  lines.forEach(line => {
    const p = line.product;
    const comboId = line.comboId;
    // A bundle is drawn once, as a header above its own items.
    if (comboId && !doneCombos[comboId]) {
      doneCombos[comboId] = true;
      const group = lines.filter(l => l.comboId === comboId);
      const combo = line.combo || getComboById(comboId);
      const normal = group.reduce((sum, l) => sum + Math.round(l.product.price * l.qty), 0);
      const broken = !line.combo;
      rendered.push(`<div class="combo-group${broken ? " is-broken" : ""}">
        <div class="combo-head">
          <div>
            <b>${escapeHtml((combo && combo.name) || "Combo")}</b>
            ${broken
              ? '<span class="combo-warn">Combo price no longer applies - items are at their normal price</span>'
              : `<span class="combo-save">Combo price ${formatINR(line.combo.comboPrice)} &middot; you save ${formatINR(line.combo.saving)}</span>`}
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800;font-family:'Poppins',sans-serif;">${formatINR(broken ? normal : line.combo.comboPrice)}</div>
            ${broken ? "" : `<div style="font-size:12px;color:var(--text-light);text-decoration:line-through;">${formatINR(normal)}</div>`}
            <div class="remove" onclick="Cart.removeCombo('${escapeHtml(comboId)}');renderCart();">Remove combo</div>
          </div>
        </div>
      </div>`);
    }

    const comboArg = comboId ? `,'${escapeHtml(comboId)}'` : "";
    rendered.push(`<div class="cart-item${comboId ? " in-combo" : ""}">
      <div class="thumb" style="background:${p.color}18;display:flex;align-items:center;justify-content:center;">${productImage(p)}</div>
      <div>
        <h4>${p.name}</h4>
        <span style="font-size:12px;color:var(--text-light);">${getBrandById(p.brand).name}</span>
        <div class="qty-box" style="margin-top:10px;width:fit-content;">
          <button onclick="updateCartQty(${p.id},-1${comboArg})">-</button>
          <span>${line.qty}</span>
          <button onclick="updateCartQty(${p.id},1${comboArg})">+</button>
        </div>
        <div class="remove" onclick="Cart.remove(${p.id}${comboArg});renderCart();">Remove</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;font-family:'Poppins',sans-serif;">${formatINR(line.lineTotal)}</div>
        ${line.combo
          ? '<div style="font-size:11px;color:var(--text-light);">part of combo</div>'
          : `<div style="font-size:12px;color:var(--text-light);text-decoration:line-through;">${formatINR(p.oldPrice * line.qty)}</div>`}
      </div>
    </div>`);
  });

  root.innerHTML = rendered.join("");

  renderSummary();
}

function updateCartQty(id, delta, comboId) {
  const items = Cart.items();
  const found = Cart.find(items, id, comboId);
  if (found) Cart.setQty(id, found.qty + delta <= 0 ? 1 : found.qty + delta, comboId);
  renderCart();
}

function renderSummary() {
  const subtotal = Cart.total();
  const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
  const afterCoupon = Math.max(0, subtotal - couponDiscount);
  // Tax each line at its own product's rate (Admin -> Tax & GST); the label
  // moves with it so the customer never sees "GST (5%)" beside an 18% charge.
  const taxLines = Cart.pricedLines().map(line => ({
    product: line.product,
    lineTotal: line.lineTotal
  }));
  const gst = MT_TAX.breakdown(taxLines, couponDiscount);
  const gstLabel = document.getElementById("sumGstLabel");
  if (gstLabel) gstLabel.textContent = MT_TAX.label(taxLines);
  let shipping = afterCoupon > 599 || afterCoupon === 0 ? 0 : 79;
  if (appliedCoupon && appliedCoupon.freeShipping) shipping = 0;
  // Inclusive GST sits inside the prices already, so only the exclusive share
  // is added on top - matching pricing.gst_breakdown_for_line_items().
  const total = afterCoupon + gst.added + shipping;
  document.getElementById("sumSubtotal").textContent = formatINR(subtotal);
  document.getElementById("sumDiscount").textContent = "- " + formatINR(couponDiscount);
  document.getElementById("sumGst").textContent = formatINR(gst.added);
  // A fully tax-inclusive cart has nothing to add, so the GST row would just
  // read Rs 0 - drop it and say so under the total instead.
  const fullyInclusive = gst.added === 0 && gst.included > 0;
  const gstRow = document.getElementById("sumGstRow");
  if (gstRow) gstRow.style.display = fullyInclusive ? "none" : "";
  const taxNote = document.getElementById("sumTaxNote");
  if (taxNote) {
    taxNote.textContent = fullyInclusive
      ? "Inclusive of all taxes"
      : gst.included > 0
        ? "Includes " + formatINR(gst.included) + " GST already in the item prices"
        : "";
    taxNote.hidden = !taxNote.textContent;
  }
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
  // Applied state: show the code, what it saved, and a way back out. The
  // server re-prices on every apply, so removing is purely a local reset.
  note.className = "coupon-note ok";
  note.innerHTML =
    '<span class="coupon-applied-code">' + escapeHtml(appliedCoupon.code || "Coupon") + " applied</span> " +
    '<span class="coupon-applied-msg">' + escapeHtml(appliedCoupon.message || "") + "</span>" +
    '<button type="button" class="coupon-remove" onclick="removeCoupon()">Remove</button>';
}

// Drop the coupon and re-price. Nothing is trusted from here: the discount is
// only ever whatever the API returned for the current cart.
function removeCoupon() {
  appliedCoupon = null;
  const input = document.getElementById("couponInput");
  if (input) input.value = "";
  renderSummary();
  showToast("Coupon removed");
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
