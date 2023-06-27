const express = require("express");
const app = express();
require("dotenv").config();
var jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;
var cors = require("cors");

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tewydk3.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyjwt = (req, res, next) => {
  // console.log(req.headers.authorization);
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  // console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("bistroDB");
    const userCollection = database.collection("user");
    const menuCollection = database.collection("menu");
    const reviewCollection = database.collection("reviews");
    const cartCollection = database.collection("carts");
    const paymentCollection = database.collection("payments");
    // make verifyjwt before verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.roll !== "admin") {
        return res.status(403).send({ error: true, message: "forbidden" });
      }
      // if (user?.role !== "admin") {
      //   return res.status(403).send({ error: true, message: "forbidden" });
      // }
      next();
    };

    // JWT

    app.post("/jwt", (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // user api

    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(4, user);
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await userCollection.insertOne(user);
      // console.log(result);
      res.send(result);
    });

    //security layer:verify jwt
    //don't show the secure links to those who shouldn't see the links???? not done

    app.get("/users", verifyjwt, verifyAdmin, async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //security layer:verify jwt
    // email same check
    // check admin

    app.get("/users/admin/:email", verifyjwt, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      // console.log(4, email, req.decoded.email);
      const user = await userCollection.findOne(query);
      // console.log(user);
      const result = { admin: user?.roll === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      // const updatedUser = req.body;
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          roll: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // menu api

    //todo: verifyjwt, verifyAdmin,
    app.post("/menu", verifyjwt, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      // console.log(newItem);
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    });

    app.get("/menu", async (req, res) => {
      const cursor = menuCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // verifiJWT, verifyadmin

    app.delete("/menu/:id", verifyjwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // console.log(query);
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    // reviews
    app.get("/reviews", async (req, res) => {
      const cursor = reviewCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // carts

    app.get("/carts", verifyjwt, async (req, res) => {
      const email = req.query?.email;

      const decoded = req.decoded;

      if (decoded?.email !== req.query.email) {
        return res.status(403).send({ error: true, message: "forbidden" });
      }
      // console.log(email);
      if (!email) {
        return res.send([]);
      }
      const query = { email: email };
      const cursor = cartCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // same content above only route change
    app.get("/cart", async (req, res) => {
      const cursor = cartCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const itemid = req.params.id;
      const query = { _id: new ObjectId(itemid) };
      const result = await cartCollection.deleteOne(query);
      // const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      // console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.get("/admin-stats", verifyjwt, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const payments = await paymentCollection.find({}).toArray();
      console.log({ payments });
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);
      console.log(revenue);
      res.send({
        users,
        products,
        orders,
        revenue,
      });
    });

    // PAYMENT START
    // create payment intent
    app.post("/create-payment-intent", verifyjwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price) * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "INR",
        payment_method_types: ["card"],
      });
      console.log(paymentIntent);

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyjwt, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ insertResult, deleteResult });
    });

    // PAYMENT END

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
