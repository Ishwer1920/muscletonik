import { body, validationResult } from "express-validator";
import { Payment } from "../models/payment.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

export async function history(req, res, next) {
  try {
    const payments = await Payment.find({ user: req.auth.sub }).sort({ createdAt: -1 }).populate("order");
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

export const failureValidators = [
  body("razorpayOrderId").notEmpty(),
  body("reason").optional().isString()
];

export async function markFailure(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    await Payment.updateOne({ razorpayOrderId: req.body.razorpayOrderId, user: req.auth.sub }, { $set: { status: "failed", metadata: { reason: req.body.reason || "payment_failed" } } });
    await Order.updateOne({ razorpayOrderId: req.body.razorpayOrderId, user: req.auth.sub }, { $set: { paymentStatus: "failed" } });
    res.json({ message: "Payment failure recorded" });
  } catch (err) {
    next(err);
  }
}

export const refundValidators = [body("orderNumber").notEmpty(), body("reason").optional().isString()];

export async function refund(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const order = await Order.findOne({ orderNumber: req.body.orderNumber, user: req.auth.sub });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.paymentStatus === "refunded") return res.status(400).json({ message: "Order is already refunded" });

    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }

    order.paymentStatus = "refunded";
    order.fulfillmentStatus = "refunded";
    await order.save();

    await Payment.updateOne({ order: order._id }, { $set: { status: "refunded", metadata: { refundReason: req.body.reason || "customer_refund" } } });
    res.json({ message: "Refund processed", orderNumber: order.orderNumber });
  } catch (err) {
    next(err);
  }
}
