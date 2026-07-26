import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env.js";
import { Product } from "../models/product.model.js";
import { User } from "../models/user.model.js";
import { Order } from "../models/order.model.js";
import { Payment } from "../models/payment.model.js";
import { Coupon } from "../models/coupon.model.js";
import { UserPlan } from "../models/user-plan.model.js";
import { createToken } from "../utils/tokens.js";

const COUPONS = {
  TONIK10: { type: "percent", value: 10 },
  FIRST15: { type: "percent", value: 15 }
};

function roundMoney(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

// Cash on Delivery requires a non-refundable online advance to confirm the
// order; the rest is collected in cash on delivery. Both figures are derived
// here and never taken from the client.
export const COD_ADVANCE_RATE = 0.2;

export function splitCodAmounts(total) {
  const advance = roundMoney(total * COD_ADVANCE_RATE);
  return { advance, balance: roundMoney(total - advance) };
}

function shippingCharge(subtotalAfterDiscount) {
  return subtotalAfterDiscount > 599 ? 0 : 79;
}

function gstAmount(amount) {
  return roundMoney(amount * 0.05);
}

async function getCouponDiscount(subtotal, code) {
  if (!code) return { amount: 0, code: "" };
  const normalized = String(code).toUpperCase();
  const couponDoc = await Coupon.findOne({ code: normalized, active: true }).lean();
  if (couponDoc) {
    if (couponDoc.expiresAt && new Date(couponDoc.expiresAt) < new Date()) return { amount: 0, code: "" };
    if (couponDoc.maxUses > 0 && couponDoc.usageCount >= couponDoc.maxUses) return { amount: 0, code: "" };
    if (subtotal < Number(couponDoc.minOrder || 0)) return { amount: 0, code: "" };
    if (couponDoc.type === "percent") return { amount: roundMoney((subtotal * couponDoc.value) / 100), code: normalized };
    if (couponDoc.type === "flat") return { amount: roundMoney(couponDoc.value), code: normalized };
    if (couponDoc.type === "free_shipping") return { amount: 0, code: normalized };
  }
  const coupon = COUPONS[normalized];
  if (!coupon) return { amount: 0, code: "" };
  if (coupon.type === "percent") return { amount: roundMoney((subtotal * coupon.value) / 100), code: normalized };
  return { amount: roundMoney(coupon.value), code: normalized };
}

async function markCouponUsed(code) {
  if (!code) return;
  await Coupon.updateOne({ code: String(code).toUpperCase() }, { $inc: { usageCount: 1 } }).catch(() => {});
}

async function getProductsForCart(items) {
  // MongoDB is the single source of truth; do NOT resync the catalog here.
  // (The old per-checkout sync overwrote admin edits and reset display fields.)
  const ids = items.map(item => item.productId);
  const products = await Product.find({ sku: { $in: ids.map(id => `MT-${id}`) }, status: "active" });
  return products;
}

export async function createCheckoutSession(userId, payload) {
  const user = await User.findById(userId).select("name email addresses");
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    const error = new Error("Your cart is empty");
    error.statusCode = 400;
    throw error;
  }

  const normalized = items.map(item => ({
    productId: Number(item.id || item.productId),
    quantity: Math.max(1, Number(item.qty || item.quantity || 1))
  }));

  const products = await getProductsForCart(normalized);
  if (products.length !== normalized.length) {
    const error = new Error("One or more products in the cart are unavailable");
    error.statusCode = 400;
    throw error;
  }

  const lineItems = normalized.map(item => {
    const product = products.find(p => p.sku === `MT-${item.productId}`);
    // Digital goods have no inventory — a plan can be sold any number of times.
    const stock = product.digital ? Infinity : (Number.isFinite(product.stock) ? product.stock : 0);
    if (stock < item.quantity) {
      const error = new Error(`Insufficient stock for ${product.name}`);
      error.statusCode = 400;
      throw error;
    }
    return {
      product,
      quantity: item.quantity,
      lineTotal: roundMoney(product.sellingPrice * item.quantity)
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const coupon = await getCouponDiscount(subtotal, payload.couponCode);
  const afterCoupon = Math.max(0, subtotal - coupon.amount);
  // Digital-only carts (diet/workout plans) ship nothing, so they must never be
  // charged delivery. A mixed cart still pays it — there's a parcel either way.
  const hasPhysical = lineItems.some(item => !item.product.digital);
  const shipping = hasPhysical ? shippingCharge(afterCoupon) : 0;
  const gst = gstAmount(afterCoupon);
  const total = afterCoupon + shipping + gst;

  return {
    checkoutSessionId: createToken(),
    user,
    items: lineItems,
    shippingAddress: payload.shippingAddress && typeof payload.shippingAddress === "object" ? payload.shippingAddress : {},
    summary: { subtotal, discount: coupon.amount, shipping, gst, total, couponCode: coupon.code }
  };
}

// mode "full"        -> charge the whole order total online
// mode "cod_advance" -> charge only the 20% advance; the balance is cash on delivery
// Sanitise the BMI snapshot the client sends. Never trust it for money — it
// only decides what the plan says — but it must still be stored as numbers.
export function normalizeBmiSnapshot(raw) {
  const num = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : 0;
  };
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    height: num(src.height, 80, 250),
    weight: num(src.weight, 20, 400),
    bmi: num(src.bmi, 5, 100),
    bandId: ["underweight", "normal", "overweight", "obese"].includes(src.bandId) ? src.bandId : "",
    bandLabel: String(src.bandLabel || "").slice(0, 40),
    goal: ["auto", "gain", "lose", "maintain"].includes(src.goal) ? src.goal : "auto",
    rangeLow: num(src.rangeLow, 0, 400),
    rangeHigh: num(src.rangeHigh, 0, 400)
  };
}

// Turn any plan products in a paid order into permanent entitlements. A "both"
// purchase yields one diet row and one workout row. Upsert keyed on
// (order, kind) so a retried verify never duplicates.
async function grantPlanEntitlements({ userId, session, orderDoc, bmiSnapshot }) {
  const kinds = new Set();
  for (const item of session.items) {
    const type = item.product.planType;
    if (type === "diet" || type === "workout") kinds.add(type);
    else if (type === "both") { kinds.add("diet"); kinds.add("workout"); }
  }
  if (!kinds.size) return [];

  const snapshot = normalizeBmiSnapshot(bmiSnapshot);
  const granted = [];
  for (const kind of kinds) {
    await UserPlan.findOneAndUpdate(
      { user: userId, order: orderDoc._id, kind },
      {
        $setOnInsert: {
          user: userId, order: orderDoc._id, orderNumber: orderDoc.orderNumber,
          kind, snapshot, source: "purchase"
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    granted.push(kind);
  }
  return granted;
}

// Digital goods are delivered the instant payment clears, so there is no
// delivery at which to collect a balance. Allowing COD on a plan would hand the
// full product over for the 20% advance. Enforced server-side because the
// client's payment-mode choice cannot be trusted.
export function assertCodAllowed(session) {
  if (!session.items.some(item => item.product.digital)) return;
  const error = new Error(
    "Cash on Delivery isn't available for digital plans — they're delivered instantly. " +
    "Please pay online to continue."
  );
  error.statusCode = 400;
  throw error;
}

export async function createRazorpayOrder(session, mode = "full") {
  if (mode === "cod_advance") assertCodAllowed(session);
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    error.statusCode = 503;
    throw error;
  }

  const razorpay = new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret
  });

  // The charged amount is always derived server-side from the recomputed
  // session total, so a tampered client cannot pay less than it owes.
  const { advance } = splitCodAmounts(session.summary.total);
  const chargeable = mode === "cod_advance" ? advance : session.summary.total;

  try {
    return await razorpay.orders.create({
      amount: chargeable * 100,
      currency: "INR",
      // Razorpay caps receipt at 40 chars; checkoutSessionId is a 64-char hex
      // token. Truncate for the receipt only — the full id is kept in notes
      // below, which is what we actually reconcile against.
      receipt: session.checkoutSessionId.slice(0, 40),
      notes: {
        checkoutSessionId: session.checkoutSessionId,
        couponCode: session.summary.couponCode || "",
        paymentMode: mode
      }
    });
  } catch (err) {
    // Razorpay rejects invalid keys with its OWN 401 ("Authentication failed")
    // and an undefined message. If we let that bubble up untouched it reaches
    // the browser as a confusing "401 Unauthorized / Internal server error" on
    // the checkout POST, even though the user's session is perfectly valid.
    // Re-wrap it as a clear 502 (upstream gateway error) with an actionable
    // message so it can never be mistaken for an app-authentication failure.
    const description = err?.error?.description || err?.message || "unknown error";
    console.error(`[razorpay] order creation failed (status ${err?.statusCode}): ${description}`);
    const gatewayError = new Error(`Could not start the payment. The payment gateway rejected the request (${description}). Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.`);
    gatewayError.statusCode = 502;
    throw gatewayError;
  }
}

export async function verifyAndCapturePayment({ userId, session, razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentStatus, mode = "full", bmiSnapshot }) {
  // Re-check on verify too: /order and /verify are separate calls, so the mode
  // must be validated at both or the second could be replayed with "cod".
  if (mode === "cod_advance") assertCodAllowed(session);
  const expectedSignature = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    const error = new Error("Payment signature verification failed");
    error.statusCode = 400;
    throw error;
  }

  // Idempotency: a Razorpay payment id must only ever create one order.
  // If verify is retried (double-click, network retry, page refresh) return
  // the order that was already created instead of creating a duplicate or
  // decrementing stock a second time.
  const existingPayment = await Payment.findOne({ razorpayPaymentId }).populate("order");
  if (existingPayment && existingPayment.order) {
    // Re-grant on replay: the first attempt may have created the order and then
    // failed before entitlements were written, so this is not merely a read.
    const plans = await grantPlanEntitlements({
      userId, session, orderDoc: existingPayment.order, bmiSnapshot
    });
    return { order: existingPayment.order, payment: existingPayment, plans };
  }

  // Atomically reserve stock before the order is written. The conditional
  // filter (stock >= quantity) makes the decrement oversell-safe even if two
  // buyers race for the last unit — the second update matches nothing.
  // A COD order whose advance cleared is as committed as a fully-paid one, so
  // it reserves stock too — otherwise confirmed COD orders could oversell.
  const settled = paymentStatus === "paid";
  const reserved = [];
  if (settled) {
    for (const item of session.items) {
      // Digital plans are not inventory; decrementing them would drive a
      // nominal stock figure down and eventually block sales for no reason.
      if (item.product.digital) continue;
      const result = await Product.updateOne(
        { _id: item.product._id, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (result.modifiedCount !== 1) {
        // roll back anything already reserved in this loop
        for (const done of reserved) {
          await Product.updateOne({ _id: done.id }, { $inc: { stock: done.quantity } });
        }
        const error = new Error(`Insufficient stock for ${item.product.name}. Please review your cart and try again.`);
        error.statusCode = 409;
        throw error;
      }
      reserved.push({ id: item.product._id, quantity: item.quantity });
    }
  }

  const isCodAdvance = mode === "cod_advance";
  const { advance, balance } = splitCodAmounts(session.summary.total);
  // What Razorpay actually charged, and what the order still owes.
  const chargedAmount = isCodAdvance ? advance : session.summary.total;

  try {
    const orderNumber = `MT-${Date.now()}`;
    const orderDoc = await Order.create({
      orderNumber,
      user: userId,
      items: session.items.map(item => ({
        product: item.product._id,
        name: item.product.name,
        sku: item.product.sku,
        price: item.product.sellingPrice,
        quantity: item.quantity
      })),
      subtotal: session.summary.subtotal,
      discount: session.summary.discount,
      gst: session.summary.gst,
      shipping: session.summary.shipping,
      total: session.summary.total,
      paymentStatus: settled && isCodAdvance ? "partially_paid" : paymentStatus,
      fulfillmentStatus: settled ? "confirmed" : "pending",
      paymentProvider: isCodAdvance ? "cod" : "razorpay",
      advancePaid: settled && isCodAdvance ? advance : 0,
      balanceDue: settled && isCodAdvance ? balance : 0,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      shippingAddress: session.shippingAddress || {},
      billingAddress: session.shippingAddress || {}
    });

    const paymentDoc = await Payment.create({
      user: userId,
      order: orderDoc._id,
      checkoutSessionId: session.checkoutSessionId,
      provider: "razorpay",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      status: paymentStatus,
      kind: isCodAdvance ? "cod_advance" : "full",
      amount: chargedAmount,
      currency: "INR",
      metadata: {
        couponCode: session.summary.couponCode || "",
        ...(isCodAdvance ? { orderTotal: session.summary.total, balanceDue: balance } : {})
      }
    });
    await markCouponUsed(session.summary.couponCode);

    const plans = await grantPlanEntitlements({ userId, session, orderDoc, bmiSnapshot });

    return { order: orderDoc, payment: paymentDoc, plans };
  } catch (err) {
    // If order/payment persistence fails after stock was reserved, restore it.
    for (const done of reserved) {
      await Product.updateOne({ _id: done.id }, { $inc: { stock: done.quantity } });
    }
    throw err;
  }
}

