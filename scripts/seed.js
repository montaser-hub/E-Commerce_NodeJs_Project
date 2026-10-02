/**
 * Fills a local database with demo data: categories, products, an admin,
 * a customer and a few orders. Run with `npm run seed`.
 *
 * It wipes the collections it fills, so it refuses to run in production.
 * Product images are served by the front end (public/Images/Products).
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../Models/userModel.js";
import Category from "../Models/categoryModel.js";
import Product from "../Models/productModel.js";
import Cart from "../Models/cartModel.js";
import { Order } from "../Models/orderModel.js";
import Wishlist from "../Models/wishlistModel.js";

dotenv.config({ path: "./config.env" });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

export const DEMO_USERS = {
  admin: { name: "Store Admin", email: "admin@shop.test", password: "Admin1234!", role: "admin" },
  customer: { name: "Sara Ahmed", email: "sara@shop.test", password: "Customer1234!", role: "user" },
};

const categories = [
  { name: "Living Room", description: "Sofas, armchairs and media units for everyday living." },
  { name: "Bedroom", description: "Beds and bedroom sets built for calm, restful spaces." },
  { name: "Kitchen & Dining", description: "Islands, breakfast bars and dining furniture." },
  { name: "Home Office", description: "Desks, chairs and shelving for focused work." },
  { name: "Bathroom", description: "Freestanding tubs and bathroom furniture." },
];

// [name, category, price, stock, discount, image, description]
const products = [
  ["Nordic Sectional Sofa", "Living Room", 1490, 12, 10, "sectional-sofa", "Low, deep L-shaped sofa in oat bouclé with a reversible chaise and feather-wrapped cushions."],
  ["Loft Linen Sofa", "Living Room", 1190, 8, 0, "linen-sofa", "Three-seater in washed grey linen with removable covers and a solid oak base."],
  ["Navy Velvet Sofa", "Living Room", 1340, 6, 15, "velvet-sofa", "Mid-century sofa in deep navy velvet with tapered walnut legs."],
  ["Floating TV Console", "Living Room", 690, 15, 0, "tv-console", "Wall-mounted oak media unit with push-to-open drawers and cable management."],
  ["Cloud Lounge Chair", "Living Room", 420, 20, 0, "cloud-armchair", "Rounded blush armchair with a curved back, sized for reading corners and kids' rooms."],
  ["Bayview Bedroom Set", "Bedroom", 2150, 4, 5, "bedroom-set", "Upholstered king bed, two nightstands and a lounge chair in matching tones."],
  ["Oak Kitchen Island", "Kitchen & Dining", 1850, 5, 0, "kitchen-island", "Freestanding island with oak fronts, a quartz top and seating for three."],
  ["Granite Breakfast Bar", "Kitchen & Dining", 2390, 3, 10, "breakfast-bar", "Built-in granite bar with a curved banquette and storage underneath."],
  ["Executive Walnut Desk", "Home Office", 1290, 7, 0, "walnut-desk", "Wide walnut desk with leather inlay and two upholstered visitor chairs."],
  ["Studio Writing Desk", "Home Office", 540, 18, 0, "writing-desk", "Slim oak and steel desk with a cable tray, paired with a swivel chair."],
  ["Minimal Workstation", "Home Office", 760, 10, 20, "workstation", "White corner desk with built-in shelving and a mesh task chair."],
  ["Library Bookcase Wall", "Home Office", 1680, 4, 0, "library-wall", "Floor-to-ceiling modular bookcase in white oak, configurable per bay."],
  ["Study Shelving System", "Home Office", 980, 9, 0, "study-shelves", "Open shelving with an integrated desk and drawer units."],
  ["Blue Velvet Office Chairs", "Home Office", 610, 14, 0, "office-chairs", "Pair of tufted velvet chairs on brass casters for client meetings."],
  ["Boardroom Table", "Home Office", 3200, 2, 0, "boardroom-table", "Twelve-seat table in smoked oak with hidden power and data ports."],
  ["Freestanding Stone Bathtub", "Bathroom", 2480, 3, 0, "stone-bathtub", "Oval tub cast in matte white stone resin, with a floor-mounted mixer."],
];

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function seed() {
  const DB = process.env.DATABASE.replace("<PASSWORD>", process.env.DATABASE_PASSWORD);
  await mongoose.connect(DB);

  await Promise.all(
    [Order, Cart, Wishlist, Product, Category, User].map((Model) => Model.deleteMany({}))
  );

  const users = {};
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    users[key] = await User.create({ ...u, passwordConfirm: u.password, age: 30 });
  }

  const categoryIds = {};
  for (const c of await Category.insertMany(categories)) categoryIds[c.name] = c._id;

  const created = await Product.insertMany(
    products.map(([name, category, price, quantity, discount, image, description]) => ({
      name,
      description,
      price,
      quantity,
      discount,
      categoryId: categoryIds[category],
      images: [`/Images/Products/${image}.webp`],
      addedBy: users.admin._id,
    }))
  );
  const byName = Object.fromEntries(created.map((p) => [p.name, p]));

  const address = { details: "Apartment 12, 3rd floor", street: "El Tahrir St.", city: "Cairo" };
  const order = (items, status, age) => {
    const cartItems = items.map(([name, quantity]) => ({
      product: byName[name]._id,
      quantity,
      price: byName[name].price,
    }));
    const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const createdAt = daysAgo(age);
    return {
      user: users.customer._id,
      cartItems,
      shippingAddress: address,
      shippingPrice: 0,
      totalOrderPrice: total,
      paymentMethodType: "cash",
      status,
      isPaid: status === "completed",
      paidAt: status === "completed" ? createdAt : undefined,
      isDelivered: status === "completed",
      deliveredAt: status === "completed" ? daysAgo(age - 3) : undefined,
      isCancelled: status === "cancelled",
      cancelledAt: status === "cancelled" ? daysAgo(age - 1) : undefined,
      createdAt,
      updatedAt: createdAt,
    };
  };
  await Order.insertMany([
    order([["Studio Writing Desk", 1], ["Blue Velvet Office Chairs", 1]], "completed", 40),
    order([["Cloud Lounge Chair", 2]], "shipped", 9),
    order([["Navy Velvet Sofa", 1]], "cancelled", 6),
    order([["Floating TV Console", 1], ["Loft Linen Sofa", 1]], "pending", 1),
  ]);

  await Cart.create({
    titleCart: "Sara's cart",
    userId: users.customer._id,
    items: [
      { productId: byName["Nordic Sectional Sofa"]._id, quantity: 1, priceAtTime: byName["Nordic Sectional Sofa"].price },
      { productId: byName["Minimal Workstation"]._id, quantity: 1, priceAtTime: byName["Minimal Workstation"].price },
    ],
  });

  await Wishlist.create({
    userId: users.customer._id,
    items: ["Navy Velvet Sofa", "Bayview Bedroom Set", "Freestanding Stone Bathtub"].map((name) => ({
      productId: byName[name]._id,
      productName: name,
      productImage: byName[name].images[0],
      price: byName[name].price,
    })),
  });

  console.log(`Seeded ${categories.length} categories, ${products.length} products, 2 users, 4 orders, a cart and a wishlist.`);
  console.log(`Admin:    ${DEMO_USERS.admin.email} / ${DEMO_USERS.admin.password}`);
  console.log(`Customer: ${DEMO_USERS.customer.email} / ${DEMO_USERS.customer.password}`);
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error("Seeding failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
