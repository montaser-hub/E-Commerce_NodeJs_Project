import express from "express";
import { protect } from "../Controllers/authController.js";
import {
  paypalWebhook,
  createPayPalPayment,
  capturePayPalPayment,
} from "../Controllers/paymentsController.js";

const router = express.Router();

router.post("/paypal/webhook", express.json(), paypalWebhook);
// "/paypal/capture" must come before "/paypal/:orderId", or Express treats "capture" as an order id.
router.post("/paypal/capture", protect, capturePayPalPayment);
router.post("/paypal/:orderId", protect, createPayPalPayment);

export default router;
