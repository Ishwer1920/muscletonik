import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    // "partially_paid" is the COD-with-advance state: the customer has paid the
    // online advance (advancePaid) and owes balanceDue in cash on delivery.
    paymentStatus: { type: String, enum: ["pending", "partially_paid", "paid", "failed", "refunded"], default: "pending" },
    // Both are 0 for ordinary fully-online and fully-on-delivery orders.
    advancePaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "confirmed", "packed", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"],
      default: "pending"
    },
    paymentProvider: { type: String, default: "" },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    shippingProvider: { type: String, default: "" },
    shippingAddress: { type: Object, default: {} },
    billingAddress: { type: Object, default: {} },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
