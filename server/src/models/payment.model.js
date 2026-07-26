import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    checkoutSessionId: { type: String, default: "", index: true },
    provider: { type: String, default: "razorpay" },
    razorpayOrderId: { type: String, default: "", index: true },
    razorpayPaymentId: { type: String, default: "", index: true },
    razorpaySignature: { type: String, default: "" },
    status: { type: String, enum: ["created", "pending", "paid", "failed", "refunded"], default: "created" },
    // What this payment covers: the whole order, or just the COD online advance.
    // A cod_advance payment is genuinely "paid" — it is the advance that is
    // settled; the remainder is tracked on the order as balanceDue.
    kind: { type: String, enum: ["full", "cod_advance", "cod_balance"], default: "full" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
