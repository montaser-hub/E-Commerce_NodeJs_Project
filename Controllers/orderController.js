import catchError from "../Middelwares/catchError.js";
import { Order } from "../Models/orderModel.js";
import { Payment } from "../Models/paymentsModel.js";
import Cart from "../Models/cartModel.js";
import { filterQuery, paginateQuery, sortQuery } from "../Utils/queryUtil.js";
import AppError from "../Utils/appError.js";

const placeOrder = catchError(async (req, res, next) => {
  const cart = await Cart.findOne({ userId: req.user._id }).populate(
    "items.productId",
    "price name"
  );

  if (!cart || cart.items.length === 0) {
    return next(new AppError("Your cart is empty", 400));
  }

  const snapshotCartItems = cart.items.map((item) => ({
    product: item.productId._id,
    quantity: item.quantity,
    price: item.productId.price,
  }));

  const subtotal = snapshotCartItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  const shippingPrice = req.body.shippingPrice || 0;
  const totalOrderPrice = subtotal + shippingPrice;

  const order = new Order({
    user: req.user._id,
    cartItems: snapshotCartItems,
    shippingAddress: req.body.shippingAddress,
    shippingPrice,
    paymentMethodType: req.body.paymentMethodType || "cash",
    totalOrderPrice,
  });

  const createdOrder = await order.save();

  cart.items = [];
  cart.totalPrice = 0;
  await cart.save();

  res.status(201).json(createdOrder);
});

const getMyOrders = catchError(async (req, res, next) => {
  const query = req.query;
  const { skip, limit } = paginateQuery(query);
  const sort = sortQuery(query);
  const filter = { ...filterQuery(query), user: req.user._id };

  const orders = await Order.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .populate("cartItems.product", "name price images");

  const total = await Order.countDocuments(filter);

  res
    .status(200)
    .json({ total, page: query.page, limit: query.limit, data: orders });
});

const getOrders = catchError(async (req, res, next) => {
  const query = req.query;
  const filter = filterQuery(query);
  const { skip, limit } = paginateQuery(query);
  const sort = sortQuery(query);

  const orders = await Order.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .populate("user", "name email")
    .populate("cartItems.product", "name price images");

  const total = await Order.countDocuments(filter);

  res.status(200).json({
    total,
    page: query.page,
    limit: query.limit,
    data: orders,
  });
});

const getOrderById = catchError(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "name email")
    .populate("cartItems.product", "name price images")
    .populate("payment");

  if (order) {
    res.json(order);
  } else {
    return next(new AppError("Order not found", 404));
  }
});

const getOrderByPaypalId = catchError(async (req, res, next) => {
  const order = await Order.findOne({ paypalOrderId: req.params.paypalOrderId })
    .populate("user", "name email")
    .populate("cartItems.product", "name price images")
    .populate("payment");

  if (order) {
    res.json(order);
  } else {
    return next(new AppError("Order not found", 404));
  }
});

const updateOrderToDelivered = catchError(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    order.status = "shipped";
    const updatedOrder = await order.save();
    res.status(200).json({
      message: "Order marked as delivered successfully",
      data: updatedOrder,
    });
  } else {
    return next(new AppError("Order not found", 404));
  }
});

const cancelOrder = catchError(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (
    order &&
    order.user.toString() === req.user._id.toString() &&
    !order.isPaid &&
    !order.isDelivered &&
    !order.isCancelled
  ) {
    if (order.payment) {
      const payment = await Payment.findById(order.payment);
      if (payment) {
        payment.status = "failed";
        await payment.save();
      }
    }
    order.isCancelled = true;
    order.cancelledAt = Date.now();
    order.status = "cancelled";
    const updatedOrder = await order.save();
    res.status(200).json({
      message: "Order cancelled successfully",
      data: updatedOrder,
    });
  } else {
    if (!order) {
      return next(new AppError("Cannot cancel this order", 404));
    }
  }
});

export {
  placeOrder,
  getMyOrders,
  getOrders,
  getOrderById,
  getOrderByPaypalId,
  updateOrderToDelivered,
  cancelOrder,
};
