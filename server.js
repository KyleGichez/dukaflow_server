const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://dukaflow.netlify.app"
    ],
    credentials: true
  })
);

app.use(express.json());

// Routes
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/sales", require("./routes/saleRoutes"));
app.use("/api/stock", require("./routes/stockRoutes"));
app.use('/api/auth', require('./routes/authRoutes'));
app.use("/api/staff", require('./routes/staffRoutes'));
app.use("/api/payments",require('./routes/paymentRoutes'));
app.use("/api/admin/dashboard",require('./routes/dashboardRoutes'));
app.use("/api/admin/business",require('./routes/businessRoutes'));
app.use("/api/admin/businesses",require('./routes/usersRoutes'));
app.use("/api/admin/users",require('./routes/usersRoutes'));
app.use("/api/admin/subscription",require('./routes/subscriptionRoutes'));
app.use("/api/myprofile",require('./routes/businessRoutes'));
app.use("/api/settings",require('./routes/usersRoutes'));


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
