import { body, validationResult } from "express-validator";
import { createCheckoutSession, createRazorpayOrder, verifyAndCapturePayment, splitCodAmounts, COD_ADVANCE_RATE } from "../services/checkout.service.js";
import { env } from "../config/env.js";

// The client asks for a payment mode; anything unrecognised falls back to a
// full online charge. Never trust a client-supplied amount — only the mode.
function resolveMode(payload) {
  return payload && payload.paymentMode === "cod" ? "cod_advance" : "full";
}

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

export const checkoutValidators = [
  body("items").isArray({ min: 1 }).withMessage("Your cart is empty. Add at least one product before checkout."),
  body("couponCode").optional().isString().withMessage("Coupon code must be text."),
  body("shippingAddress").optional().isObject().withMessage("Shipping address is invalid.")
];

export async function createSession(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const session = await createCheckoutSession(req.auth.sub, req.body);
    req.sessionData = session;
    res.json({
      sessionId: session.checkoutSessionId,
      summary: session.summary,
      items: session.items.map(item => ({
        id: item.product._id,
        name: item.product.name,
        price: item.product.sellingPrice,
        quantity: item.quantity
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const mode = resolveMode(req.body);
    const session = await createCheckoutSession(req.auth.sub, req.body);
    const razorpayOrder = await createRazorpayOrder(session, mode);
    const { advance, balance } = splitCodAmounts(session.summary.total);

    res.json({
      keyId: env.razorpayKeyId,
      sessionId: session.checkoutSessionId,
      orderId: razorpayOrder.id,
      // amount is in paise, exactly what Razorpay will charge now.
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      paymentMode: mode,
      summary: session.summary,
      // Present only for COD so the UI can show "pay X now, Y on delivery"
      // using the same numbers the server will enforce.
      cod: mode === "cod_advance"
        ? { advance, balance, ratePercent: Math.round(COD_ADVANCE_RATE * 100) }
        : null
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const payload = req.body || {};
    const session = await createCheckoutSession(req.auth.sub, payload.session || payload);
    const mode = resolveMode(payload);
    const result = await verifyAndCapturePayment({
      userId: req.auth.sub,
      session,
      razorpayOrderId: payload.razorpayOrderId,
      razorpayPaymentId: payload.razorpayPaymentId,
      razorpaySignature: payload.razorpaySignature,
      // The client never decides whether a payment succeeded — reaching here
      // means the signature verified, so the charge is real.
      paymentStatus: "paid",
      mode,
      // Only decides what a purchased plan says; never affects pricing.
      bmiSnapshot: payload.bmiSnapshot
    });
    res.json({
      message: mode === "cod_advance"
        ? "Advance verified and order confirmed"
        : "Payment verified and order created",
      order: result.order,
      payment: result.payment,
      // Which plan entitlements this purchase granted, so the client knows
      // whether to offer downloads on the success screen.
      plans: result.plans || []
    });
  } catch (err) {
    next(err);
  }
}
