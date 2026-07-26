/* Loaded between razorpay.js (custom checkout) and checkout.js (standard
   popup). Both CDN scripts define window.Razorpay; this keeps a reference to
   the custom-checkout one before checkout.js overwrites it. Must be an
   external file: the server CSP blocks inline scripts. */
window.RazorpayCustom = window.Razorpay;
