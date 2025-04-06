const express = require("express");
const mongoose = require("mongoose");
const Product = require("./models/listings");
const path = require("path");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError");
const Review = require("./models/review");
const reviewSchema = require("./schema.js");
const session = require("express-session");
const flash = require("connect-flash");
const User = require("./models/user.js");
const bcrypt = require("bcrypt");

const app = express();
const port = 3000;
const MONGO_URL = "mongodb://localhost:27017/E-Commerce";

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// EJS setup
app.engine("ejs", ejsMate);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Connect to MongoDB
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Session Configuration
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(flash());

// Flash Middleware
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

const validateReview = (req, res, next) => {
  const { error } = reviewSchema.validate(req.body.review); // Validate 'review' object
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(", ");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};
//new comment added
app.get("/", async (req, res) => {
  try {
    console.log(req.method);

    const listings = await Product.find({});
    res.render("listings/show", {
      listings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("listings/error", {
      message: "Error retrieving data.",
    });
  }
});

app.get("/listing/product/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Product.findById(id).populate("reviews");
    if (!listing) throw new ExpressError(404, "Product not found");
    res.render("listings/specific", { listing });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).render("listings/error", {
      message: error.message || "Something went wrong.",
    });
  }
});

app.post("/listing/:id/reviews", validateReview, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash("error", "Product not found.");
      return res.redirect("/");
    }

    const newReview = new Review({
      rating: req.body.review.rating,
      comment: req.body.review.comment,
      product: req.params.id,
    });

    await newReview.save();
    product.reviews.push(newReview._id);
    await product.save();

    req.flash("success", "Review added successfully!");
    res.redirect(`/listing/product/${req.params.id}`);
  } catch (error) {
    console.error(error);
    res.status(500).render("listings/error", {
      message: "Something went wrong while saving the review.",
    });
  }
});

app.post("/listing/:listingId/review_delete/:reviewId", async (req, res) => {
  try {
    const { listingId, reviewId } = req.params;
    const listing = await Product.findById(listingId);

    if (!listing) {
      req.flash("error", "Product not found.");
      return res.redirect("/");
    }

    listing.reviews = listing.reviews.filter(
      (review) => review._id.toString() !== reviewId
    );

    await Review.findByIdAndDelete(reviewId);
    await listing.save();
    req.flash("success", "Review deleted successfully!");
    res.redirect(`/listing/product/${listing._id}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/listing/product/:id/cart", async (req, res) => {
  const productId = req.params.id;
  const listing = await Product.findById(productId);

  if (!listing) {
    req.flash("error", "Product not found.");
    return res.redirect("/");
  }

  res.render("listings/cart.ejs", { listing });
});

// Login Routes
app.get("/login", (req, res) => {
  res.render("listings/login", { messages: req.flash() }); // Pass flash messages to the view
});

app.post("/login/submit", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      req.flash("error", "Email and password are required.");
      return res.redirect("/login");
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      req.flash("error", "User not found! Please sign up first.");
      return res.redirect("/signup"); // Redirect to signup if user doesn't exist
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash("error", "Invalid credentials!");
      return res.redirect("/login"); // Redirect back to login on failure
    }

    // Set session or token for authenticated user
    req.session.userId = user._id; // Example: Using session for authentication
    req.flash("success", `Welcome back, ${user.username}!`);
    res.redirect("/"); // Redirect to dashboard after successful login
  } catch (error) {
    console.error("Login Error:", error);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect("/login");
  }
});

// Signup Routes
app.get("/signup", (req, res) => {
  res.render("listings/signup", { messages: req.flash() }); // Pass flash messages to the view
});

app.post("/signup/submit", async (req, res) => {
  try {
    const { username, email, password, address, phone, role } = req.body;

    // Validate input
    if (!username || !email || !password || !address || !phone) {
      req.flash("error", "All fields are required.");
      return res.redirect("/signup");
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      req.flash("error", "User already exists! Please log in.");
      return res.redirect("/login"); // Redirect to login if user exists
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      address,
      phone,
      role,
    });
    await newUser.save();

    req.flash("success", "Account created! Please log in.");
    res.redirect("/login"); // Redirect to login after successful signup
  } catch (error) {
    console.error("Signup Error:", error);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect("/signup"); // Redirect back to signup on error
  }
});

// Error handler for 404 and other errors
app.all("*", (req, res, next) => next(new ExpressError(404, "Page Not Found")));

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).render("listings/error", {
    message: err.message || "Something went wrong.",
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
