import swaggerJSDoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Woody Furniture Store API",
      version: "1.0.0",
      description:
        "REST API for the Woody furniture store: accounts, catalogue, cart, wishlist, orders and PayPal payments. Sign in with POST /users/signin; the session is an httpOnly cookie.",
    },
    servers: [
      {
        url: "http://localhost:3000", // base URL for your API
      },
    ],
  },
  apis: ["./Routes/*.js"], // where Swagger looks for docs
};

export default swaggerJSDoc(swaggerOptions);


