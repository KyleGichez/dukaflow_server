const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// Inside your server directory (e.g., server.js or your routes folder)
const bcrypt = require('bcrypt'); // Use the backend's working bcrypt module

// 1. Load Environment Config Variables (.env)
dotenv.config();

// 2. Initialize and Boot Up Local SQLite Database
// This automatically points to AppData on production or your root folder in development
const db = require("./config/db");
const app = express();

// 3. Open CORS completely for Electron's internal protocols
const allowedOrigins = [
  "http://localhost:5173", 
  "http://127.0.0.1:5173"
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl tools)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS Ruleset"));
    }
  },
  credentials: true, // 💡 This satisfies your Axios 'withCredentials: true' requirement!
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// 1. Fixed Seeding Function for standard callback-based sqlite3
function seedBackendAdmin(databaseInstance) {
  // Check by EMAIL instead of role to avoid the unique constraint crash
  databaseInstance.get('SELECT * FROM users WHERE email = ?', ['admin@dukaflow.com'], (err, adminExists) => {
    if (err) {
      console.error("❌ Error checking for admin existence:", err.message);
      return;
    }

    if (!adminExists) {
      const hash = bcrypt.hashSync('Admin@2026', 10);
      
      databaseInstance.run(
        'INSERT INTO users (fname, lname, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
        ['Gichure', 'Maina', 'admin@dukaflow.com', '0793410951', hash, 'superadmin'],
        function(insertErr) {
          if (insertErr) {
            console.error("❌ Error seeding superadmin:", insertErr.message);
          } else {
            console.log('📦 Seeded superadmin into local pos_system.db safely.');
          }
        }
      );
    } else {
      // If they exist but have the wrong name, update them!
      databaseInstance.run(
        'UPDATE users SET fname = ?, lname = ?, phone = ? WHERE email = ?',
        ['Gichure', 'Maina', '0793410951', 'admin@dukaflow.com'],
        function(updateErr) {
          if (updateErr) {
            console.error("❌ Error updating superadmin names:", updateErr.message);
          } else {
            console.log('🔄 Superadmin profile names updated to Gichure Maina successfully.');
          }
        }
      );
    }
  });
}

// Trigger the seed function safely
seedBackendAdmin(db);

// Base Health Check endpoint to verify engine state in Electron
app.get("/", (req, res) => {
  res
    .status(200)
    .json({ message: "DukaFlow Local POS Engine Active Client-Side" });
});

// 4. Unified Routes (Clean and untouched to keep your endpoints mapping solid)
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/sales", require("./routes/saleRoutes"));
app.use("/api/credits", require("./routes/creditRoutes"));
app.use("/api/credits/payments", require("./routes/creditRoutes"));
app.use("/api/stock", require("./routes/stockRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/admin/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/admin/business", require("./routes/businessRoutes"));
app.use("/api/admin/business/integrations", require("./routes/businessRoutes"));
app.use("/api/admin/businesses", require("./routes/usersRoutes"));
app.use("/api/admin/users", require("./routes/usersRoutes"));
app.use("/api/admin/subscription", require("./routes/subscriptionRoutes"));
app.use("/api/admin/lifetimeaccess", require("./routes/subscriptionRoutes"));
app.use("/api/myprofile", require("./routes/businessRoutes"));
app.use("/api/settings", require("./routes/usersRoutes"));
app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));

// ====================================================================
// 📊 REAL-TIME ADVANCED LEDGER ANALYTICS ROUTE ENGINE
// Resolves the 404 error and aggregates live collections securely
// ====================================================================
app.get("/api/analytics/revenue-summary", (req, res) => {
  const { range, startDate, endDate, paymentMethod } = req.query;

  let dateConstraint = "1=1";
  let creditDateConstraint = "1=1"; 
  const params = [];
  const creditParams = [];

  if (startDate && endDate) {
    dateConstraint = "date(`date`) BETWEEN date(?) AND date(?)";
    creditDateConstraint = "date(`paymentDate`) BETWEEN date(?) AND date(?)";
    params.push(startDate, endDate);
    creditParams.push(startDate, endDate);
  } else if (range === "today") {
    dateConstraint = "date(`date`) = date('now', '+3 hours')";
    creditDateConstraint = "date(`paymentDate`) = date('now', '+3 hours')";
  } else if (range === "this-week") {
    dateConstraint = "date(`date`) >= date('now', '+3 hours', 'weekday 0', '-7 days')";
    creditDateConstraint = "date(`paymentDate`) >= date('now', '+3 hours', 'weekday 0', '-7 days')";
  } else if (range === "this-month") {
    dateConstraint = "strftime('%Y-%m', `date`) = strftime('%Y-%m', 'now', '+3 hours')";
    creditDateConstraint = "strftime('%Y-%m', `paymentDate`) = strftime('%Y-%m', 'now', '+3 hours')";
  }

  let paymentConstraint = "1=1";
  if (paymentMethod && paymentMethod !== "All") {
    paymentConstraint = "(paymentMethod = ? OR paymentMethod = 'Credit')";
    params.push(paymentMethod);
  }

  // 1. Core Analytics Summary Query
  const mainQuery = `
    SELECT 
      SUM(CAST(totalPrice AS REAL)) as grossRevenue,
      SUM(CAST(balance AS REAL)) as totalDebtIssued,
      SUM(CASE WHEN paymentMethod = 'Cash' THEN (CAST(totalPrice AS REAL) - CAST(balance AS REAL)) ELSE 0 END) as directCash,
      SUM(CASE WHEN paymentMethod IN ('M-pesa', 'M-pesa Paybill', 'Mpesa') THEN (CAST(totalPrice AS REAL) - CAST(balance AS REAL)) ELSE 0 END) as directMpesa,
      SUM(CASE WHEN paymentMethod IN ('Bank Transfer', 'Cheque', 'Bank') THEN (CAST(totalPrice AS REAL) - CAST(balance AS REAL)) ELSE 0 END) as directBank,
      SUM(CASE WHEN paymentMethod = 'Credit' THEN (CAST(totalPrice AS REAL) - CAST(balance AS REAL)) ELSE 0 END) as creditDownpayments
    FROM sales 
    WHERE ${dateConstraint} AND ${paymentConstraint}
  `;

  db.get(mainQuery, params, (err, salesSummary) => {
    if (err) {
      return res.status(500).json({ error: "Failed to compile financial summaries", details: err.message });
    }

    const gross = salesSummary?.grossRevenue || 0;
    const debtIssued = salesSummary?.totalDebtIssued || 0;
    const directCash = salesSummary?.directCash || 0;
    const directMpesa = salesSummary?.directMpesa || 0;
    const directBank = salesSummary?.directBank || 0;
    const creditDownpayments = salesSummary?.creditDownpayments || 0;

    // 2. Aggregate Credit Repayments
    const creditQuery = `SELECT amountPaid, paymentMethod FROM credit_payments WHERE ${creditDateConstraint}`;
    
    db.all(creditQuery, creditParams, (creditErr, repayments) => {
      let cashRepayments = 0;
      let mpesaRepayments = 0;
      let bankRepayments = 0;

      if (!creditErr && repayments) {
        repayments.forEach(pay => {
          const amt = Number(pay.amountPaid) || 0;
          const method = (pay.paymentMethod || "").trim().toLowerCase();

          if (method === 'cash') {
            cashRepayments += amt;
          } else if (method.includes('mpesa') || method.includes('M-pesa')) {
            mpesaRepayments += amt;
          } else if (method.includes('Bank Transfer') || method.includes('bank') || method.includes('cheque') || method.includes('transfer')) {
            bankRepayments += amt;
          }
        });
      }

      const totalRepaymentsCollected = cashRepayments + mpesaRepayments + bankRepayments;
      const outstandingDebt = Math.max(0, debtIssued - totalRepaymentsCollected);

      const finalCashTotal = directCash + cashRepayments;
      const finalMpesaTotal = directMpesa + mpesaRepayments;
      const finalBankTotal = directBank + bankRepayments;

      const totalCollections = finalCashTotal + finalMpesaTotal + finalBankTotal;
      const realizedProfitsFormula = Math.max(0, gross - outstandingDebt);

      // 3. Dynamic Rolling 7-Day Performance Metric Query
      const dailyQuery = `
        SELECT 
          CASE strftime('%w', \`date\`)
            WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue'
            WHEN '3' THEN 'Wed' WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri' 
            WHEN '6' THEN 'Sat'
          END as dayLabel,
          SUM(CAST(totalPrice AS REAL)) as dailyRevenue
        FROM sales
        WHERE date(\`date\`) >= date('now', '+3 hours', '-6 days')
        GROUP BY dayLabel
      `;

      db.all(dailyQuery, [], (dailyErr, dailyRows) => {
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const realRevenueMap = {};
        daysOfWeek.forEach(day => realRevenueMap[day] = 0);

        if (!dailyErr && dailyRows) {
          dailyRows.forEach(row => {
            if (row.dayLabel) realRevenueMap[row.dayLabel] = row.dailyRevenue || 0;
          });
        }

        const peakEarningDayValue = Math.max(...Object.values(realRevenueMap), 1);
        const progressMap = daysOfWeek.map((dayLabel) => {
          const dayRevenue = realRevenueMap[dayLabel] || 0;
          return {
            dayLabel,
            revenue: dayRevenue,
            percentage: Math.round((dayRevenue / peakEarningDayValue) * 100)
          };
        });

        // 🌟 4. EXPLICIT PRODUCTIVITY QUERIES FOR LAST WEEK VS THIS WEEK
        // This Week = Everything from the most recent Sunday to now
        // Last Week = Everything from Sunday last week up to that next Sunday
        const productivityQuery = `
          SELECT 
            SUM(CASE WHEN date(\`date\`) >= date('now', '+3 hours', 'weekday 0', '-7 days') THEN CAST(totalPrice AS REAL) ELSE 0 END) as thisWeekRevenue,
            SUM(CASE WHEN date(\`date\`) >= date('now', '+3 hours', 'weekday 0', '-14 days') AND date(\`date\`) < date('now', '+3 hours', 'weekday 0', '-7 days') THEN CAST(totalPrice AS REAL) ELSE 0 END) as lastWeekRevenue
          FROM sales
        `;

        db.get(productivityQuery, [], (prodErr, prodRow) => {
          const actualThisWeek = prodRow?.thisWeekRevenue || 0;
          const actualLastWeek = prodRow?.lastWeekRevenue || 0;

          res.json({
            trueGrossRevenue: gross,
            remainingActiveCredit: outstandingDebt,
            trueRealizedRevenue: realizedProfitsFormula,
            
            finalCashTotal: finalCashTotal,
            creditInitialPaymentsCollected: creditDownpayments,
            cashRepayments: cashRepayments,
            
            finalMpesaTotal: finalMpesaTotal,
            creditInitialPaymentsCollected: creditDownpayments,
            mpesaRepayments: mpesaRepayments,
            
            finalBankTotal: finalBankTotal,
            creditInitialPaymentsCollected: creditDownpayments,
            bankRepayments: bankRepayments,

            totalCollections: totalCollections,
            
            last7DaysProfits: realizedProfitsFormula,
            avgDailyProfit: realizedProfitsFormula / 7,
            
            // 🌟 Updated to provide true dynamic comparisons back to the dashboard UI
            lastWeekProductivity: actualLastWeek,
            currentWeekProductivity: actualThisWeek,
            progressMap: progressMap
          });
        });
      });
    });
  });
});

// 5. Catch-all route handler for broken routes
app.use((req, res) => {
  res
    .status(404)
    .json({ message: "Endpoint not found locally on this machine." });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Offline Backend Engine running locally on port ${PORT}`);
});