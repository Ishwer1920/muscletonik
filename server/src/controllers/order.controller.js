import { body, param, validationResult } from "express-validator";
import { Order } from "../models/order.model.js";
import { Payment } from "../models/payment.model.js";

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

// Shape an order document for the client. Never leak internal fields the UI
// does not need (payment signatures etc. stay server-side).
function serializeOrder(order) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    items: order.items.map(item => ({
      name: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    gst: order.gst,
    shipping: order.shipping,
    total: order.total,
    paymentProvider: order.paymentProvider,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    shippingAddress: order.shippingAddress || {},
    createdAt: order.createdAt
  };
}

// GET /api/orders  — the logged-in customer's own order history.
export async function listMyOrders(req, res, next) {
  try {
    const orders = await Order.find({ user: req.auth.sub }).sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map(serializeOrder) });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/orders — every order (admin only), newest first, with the
// customer name/email attached. Supports an optional ?status= filter.
export async function listAllOrders(req, res, next) {
  try {
    const filter = {};
    if (req.query.paymentProvider) filter.paymentProvider = String(req.query.paymentProvider);
    if (req.query.fulfillmentStatus) filter.fulfillmentStatus = String(req.query.fulfillmentStatus);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email phone")
      .lean();

    res.json({
      count: orders.length,
      orders: orders.map(order => ({
        ...serializeOrder(order),
        customer: order.user
          ? { name: order.user.name, email: order.user.email, phone: order.user.phone }
          : null
      }))
    });
  } catch (err) {
    next(err);
  }
}

export const updateStatusValidators = [
  param("id").isMongoId().withMessage("Invalid order id."),
  body("fulfillmentStatus")
    .optional()
    .isIn(["pending", "confirmed", "packed", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"])
    .withMessage("Invalid fulfillment status."),
  body("paymentStatus")
    .optional()
    .isIn(["pending", "paid", "failed", "refunded"])
    .withMessage("Invalid payment status.")
];

// PATCH /api/admin/orders/:id — admin updates fulfillment/payment status.
// e.g. mark a COD order Shipped, then Delivered + Paid once cash is collected.
export async function updateOrderStatus(req, res, next) {
  try {
    if (validationErrors(req, res)) return;

    const update = {};
    if (req.body.fulfillmentStatus) update.fulfillmentStatus = req.body.fulfillmentStatus;
    if (req.body.paymentStatus) update.paymentStatus = req.body.paymentStatus;
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Keep the linked payment record in step with the order's payment status.
    if (update.paymentStatus) {
      await Payment.updateOne({ order: order._id }, { status: update.paymentStatus });
    }

    res.json({ message: "Order updated.", order: serializeOrder(order) });
  } catch (err) {
    next(err);
  }
}
