const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const fs = require("fs/promises");
const path = require("path");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = Number(process.env.PORT) || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const DEV_ADMIN_EMAIL = "admin@gmail.com";
const SETTINGS_ID = "restaurant-profile";

const defaultRestaurantSettingsFields = {
  restaurantName: "Forkly",
  tagline: "Modern dining, warm service",
  phone: "+1 555 013 4567",
  email: "hello@forkly.com",
  address: "123 Flavor Street, New York, NY",
  openingHours: "Daily: 10:00 AM - 11:00 PM",
  kitchenHours: "Kitchen closes at 10:30 PM",
  reservationNotice: "Reservations are reviewed by the Forkly team before confirmation.",
  maxReservationGuests: 20,
};
const defaultRestaurantSettings = {
  _id: SETTINGS_ID,
  ...defaultRestaurantSettingsFields,
};

const allowedOrigins = [process.env.CLIENT_URL, process.env.CLIENT_URLS]
  .flatMap((value) => String(value || "").split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const defaultMongoHosts = [
  "ac-6w3swfs-shard-00-00.crlsfbw.mongodb.net:27017",
  "ac-6w3swfs-shard-00-01.crlsfbw.mongodb.net:27017",
  "ac-6w3swfs-shard-00-02.crlsfbw.mongodb.net:27017",
].join(",");

const uri =
  process.env.MONGO_URI ||
  process.env.DB_URI ||
  `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOSTS || defaultMongoHosts}/bistroBossDB?tls=true&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const bookingsFilePath = path.join(__dirname, "data", "bookings.json");
let isMongoConnected = false;

const toObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

const ensureBookingsFile = async () => {
  await fs.mkdir(path.dirname(bookingsFilePath), { recursive: true });

  try {
    await fs.access(bookingsFilePath);
  } catch {
    await fs.writeFile(bookingsFilePath, "[]", "utf8");
  }
};

const readLocalBookings = async () => {
  await ensureBookingsFile();
  const fileContent = await fs.readFile(bookingsFilePath, "utf8");
  return JSON.parse(fileContent);
};

const writeLocalBookings = async (bookings) => {
  await ensureBookingsFile();
  await fs.writeFile(bookingsFilePath, JSON.stringify(bookings, null, 2), "utf8");
};

const sortBookings = (bookings) =>
  [...bookings].sort((left, right) =>
    `${left.date || ""} ${left.time || ""}`.localeCompare(
      `${right.date || ""} ${right.time || ""}`
    )
  );

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

async function run() {
  try {
    const db = client.db("bistroBossDB");
    const menuCollection = db.collection("menu");
    const reviewsCollection = db.collection("customerReview");
    const cartsCollection = db.collection("carts");
    const usersCollection = db.collection("users");
    const paymentCollection = db.collection("payments");
    const bookingsCollection = db.collection("bookings");
    const settingsCollection = db.collection("settings");

    const verifyToken = (req, res, next) => {
      const authorization = req.headers.authorization;

      if (!authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }

        req.decoded = decoded;
        next();
      });
    };

    const isAdminEmail = async (email) => {
      if (email === DEV_ADMIN_EMAIL) {
        return true;
      }

      if (!isMongoConnected) {
        return false;
      }

      try {
        const user = await usersCollection.findOne({ email });
        return user?.role === "admin";
      } catch {
        return false;
      }
    };

    const verifyAdmin = async (req, res, next) => {
      const isAdmin = await isAdminEmail(req.decoded.email);

      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    app.post("/menu-images", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { image, fileName = "menu-item" } = req.body;
        const imageMatch = String(image || "").match(
          /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/
        );

        if (!imageMatch) {
          return res.status(400).send({
            message: "A valid PNG, JPG, WEBP, or GIF image is required",
          });
        }

        const mimeType = imageMatch[1];
        const extensionByMimeType = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/webp": "webp",
          "image/gif": "gif",
        };
        const extension = extensionByMimeType[mimeType];
        const imageBuffer = Buffer.from(imageMatch[2], "base64");
        const maxImageSize = 5 * 1024 * 1024;

        if (!extension || imageBuffer.length > maxImageSize) {
          return res.status(400).send({
            message: "Image must be one of PNG, JPG, WEBP, or GIF and under 5MB",
          });
        }

        const safeName =
          path
            .parse(fileName)
            .name.replace(/[^a-z0-9-]/gi, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase()
            .slice(0, 60) || "menu-item";
        const storedFileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}-${safeName}.${extension}`;
        const uploadDir = path.join(__dirname, "uploads", "menu");
        const uploadPath = path.join(uploadDir, storedFileName);

        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(uploadPath, imageBuffer);

        res.send({
          imageUrl: `${req.protocol}://${req.get("host")}/uploads/menu/${storedFileName}`,
        });
      } catch (error) {
        res.status(500).send({
          message: "failed to upload menu image",
          error: error.message,
        });
      }
    });

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = {
        ...req.body,
        status: req.body.status || "active",
        featured: Boolean(req.body.featured),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid menu id" });
      }

      const result = await menuCollection.findOne({ _id: id });
      res.send(result);
    });

    app.patch("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid menu id" });
      }

      const item = req.body;
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
          status: item.status || "active",
          featured: Boolean(item.featured),
          updatedAt: new Date(),
        },
      };

      const result = await menuCollection.updateOne({ _id: id }, updatedDoc);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid menu id" });
      }

      const result = await menuCollection.deleteOne({ _id: id });
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection
        .find({
          $or: [{ status: "approved" }, { status: { $exists: false } }],
        })
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = {
        name: req.body.name,
        email: req.body.email,
        rating: Number(req.body.rating),
        details: req.body.details,
        status: "pending",
        featured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (review.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/admin/reviews", verifyToken, verifyAdmin, async (req, res) => {
      const result = await reviewsCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });

    app.patch("/reviews/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid review id" });
      }

      const allowedStatuses = ["pending", "approved", "hidden"];
      const update = {
        updatedAt: new Date(),
      };

      if (allowedStatuses.includes(req.body.status)) {
        update.status = req.body.status;
      }

      if (typeof req.body.featured === "boolean") {
        update.featured = req.body.featured;
      }

      const result = await reviewsCollection.updateOne({ _id: id }, { $set: update });
      res.send(result);
    });

    app.delete("/reviews/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid review id" });
      }

      const result = await reviewsCollection.deleteOne({ _id: id });
      res.send(result);
    });

    app.get("/admin/settings", verifyToken, verifyAdmin, async (req, res) => {
      const settings = await settingsCollection.findOne({ _id: SETTINGS_ID });
      res.send({ ...defaultRestaurantSettings, ...settings });
    });

    app.patch("/admin/settings", verifyToken, verifyAdmin, async (req, res) => {
      const maxReservationGuests = Number(req.body.maxReservationGuests);
      const settings = {
        restaurantName: req.body.restaurantName || defaultRestaurantSettings.restaurantName,
        tagline: req.body.tagline || defaultRestaurantSettings.tagline,
        phone: req.body.phone || defaultRestaurantSettings.phone,
        email: req.body.email || defaultRestaurantSettings.email,
        address: req.body.address || defaultRestaurantSettings.address,
        openingHours: req.body.openingHours || defaultRestaurantSettings.openingHours,
        kitchenHours: req.body.kitchenHours || defaultRestaurantSettings.kitchenHours,
        reservationNotice:
          req.body.reservationNotice || defaultRestaurantSettings.reservationNotice,
        maxReservationGuests:
          Number.isFinite(maxReservationGuests) && maxReservationGuests > 0
            ? maxReservationGuests
            : defaultRestaurantSettings.maxReservationGuests,
        updatedAt: new Date(),
      };

      const result = await settingsCollection.updateOne(
        { _id: SETTINGS_ID },
        {
          $set: settings,
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      res.send({ ...result, settings: { ...defaultRestaurantSettings, ...settings } });
    });

    app.get("/carts", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await cartsCollection.find({ email }).toArray();
      res.send(result);
    });

    app.post("/carts", verifyToken, async (req, res) => {
      const cartItem = req.body;
      if (cartItem.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", verifyToken, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid cart id" });
      }

      const result = await cartsCollection.deleteOne({
        _id: id,
        email: req.decoded.email,
      });
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = {
        ...req.body,
        role: req.body.role || "customer",
        createdAt: req.body.createdAt || new Date(),
      };
      const existingUser = await usersCollection.findOne({ email: user.email });

      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const admin = await isAdminEmail(email);
      res.send({ admin });
    });

    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid user id" });
      }

      const result = await usersCollection.updateOne(
        { _id: id },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid user id" });
      }

      const result = await usersCollection.deleteOne({ _id: id });
      res.send(result);
    });

    app.get("/bookings", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        const isAdmin = await isAdminEmail(req.decoded.email);

        if (email && email !== req.decoded.email && !isAdmin) {
          return res.status(403).send({ message: "forbidden access" });
        }

        if (!email && !isAdmin) {
          return res.status(403).send({ message: "forbidden access" });
        }

        let result;

        if (isMongoConnected) {
          const query = email ? { email } : {};
          result = await bookingsCollection
            .find(query)
            .sort({ date: 1, time: 1 })
            .toArray();
        } else {
          const localBookings = await readLocalBookings();
          result = sortBookings(
            email
              ? localBookings.filter((booking) => booking.email === email)
              : localBookings
          );
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "failed to load bookings",
          error: error.message,
        });
      }
    });

    app.post("/bookings", verifyToken, async (req, res) => {
      try {
        const { name, date, time, guests, phone, notes = "" } = req.body;

        if (!name || !date || !time || !guests || !phone) {
          return res.status(400).send({
            message: "name, date, time, guests, and phone are required",
          });
        }

        const guestCount = Number(guests);
        if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 20) {
          return res.status(400).send({
            message: "guests must be a number between 1 and 20",
          });
        }

        const booking = {
          name,
          email: req.decoded.email,
          date,
          time,
          guests: guestCount,
          phone,
          notes,
          status: "pending",
          createdAt: new Date(),
        };

        if (isMongoConnected) {
          const result = await bookingsCollection.insertOne(booking);
          return res.send({ ...result, booking, storage: "mongo" });
        }

        const localBookings = await readLocalBookings();
        const localBooking = {
          ...booking,
          _id: `local-booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          createdAt: booking.createdAt.toISOString(),
        };

        localBookings.push(localBooking);
        await writeLocalBookings(localBookings);

        res.send({
          acknowledged: true,
          insertedId: localBooking._id,
          booking: localBooking,
          storage: "file",
        });
      } catch (error) {
        res.status(500).send({
          message: "failed to save reservation",
          error: error.message,
        });
      }
    });

    app.patch("/bookings/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = toObjectId(req.params.id);
      if (!id) {
        return res.status(400).send({ message: "invalid booking id" });
      }

      const result = await bookingsCollection.updateOne(
        { _id: id },
        { $set: { status: req.body.status } }
      );
      res.send(result);
    });

    app.delete("/bookings/:id", verifyToken, async (req, res) => {
      const isAdmin = await isAdminEmail(req.decoded.email);

      if (isMongoConnected) {
        const id = toObjectId(req.params.id);
        if (!id) {
          return res.status(400).send({ message: "invalid booking id" });
        }

        const booking = await bookingsCollection.findOne({ _id: id });
        if (!booking) {
          return res.status(404).send({ message: "booking not found" });
        }

        if (booking.email !== req.decoded.email && !isAdmin) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await bookingsCollection.deleteOne({ _id: id });
        return res.send(result);
      }

      const localBookings = await readLocalBookings();
      const booking = localBookings.find((item) => item._id === req.params.id);

      if (!booking) {
        return res.status(404).send({ message: "booking not found" });
      }

      if (booking.email !== req.decoded.email && !isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const nextBookings = localBookings.filter((item) => item._id !== req.params.id);
      await writeLocalBookings(nextBookings);
      res.send({ acknowledged: true, deletedCount: 1, storage: "file" });
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = Math.round(Number(price) * 100);

      if (!amount || amount < 1) {
        return res.status(400).send({ message: "invalid payment amount" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await paymentCollection
        .find({ email: req.params.email })
        .toArray();
      res.send(result);
    });

    app.get("/admin/payments", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search?.trim();
      const query = search
        ? {
            $or: [
              { email: { $regex: search, $options: "i" } },
              { transactionId: { $regex: search, $options: "i" } },
            ],
          }
        : {};

      const result = await paymentCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/admin/recent-activity", verifyToken, verifyAdmin, async (req, res) => {
      const [recentBookings, recentPayments, recentUsers] = await Promise.all([
        bookingsCollection.find().sort({ _id: -1 }).limit(5).toArray(),
        paymentCollection.find().sort({ _id: -1 }).limit(5).toArray(),
        usersCollection.find().sort({ _id: -1 }).limit(5).toArray(),
      ]);

      res.send({
        recentBookings,
        recentPayments,
        recentUsers,
      });
    });

    app.get("/admin/bookings-summary", verifyToken, verifyAdmin, async (req, res) => {
      const today = startOfToday().toISOString().slice(0, 10);

      const [allBookings, todayBookings, pendingBookings, confirmedBookings] =
        await Promise.all([
          bookingsCollection.estimatedDocumentCount(),
          bookingsCollection.countDocuments({ date: today }),
          bookingsCollection.countDocuments({ status: "pending" }),
          bookingsCollection.countDocuments({ status: "confirmed" }),
        ]);

      res.send({
        allBookings,
        todayBookings,
        pendingBookings,
        confirmedBookings,
      });
    });

    app.post("/payment", verifyToken, async (req, res) => {
      const payment = req.body;
      if (payment.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const paymentResult = await paymentCollection.insertOne(payment);
      const cartObjectIds = payment.cartId.map((id) => new ObjectId(id));
      const deleteResult = await cartsCollection.deleteMany({
        _id: { $in: cartObjectIds },
        email: req.decoded.email,
      });

      res.send({ paymentResult, deleteResult });
    });

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const revenueResult = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$price" },
            },
          },
        ])
        .toArray();

      const [users, menuItems, orders, bookings] = await Promise.all([
        usersCollection.estimatedDocumentCount(),
        menuCollection.estimatedDocumentCount(),
        paymentCollection.estimatedDocumentCount(),
        bookingsCollection.estimatedDocumentCount(),
      ]);

      res.send({
        revenue: revenueResult[0]?.totalRevenue || 0,
        users,
        menuItems,
        orders,
        bookings,
      });
    });

    await ensureBookingsFile();

    try {
      await client.connect();
      await client.db("admin").command({ ping: 1 });
      isMongoConnected = true;
      await usersCollection.updateOne(
        { email: DEV_ADMIN_EMAIL },
        {
          $set: {
            name: "Forkly Admin",
            email: DEV_ADMIN_EMAIL,
            role: "admin",
            authProvider: "local-dev",
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      await settingsCollection.updateOne(
        { _id: SETTINGS_ID },
        {
          $setOnInsert: {
            ...defaultRestaurantSettingsFields,
            createdAt: new Date(),
          },
          $set: {
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
      console.log("Connected to MongoDB");
    } catch (error) {
      isMongoConnected = false;
      console.log("MongoDB unavailable, using local booking storage");
      console.log(error.message);
    }
  } finally {
    // Keep the connection open for the running API server.
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Forkly Server is Running");
});

app.get("/health", (req, res) => {
  res.status(200).send({ status: "ok" });
});

const server = app.listen(port, () => {
  console.log(`Forkly backend is running on port ${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("");
    console.log(`Port ${port} is already in use.`);
    console.log("Run `npm run dev` to stop the old backend and start a fresh one.");
    console.log("Or run `npm run stop` first, then `npm start`.");
    process.exit(1);
  }

  throw error;
});
