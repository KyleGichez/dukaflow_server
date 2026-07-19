const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const os = require("os");

let dbPath;

// Check if running inside an Electron environment
if (process.versions.electron) {
  // Define your app name exactly how it's named in your Electron package.json
  const APP_NAME = "DukaFlow";

  // Replicate Electron's app.getPath("userData") using native Node.js
  if (process.platform === "win32") {
    // Windows: C:\Users\Name\AppData\Roaming\DukaFlow\pos_system.db
    dbPath = path.join(process.env.APPDATA, APP_NAME, "pos_system.db");
  } else if (process.platform === "darwin") {
    // Mac: /Users/Name/Library/Application Support/DukaFlow/pos_system.db
    dbPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      APP_NAME,
      "pos_system.db"
    );
  } else {
    // Linux: /home/Name/.config/DukaFlow/pos_system.db
    dbPath = path.join(os.homedir(), ".config", APP_NAME, "pos_system.db");
  }
} else {
  // Fallback for standard Node/Render cloud development
  dbPath = path.join(__dirname, "../pos_system.db");
}

console.log(`[SQLite Target] Binding engine instance to: ${dbPath}`);

// Optional: Ensure the directory exists before SQLite tries to create the file
const fs = require("fs");
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
  } else {
    console.log(`SQLite Connected safely at: ${dbPath}`);
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    console.log("🛠️  Creating database schema tables sequentially...");

    // 1. Run the core schema creation
    db.exec(
      `
      CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessName TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        city TEXT,
        status TEXT DEFAULT 'active',
        subscriptionPlan TEXT DEFAULT 'trial',
        subscriptionEndsAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        trialEndsAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        ownerId INTEGER,
        lastTransactionId TEXT,
        mpesa_shortcode TEXT,
        mpesa_consumer_key TEXT,
        mpesa_consumer_secret TEXT,
        mpesa_passkey TEXT,
        etims_taxpayer_pin TEXT,
        etims_api_key TEXT,
        etims_branch_code TEXT
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        businessId INTEGER NOT NULL, 
        units TEXT,
        buying_price REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fname TEXT NOT NULL,
        lname TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        city TEXT DEFAULT 'Default',
        role TEXT DEFAULT 'cashier',
        themePreference TEXT DEFAULT 'light',
        businessId INTEGER,
        businessName TEXT,
        storeLocation TEXT,
        poBox TEXT,
        taxPin TEXT,
        receiptDescription TEXT,
        lowStockThreshold INTEGER DEFAULT 5,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, 
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        creditLimit REAL DEFAULT 50000.00,
        currentDebt REAL DEFAULT 0.00,
        businessId INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER NOT NULL,
        plan TEXT DEFAULT 'trial',
        status TEXT DEFAULT 'active',
        endDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS business_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER UNIQUE NOT NULL,
        totalCreditSales REAL DEFAULT 0,
        currentCreditBalance REAL DEFAULT 0,
        updatedAt TEXT,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT NOT NULL,
        businessId INTEGER NOT NULL,
        totalAmount REAL NOT NULL,
        amountPaid REAL DEFAULT 0.00,
        balance REAL NOT NULL,
        status TEXT DEFAULT 'UNPAID',
        dueDate TEXT,
        soldBy INTEGER,
        customerId INTEGER,
        customerName TEXT NOT NULL DEFAULT 'Walk-in Customer',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL,
        UNIQUE(invoiceNumber, businessId)
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invoice_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        reference TEXT,
        paymentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER, 
        productId INTEGER NOT NULL,
        quantitySold INTEGER NOT NULL,
        buyingPrice REAL DEFAULT 0,
        unitPrice REAL NOT NULL,
        totalPrice REAL NOT NULL,
        paymentMethod TEXT,
        paymentStatus TEXT,
        balance REAL DEFAULT 0,
        date TEXT,
        businessId INTEGER NOT NULL,
        soldBy INTEGER,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER, 
        productId INTEGER NOT NULL,
        saleId INTEGER NOT NULL,
        businessId INTEGER NOT NULL,
        customerName TEXT NOT NULL,
        customerPhone TEXT,
        totalAmount REAL NOT NULL,
        amountPaid REAL DEFAULT 0,
        balance REAL NOT NULL,
        status TEXT DEFAULT 'PENDING',
        dueDate TEXT,
        nextPaymentDate TEXT,
        createdAt TEXT,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credit_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creditId INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT DEFAULT 'Cash',
        date TEXT NOT NULL,
        FOREIGN KEY (creditId) REFERENCES credits(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        quantityAdded INTEGER NOT NULL,
        units TEXT,
        buying_price REAL DEFAULT 0,
        price REAL NOT NULL,
        date TEXT NOT NULL,
        businessId INTEGER NOT NULL, 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invoice_sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER UNIQUE NOT NULL,
        prefix TEXT NOT NULL DEFAULT 'INV',
        next_value INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      );
      `,
      (err) => {
        if (err) {
          console.error("❌ Schema structural build error:", err.message);
          return;
        }

        console.log("✅ All base tables created smoothly.");

        // 2. Wrap all secondary data queries inside a secondary serialize block ONLY after tables are ready!
        db.serialize(() => {
          // Ensure Headquarter Business Exists
          db.run(`
            INSERT OR IGNORE INTO businesses (id, businessName, phone, city, status, subscriptionPlan) 
            VALUES (1, 'Default Retailer Headquarters', '+254 700 000000', 'Nairobi, Kenya', 'active', 'lifetime')
          `);

          // 🌟 LIVE PATCH: Migrates old installation databases to support your analytics engine
          db.run("ALTER TABLE sales ADD COLUMN buyingPrice REAL DEFAULT 0;", (err) => {
            if (!err) console.log("✨ Successfully patched older database with 'buyingPrice' column.");
          });

          // Run column additions safely
          db.run("ALTER TABLE sales ADD COLUMN paymentReference TEXT;", () => {});
          db.run("ALTER TABLE sales ADD COLUMN bankingDetails TEXT;", () => {});
          db.run("ALTER TABLE credit_payments ADD COLUMN paymentReference TEXT;", () => {});
          db.run("ALTER TABLE credit_payments ADD COLUMN bankingDetails TEXT;", () => {});
          db.run("ALTER TABLE invoices ADD COLUMN soldBy INTEGER;", () => {});
          db.run("ALTER TABLE credits ADD COLUMN customerId INTEGER;", () => {});

          // Reset sales item balances safely
          db.run(
            `
            UPDATE sales 
            SET balance = 0 
            WHERE invoiceId IN (
              SELECT id FROM invoices WHERE UPPER(status) != 'PAID'
            )
            `,
            (err) => {
              if (err) {
                console.error("⚠️ Data cleanup bypass notice:", err.message);
              } else {
                console.log("🎉 Multi-item line ledger balanced safely! Analytics tracking cleared.");
              }
            }
          );

          db.run(`CREATE TABLE IF NOT EXISTS users (...);`, (err) => {
            if (!err) {
              console.log("✅ All base tables created smoothly.");
              
              // 2. 💡 AUTOMATIC SEED: Run the seed check right here!
              // This ensures that if the AppData database is empty, it populates itself on launch.
              seedAdmin(); 
            }
          });

          // Now safely look for your admin accounts
          db.get(
            "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'",
            (checkErr, row) => {
              if (checkErr) {
                console.error("❌ Error checking for admin existence:", checkErr.message);
              } else if (row && row.count === 0) {
                console.log("ℹ️ No admin user found inside the server configuration check.");
              } else {
                console.log("✅ Admin configuration verification checked safely.");
              }
            }
          );
        });
      }
    );
  });
}
module.exports = db;
