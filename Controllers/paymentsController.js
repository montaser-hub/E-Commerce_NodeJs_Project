import { Payment } from "../Models/paymentsModel.js";
import { Order } from "../Models/orderModel.js";
import fetch from "node-fetch";
import catchError from "../Middelwares/catchError.js";
import AppError from "../Utils/appError.js";

const validateEnvVars = () => {
  const requiredEnvVars = [
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_BASE_URL",
    "FRONTEND",
  ];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new AppError(`Missing environment variable: ${envVar}`, 500);
    }
  }
};

async function getPayPalAccessToken() {
  validateEnvVars();
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v1/oauth2/token`,
    {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new AppError(
      `Failed to get PayPal access token: ${data.error || "Unknown error"}`,
      500
    );
  }
  return data.access_token;
}

export const createPayPalPayment = catchError(async (req, res, next) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return next(new AppError("Order not found", 404));
  }
  if (order.user.toString() !== req.user._id.toString()) {
    return next(
      new AppError("Not authorized to create payment for this order", 403)
    );
  }
  if (order.isPaid || order.isCancelled || order.isDelivered) {
    return next(
      new AppError(
        "Order cannot be paid: already paid, cancelled, or delivered",
        400
      )
    );
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: order.totalOrderPrice.toFixed(2),
            },
            custom_id: order._id.toString(),
          },
        ],
        application_context: {
          return_url: `${process.env.FRONTEND}/order-confirmation/${order._id}`,
          cancel_url: `${process.env.FRONTEND}/payments/cancel`,
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    return next(
      new AppError(
        `Failed to create PayPal order: ${data.error || "Unknown error"}`,
        500
      )
    );
  }

  // Save paypalOrderId and ensure it persists
  order.paypalOrderId = data.id;
  await order.save();
  console.log(`PayPal Order ID ${data.id} saved for order ${order._id}`);

  const approveLink = data.links.find((l) => l.rel === "approve")?.href;
  if (!approveLink) {
    return next(new AppError("No approve link found", 500));
  }

  res.json({ url: approveLink });
});

export const capturePayPalPayment = catchError(async (req, res, next) => {
  const { token, payerId } = req.body;
  if (!token || !payerId) {
    return next(new AppError("Missing token or PayerID", 400));
  }

  const order = await Order.findOne({ paypalOrderId: token });
  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  console.log(`Processing capture for order ${order._id} with token ${token}`);

  if (order.isPaid) {
    console.log(`Order ${order._id} already paid`);
    return res.status(200).json({ status: "success", orderId: order._id });
  }

  if (order.isCancelled || order.isDelivered) {
    return next(
      new AppError("Order cannot be paid: cancelled or delivered", 400)
    );
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders/${token}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("PayPal Capture Error:", data);
    return next(
      new AppError(
        `Failed to capture PayPal payment: ${data.error || "Unknown error"}`,
        500
      )
    );
  }

  let payment = await Payment.findOne({ orderId: order._id });
  if (!payment) {
    payment = new Payment({
      orderId: order._id,
      provider: "paypal",
      amount: order.totalOrderPrice,
      currency: "USD",
      status: "success",
      transactionReference: data.id,
    });
    await payment.save();
    order.payment = payment._id;
  } else {
    payment.status = "success";
    payment.transactionReference = data.id;
    await payment.save();
  }

  order.isPaid = true;
  order.paidAt = Date.now();
  order.status = "paid";
  await order.save();

  console.log(`Payment captured successfully for order ${order._id}`);
  res.status(200).json({ status: "success", orderId: order._id });
});

export const cancelPayPalPayment = catchError(async (req, res, next) => {
  const { token } = req.body;
  if (!token) {
    return next(new AppError("Missing token", 400));
  }

  const order = await Order.findOne({ paypalOrderId: token });
  if (!order) {
    return next(new AppError("Order not found", 404));
  }

  let payment = await Payment.findOne({ orderId: order._id });
  if (!payment) {
    payment = new Payment({
      orderId: order._id,
      provider: "paypal",
      amount: order.totalOrderPrice,
      currency: "USD",
      status: "cancelled",
    });
    await payment.save();
    order.payment = payment._id;
  } else {
    payment.status = "cancelled";
    await payment.save();
  }

  order.status = "cancelled";
  await order.save();

  res.status(200).json({ status: "success", message: "Payment cancelled" });
});

export const paypalWebhook = catchError(async (req, res, next) => {
  const event = req.body;
  const requiredHeaders = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];

  for (const header of requiredHeaders) {
    if (!req.headers[header]) {
      return next(new AppError(`Missing required header: ${header}`, 400));
    }
  }

  validateEnvVars();
  const verifyPayload = {
    auth_algo: req.headers["paypal-auth-algo"],
    cert_url: req.headers["paypal-cert-url"],
    transmission_id: req.headers["paypal-transmission-id"],
    transmission_sig: req.headers["paypal-transmission-sig"],
    transmission_time: req.headers["paypal-transmission-time"],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  };

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verifyPayload),
    }
  );

  const verifyResponse = await response.json();
  if (!response.ok || verifyResponse.verification_status !== "SUCCESS") {
    return next(new AppError("Webhook verification failed", 400));
  }

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED":
    case "CHECKOUT.ORDER.APPROVED": {
      const orderId =
        event.resource?.custom_id ||
        event.resource?.purchase_units?.[0]?.custom_id;
      const captureId = event.resource?.id;

      if (!orderId) {
        return next(new AppError("Invalid order ID in webhook", 400));
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return next(new AppError("Order not found", 404));
      }

      if (order.isPaid || order.isCancelled || order.isDelivered) {
        return res.sendStatus(200);
      }

      let payment = await Payment.findOne({ orderId: order._id });
      if (!payment) {
        payment = new Payment({
          orderId: order._id,
          provider: "paypal",
          amount: order.totalOrderPrice,
          currency: "USD",
          status: "success",
          transactionReference: captureId,
        });
        await payment.save();
        order.payment = payment._id;
      } else {
        payment.status = "success";
        payment.transactionReference =
          captureId || payment.transactionReference;
        await payment.save();
      }

      order.isPaid = true;
      order.paidAt = Date.now();
      order.status = "paid";
      await order.save();

      break;
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.REFUNDED": {
      const orderId = event.resource?.custom_id;
      if (!orderId) {
        return next(new AppError("Invalid order ID in webhook", 400));
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return next(new AppError("Order not found", 404));
      }

      let payment = await Payment.findOne({ orderId: order._id });
      if (!payment) {
        payment = new Payment({
          orderId: order._id,
          provider: "paypal",
          amount: order.totalOrderPrice,
          currency: "USD",
          status: "failed",
        });
        await payment.save();
        order.payment = payment._id;
      } else {
        payment.status = "failed";
        await payment.save();
      }

      order.status = "payment_failed";
      await order.save();

      break;
    }
    default:
      break;
  }

  res.sendStatus(200);
});
