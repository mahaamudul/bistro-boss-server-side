const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const fs = require("fs/promises");
const path = require("path");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const defaultMongoHosts = [
  "ac-6w3swfs-shard-00-00.crlsfbw.mongodb.net:27017",
  "ac-6w3swfs-shard-00-01.crlsfbw.mongodb.net:27017",
  "ac-6w3swfs-shard-00-02.crlsfbw.mongodb.net:27017",
].join(",");

const uri =
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

async function run() {
  try {
    const db = client.db("bistroBossDB");
    const menuCollection = db.collection("menu");
    const reviewsCollection = db.collection("customerReview");
    const cartsCollection = db.collection("carts");
    const usersCollection = db.collection("users");
    const paymentCollection = db.collection("payments");
    const bookingsCollection = db.collection("bookings");

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

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const result = await menuCollection.insertOne(req.body);
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
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      if (review.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
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
      const user = req.body;
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
  res.send("Bistro Boss Server is Running");
});

app.listen(port, () => {
  console.log(`server is running in port ${port}`);
});
