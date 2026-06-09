const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// 1. Load Environment Config Variables (.env)
dotenv.config();

// 2. Initialize and Boot Up Local SQLite Database 
// This automatically points to AppData on production or your root folder in development
require("./config/db");

const app = express();

// 3. Open CORS completely for Electron's internal protocols
app.use(
  cors({
    origin: "*", 
    credentials: true
  })
);

app.use(express.json());

// Base Health Check endpoint to verify engine state in Electron
app.get("/", (req, res) => {
  res.status(200).json({ message: "DukaFlow Local POS Engine Active Client-Side" });
});

// 4. Unified Routes (Clean and untouched to keep your endpoints mapping solid)
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/sales", require("./routes/saleRoutes"));
app.use("/api/credits", require("./routes/creditRoutes"));
app.use("/api/credits/payments", require("./routes/creditRoutes"));
app.use("/api/stock", require("./routes/stockRoutes"));
app.use('/api/auth', require('./routes/authRoutes'));
app.use("/api/staff", require('./routes/staffRoutes'));
app.use("/api/payments", require('./routes/paymentRoutes'));
app.use("/api/admin/dashboard", require('./routes/dashboardRoutes'));
app.use("/api/admin/business", require('./routes/businessRoutes'));
app.use("/api/admin/businesses", require('./routes/usersRoutes'));
app.use("/api/admin/users", require('./routes/usersRoutes'));
app.use("/api/admin/subscription", require('./routes/subscriptionRoutes'));
app.use("/api/admin/lifetimeaccess", require('./routes/subscriptionRoutes'));
app.use("/api/myprofile", require('./routes/businessRoutes'));
app.use("/api/settings", require('./routes/usersRoutes'));

// 5. Catch-all route handler for broken routes
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found locally on this machine." });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Offline Backend Engine running locally on port ${PORT}`);
});