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
  "http://127.0.0.1:5173",
  "https://dukaflow.netlify.app"
];

app.use(cors({
  origin: function (origin, callback) {
    // 💡 FIX: Allow requests with no origin OR internal Electron desktop frames ('file://')
    if (!origin || origin.startsWith("file://") || origin.includes("localhost")) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS Ruleset"));
    }
  },
  credentials: true,
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

const authMiddleWare = require("./middleware/authMiddleware");

// ====================================================================
// 📊 REAL-TIME ADVANCED LEDGER ANALYTICS ROUTE ENGINE
// Resolves the 404 error and aggregates live collections securely
// ====================================================================
app.get("/api/analytics/revenue-summary", authMiddleWare, (req, res) => {
  const { range, startDate, endDate, paymentMethod } = req.query;

  const businessId = req.user?.businessId;
  if (!businessId) {
    return res.status(400).json({ error: "Missing active business validation context." });
  }

  // Helper function to convert raw text dates (DD/MM/YYYY) into ISO standard YYYY-MM-DD
  const normalizeDateSQL = (columnName) => {
    return `CASE 
      WHEN ${columnName} LIKE '__/__/____%' THEN 
        SUBSTR(${columnName}, 7, 4) || '-' || SUBSTR(${columnName}, 4, 2) || '-' || SUBSTR(${columnName}, 1, 2)
      ELSE date(${columnName})
    END`;
  };

  // 1️⃣ Build Robust Date Constraints across formats
  let salesDateConstraint = "1=1";
  let invoiceDateConstraint = "1=1";
  let creditDateConstraint = "1=1";
  let creditPaymentDateConstraint = "1=1";
  
  const baseDateParams = [];
  const parsedSalesDate = normalizeDateSQL("`date`");
  const parsedInvoiceDate = "date(`createdAt`)";
  const parsedCreditDate = "date(`createdAt`)"; 
  const parsedCreditPaymentDate = "date(cp.`date`)";

  if (startDate && endDate) {
    salesDateConstraint = `${parsedSalesDate} BETWEEN date(?) AND date(?)`;
    invoiceDateConstraint = `${parsedInvoiceDate} BETWEEN date(?) AND date(?)`;
    creditDateConstraint = `${parsedCreditDate} BETWEEN date(?) AND date(?)`;
    creditPaymentDateConstraint = `${parsedCreditPaymentDate} BETWEEN date(?) AND date(?)`;
    baseDateParams.push(startDate, endDate);
  } else if (range === "today") {
    const todayTarget = "date('now', '+3 hours')";
    salesDateConstraint = `${parsedSalesDate} = ${todayTarget}`;
    invoiceDateConstraint = `${parsedInvoiceDate} = ${todayTarget}`;
    creditDateConstraint = `${parsedCreditDate} = ${todayTarget}`;
    creditPaymentDateConstraint = `${parsedCreditPaymentDate} = ${todayTarget}`;
  } else if (range === "this-week") {
    const weekStart = "date('now', '+3 hours', 'weekday 0', '-7 days')";
    salesDateConstraint = `${parsedSalesDate} >= ${weekStart}`;
    invoiceDateConstraint = `${parsedInvoiceDate} >= ${weekStart}`;
    creditDateConstraint = `${parsedCreditDate} >= ${weekStart}`;
    creditPaymentDateConstraint = `${parsedCreditPaymentDate} >= ${weekStart}`;
  } else if (range === "this-month") {
    const currentMonth = "strftime('%Y-%m', 'now', '+3 hours')";
    salesDateConstraint = `strftime('%Y-%m', ${parsedSalesDate}) = ${currentMonth}`;
    invoiceDateConstraint = `strftime('%Y-%m', ${parsedInvoiceDate}) = ${currentMonth}`;
    creditDateConstraint = `strftime('%Y-%m', ${parsedCreditDate}) = ${currentMonth}`;
    creditPaymentDateConstraint = `strftime('%Y-%m', ${parsedCreditPaymentDate}) = ${currentMonth}`;
  }

  const mainQueryParams = [businessId, ...baseDateParams];

  // 2️⃣ Build dynamic filter options (Cleaned to prevent placeholder or evaluation collision)
  let paymentConstraint = "1=1";
  const activeFilter = paymentMethod ? paymentMethod.trim().toLowerCase() : "all";

  if (activeFilter !== "all") {
    if (activeFilter.includes('credit') || activeFilter.includes('deni')) {
      paymentConstraint = "UPPER(paymentMethod) = 'CREDIT'";
    } else if (activeFilter.includes('mpesa')) {
      paymentConstraint = "UPPER(paymentMethod) IN ('M-PESA', 'M-PESA PAYBILL', 'MPESA')";
    } else if (activeFilter.includes('bank') || activeFilter.includes('transfer')) {
      paymentConstraint = "UPPER(paymentMethod) IN ('BANK TRANSFER', 'CHEQUE', 'BANK')";
    } else if (activeFilter.includes('cash')) {
      paymentConstraint = "UPPER(paymentMethod) = 'CASH'";
    } else {
      paymentConstraint = "UPPER(paymentMethod) = UPPER(?)";
      mainQueryParams.push(paymentMethod.trim().toLowerCase());
    }
  }

  // 3️⃣ Query 1: Gross Sales Performance + True Profit Margin Analysis
  const mainQuery = `
    SELECT 
      COALESCE(SUM(CAST(totalPrice AS REAL)), 0) as grossRevenue,
      COALESCE(SUM(CAST(totalPrice AS REAL) - (CAST(COALESCE(buyingPrice, 0) AS REAL) * CAST(COALESCE(quantitySold, 1) AS REAL))), 0) as netProfit,
      COALESCE(SUM(CASE WHEN UPPER(paymentMethod) = 'CASH' THEN CAST(totalPrice AS REAL) ELSE 0 END), 0) as directCash,
      COALESCE(SUM(CASE WHEN UPPER(paymentMethod) IN ('M-PESA', 'M-PESA PAYBILL', 'MPESA') THEN CAST(totalPrice AS REAL) ELSE 0 END), 0) as directMpesa,
      COALESCE(SUM(CASE WHEN UPPER(paymentMethod) = 'CREDIT' THEN CAST(totalPrice AS REAL) ELSE 0 END), 0) as directCredit,
      COALESCE(SUM(CASE WHEN UPPER(paymentMethod) IN ('BANK TRANSFER', 'CHEQUE', 'BANK') THEN CAST(totalPrice AS REAL) ELSE 0 END), 0) as directBank
    FROM sales 
    WHERE businessId = ? AND ${salesDateConstraint} AND ${paymentConstraint}
  `;

  db.get(mainQuery, mainQueryParams, (err, salesSummary) => {
    if (err) {
      return res.status(500).json({ error: "Failed to compile sales summaries", details: err.message });
    }

    const gross = salesSummary?.grossRevenue || 0;
    const cleanProfit = salesSummary?.netProfit || 0;
    const directCash = salesSummary?.directCash || 0;
    const directMpesa = salesSummary?.directMpesa || 0;
    const directBank = salesSummary?.directBank || 0;
    const directCredit = salesSummary?.directCredit || 0;

    // Fetch live ledger balance from dedicated credits table
    const standaloneCreditsQuery = `
      SELECT COALESCE(SUM(CAST(balance AS REAL)), 0) as totalStandaloneDebt
    FROM credits
      WHERE businessId = ? AND ${creditDateConstraint}
    `;
    const creditsParams = [businessId, ...baseDateParams];

    db.get(standaloneCreditsQuery, creditsParams, (creditsErr, creditsRow) => {
      if (creditsErr) {
        return res.status(500).json({ error: "Failed to process standalone credits debt", details: creditsErr.message });
      }

      // Fetch live billing balance from invoices table
      const invoiceDebtQuery = `
        SELECT COALESCE(SUM(CAST(balance AS REAL)), 0) as totalInvoiceDebt
        FROM invoices
        WHERE businessId = ? AND ${invoiceDateConstraint}
      `;
      const invoiceDebtParams = [businessId, ...baseDateParams];

      db.get(invoiceDebtQuery, invoiceDebtParams, (invoiceDebtErr, invoiceDebtRow) => {
        if (invoiceDebtErr) {
          return res.status(500).json({ error: "Failed to process invoice debt", details: invoiceDebtErr.message });
        }

        const standaloneDebt = creditsRow?.totalStandaloneDebt || 0;
        const invoiceDebt = invoiceDebtRow?.totalInvoiceDebt || 0;
        const outstandingDebt = standaloneDebt + invoiceDebt;

        // Query 3: Repayments gathered safely from credit_payments table
        const creditQuery = `
          SELECT cp.amount, cp.method 
          FROM credit_payments cp
          JOIN credits c ON cp.creditId = c.id
          WHERE c.businessId = ? AND ${creditPaymentDateConstraint}
        `;
        const creditParams = [businessId, ...baseDateParams];

        db.all(creditQuery, creditParams, (creditErr, repayments) => {
          let cashRepayments = 0;
          let mpesaRepayments = 0;
          let bankRepayments = 0;

          if (!creditErr && repayments) {
            repayments.forEach(pay => {
              const amt = Number(pay.amount) || 0;
              const method = (pay.method || "").trim().toLowerCase();

              if (method === 'cash' && (activeFilter === 'all' || activeFilter.includes('cash'))) {
                cashRepayments += amt;
              } else if (method.includes('mpesa') && (activeFilter === 'all' || activeFilter.includes('mpesa'))) {
                mpesaRepayments += amt;
              } else if ((method.includes('bank') || method.includes('cheque') || method.includes('transfer')) && (activeFilter === 'all' || activeFilter.includes('bank'))) {
                bankRepayments += amt;
              }
            });
          }

          // Realized collections assignment based on view filter criteria
          let totalCollections = 0;
          if (activeFilter.includes('credit') || activeFilter.includes('deni')) {
            totalCollections = directCredit;
          } else if (activeFilter.includes('cash')) {
            totalCollections = directCash;
          } else if (activeFilter.includes('mpesa')) {
            totalCollections = directMpesa;
          } else if (activeFilter.includes('bank')) {
            totalCollections = directBank;
          } else {
            totalCollections = directCash + directMpesa + directBank;
          }
          
          const realizedRevenue = Math.max(0, gross - outstandingDebt);

          // 5️⃣ Query 4: 7-Day Trend Progress Map
          const dailyQuery = `
            SELECT 
              CASE strftime('%w', ${parsedSalesDate})
                WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue'
                WHEN '3' THEN 'Wed' WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri' 
                WHEN '6' THEN 'Sat'
              END as dayLabel,
              SUM(CAST(totalPrice AS REAL)) as dailyRevenue
            FROM sales
            WHERE businessId = ? AND ${parsedSalesDate} >= date('now', '+3 hours', '-6 days') AND ${paymentConstraint}
            GROUP BY dayLabel
          `;

          const dailyQueryParams = [businessId];
          if (paymentConstraint.includes('?')) dailyQueryParams.push(paymentMethod.trim().toLowerCase());

          db.all(dailyQuery, dailyQueryParams, (dailyErr, dailyRows) => {
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

            // 6️⃣ Query 5: Week-over-Week Evaluation
            const productivityQuery = `
              SELECT 
                SUM(CASE WHEN ${parsedSalesDate} >= date('now', '+3 hours', 'weekday 0', '-7 days') THEN CAST(totalPrice AS REAL) ELSE 0 END) as thisWeekRevenue,
                SUM(CASE WHEN ${parsedSalesDate} >= date('now', '+3 hours', 'weekday 0', '-14 days') AND ${parsedSalesDate} < date('now', '+3 hours', 'weekday 0', '-7 days') THEN CAST(totalPrice AS REAL) ELSE 0 END) as lastWeekRevenue
              FROM sales
              WHERE businessId = ? AND ${paymentConstraint}
            `;

            const prodQueryParams = [businessId];
            if (paymentConstraint.includes('?')) prodQueryParams.push(paymentMethod.trim().toLowerCase());

            db.get(productivityQuery, prodQueryParams, (prodErr, prodRow) => {
              const actualThisWeek = prodRow?.thisWeekRevenue || 0;
              const actualLastWeek = prodRow?.lastWeekRevenue || 0;

              res.json({
                trueGrossRevenue: gross,
                rangeProfit: cleanProfit,
                remainingActiveCredit: outstandingDebt, 
                trueRealizedRevenue: realizedRevenue,   
                
                finalCashTotal: directCash + cashRepayments,
                directCashSales: directCash,
                cashRepayments: cashRepayments,
                
                finalMpesaTotal: directMpesa + mpesaRepayments,
                directMpesaSales: directMpesa,
                creditInitialPaymentsCollected: 0, 
                mpesaRepayments: mpesaRepayments,
                
                finalBankTotal: directBank + bankRepayments,
                directBankSales: directBank,
                bankRepayments: bankRepayments,

                directCreditSales: directCredit,
                totalCollections: totalCollections,
                
                last7DaysProfits: cleanProfit,      
                avgDailyProfit: cleanProfit / 7,
                
                lastWeekProductivity: actualLastWeek,
                currentWeekProductivity: actualThisWeek,
                progressMap: progressMap
              });
            });
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Offline Backend Engine running locally on port ${PORT}`);
});