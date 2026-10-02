import AppError from "../Utils/appError.js";

export const globalError = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((el) => el.message);
    err = new AppError(messages.join(", "), 400);
  }

  if (err.code && err.code === 11000) {
    const field = Object.keys(err.keyValue);
    err = new AppError(
      `Duplicate field value: ${field}. Please use another value.`,
      400
    );
  }

  if (err.name === "CastError") {
    err = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  if (process.env.NODE_ENV === "development") {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack,
      error: err,
    });
  } else {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message || "Something went wrong!",
    });
  }
};
