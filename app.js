import express from "express";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.js"; // import configured swagger-jsdoc output
import cookieParser from "cookie-parser";

import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import userRoutes from "./Routes/userRoutes.js";
import categoriesRouter from "./Routes/categoryRoutes.js";
import productRouter from "./Routes/productRoutes.js";
import cartRouter from "./Routes/cartRoutes.js";
import orderRoutes from "./Routes/orderRoutes.js";
import paymentRoutes from "./Routes/paymentRoutes.js";
import wishlistRouter from "./Routes/wishlistRoutes.js";

import AppError from "./Utils/appError.js";

import globalErrorHandler from "./Controllers/errorController.js";
const app = express();
app.use(helmet());

app.use(hpp());
// logging middleware in development environment
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
// parse JSON request bodies for POST, PUT and PATCH requests(reading data from body into req.body)

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:5000",
      // The deployed front end, e.g. FRONTEND=https://shop.example.com
      ...(process.env.FRONTEND ? [process.env.FRONTEND] : []),
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(hpp());
// logging middleware in development environment
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
// parse JSON request bodies for POST, PUT and PATCH requests(reading data from body into req.body)
app.use(cookieParser());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("Welcome to my API");
});

app.use("/users", userRoutes);
app.use("/categories", categoriesRouter);
app.use("/products", productRouter);
app.use("/carts", cartRouter);
app.use("/orders", orderRoutes);
app.use("/payments", paymentRoutes);
app.use("/wishlist", wishlistRouter);

app.get("/favicon.ico", (req, res) => res.status(204).end());

// Swagger Docs Route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Raw JSON (for Apidog/Postman/etc.)
app.get("/api-docs-json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});
// app.get("/payments/cancel", (req, res) => {
//   res.send("CANCELLED payment");
// });

// app.get("/payments/success", (req, res) => {
//   res.send("SUCCESS payment");
// });

app.all("/{*any}", (req, res, next) => {
  next(new AppError(`Can not find ${req.originalUrl} on this server`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

export default app;
