const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../pos_system.db");
console.log(`[SQLite Target] Binding engine instance to: ${dbPath}`);

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

    // LAYER 1: BASE INDEPENDENT TABLES
    db.run(`
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
        lastTransactionId TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        businessId INTEGER NOT NULL 
      )
    `);

    db.run(`
      INSERT OR IGNORE INTO businesses (id, businessName, phone, city, status, subscriptionPlan) 
      VALUES (1, 'Default Retailer Headquarters', '+254 700 000000', 'Nairobi, Kenya', 'active', 'lifetime')
    `);

    // LAYER 2: DEPENDENT RELATION TABLES
    db.run(`
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
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, 
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE SET NULL
      )
    `);

    db.run(`
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER NOT NULL,
        plan TEXT DEFAULT 'trial',
        status TEXT DEFAULT 'active',
        endDate TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS business_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER UNIQUE NOT NULL,
        totalCreditSales REAL DEFAULT 0,
        currentCreditBalance REAL DEFAULT 0,
        updatedAt TEXT,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      )
    `);

    // LAYER 3: INVOICE ENGINE CORE
    db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceNumber TEXT UNIQUE NOT NULL,
        customerId INTEGER, 
        customerName TEXT NOT NULL DEFAULT 'Walk-in Customer',
        totalAmount REAL NOT NULL,
        amountPaid REAL DEFAULT 0.00,
        balance REAL NOT NULL,
        status TEXT DEFAULT 'UNPAID',
        dueDate TEXT DEFAULT 'Immediate Settlement',
        soldBy INTEGER,
        businessId INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        reference TEXT,
        paymentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    // LAYER 4: OPERATIONAL FLAT TRANSACTION LEDGERS
    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER, 
        productId INTEGER NOT NULL,
        quantitySold INTEGER NOT NULL,
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
      )
    `);

    db.run(`
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
        nextPaymentDate TEXT,
        createdAt TEXT,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS credit_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creditId INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT DEFAULT 'Cash',
        date TEXT NOT NULL,
        FOREIGN KEY (creditId) REFERENCES credits(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        quantityAdded INTEGER NOT NULL,
        units TEXT,
        price REAL NOT NULL,
        date TEXT NOT NULL,
        businessId INTEGER NOT NULL, 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // MIGRATIONS
    db.run("ALTER TABLE sales ADD COLUMN paymentReference TEXT;", () => {});
    db.run("ALTER TABLE sales ADD COLUMN bankingDetails TEXT;", () => {});
    db.run("ALTER TABLE credit_payments ADD COLUMN paymentReference TEXT;", () => {});
    db.run("ALTER TABLE credit_payments ADD COLUMN bankingDetails TEXT;", () => {});
    db.run("ALTER TABLE invoices ADD COLUMN soldBy INTEGER;", () => {});
    db.run("ALTER TABLE credits ADD COLUMN customerId INTEGER;", () => {});

    // 🌟 THE CRITICAL FIX: Run the user checking inside serialization step
    // This forces SQLite to finish executing all previous steps before executing this block.
    db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'", (err, row) => {
      if (err) {
        console.error("❌ Error checking for admin existence:", err.message);
      } else if (row.count === 0) {
        console.log("ℹ️ No admin user found. Seeding default super-admin...");
        
        // Replace with your preferred default credentials
        db.run(`
          INSERT INTO users (fname, lname, email, password, role, businessId)
          VALUES ('Super', 'Admin', 'admin@dukaflow.com', 'your_secure_hashed_password', 'admin', 1)
        `, (insertErr) => {
          if (insertErr) console.error("❌ Failed to seed default admin:", insertErr.message);
          else console.log("✅ Default super-admin seeded successfully.");
        });
      } else {
        console.log("✅ Admin user verification check completed safely.");
      }
    });

  });
}

module.exports = db;