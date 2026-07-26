/* ===========================================================
   MUSCLE TONIK - Order success page
   Moved out of an inline <script> so it complies with the
   Content Security Policy (script-src 'self').
   =========================================================== */
document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);
  const order = params.get("order");
  const box = document.getElementById("orderSuccessId");
  if (box) box.textContent = order ? "Order " + order : "Order completed";

  // Reflect the payment method: Cash on Delivery vs online payment.
  if (params.get("method") === "cod") {
    const title = document.getElementById("successTitle");
    const sub = document.getElementById("successSubtitle");
    if (title) title.textContent = "Order placed";
    if (sub) sub.textContent = "Your order is confirmed. Please keep the amount ready — you'll pay in cash on delivery.";
  }
  const iconEl = document.getElementById("successIcon");
  if (iconEl) {
    iconEl.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  }
});
