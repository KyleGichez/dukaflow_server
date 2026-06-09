const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Determine where to save the database file
// In production, save it to the user's local AppData folder so it isn't lost during updates
const isProd = process.env.NODE_ENV === "production";
const dbFolder = isProd
  ? path.join(process.env.APPDATA || process.env.HOME, "DukaFlow")
  : path.join(__dirname, "../");

if (!fs.existsSync(dbFolder)) {
  fs.mkdirSync(dbFolder, { recursive: true });
}

const dbPath = path.join(dbFolder, "pos_system.db");

// Connect to the SQLite Database file
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening SQLite database:", err.message);
  } else {
    console.log(`SQLite Connected safely at: ${dbPath}`);
    initializeTables();
  }
});

// Create tables automatically if they don't exist
function initializeTables() {
  db.serialize(() => {
    // CRITICAL FIX: Enable foreign keys inside SQLite runtime
    db.run("PRAGMA foreign_keys = ON");

    // ==========================================
    // 1. INDEPENDENT LAYER TABLES (No foreign dependencies)
    // ==========================================
    
    // Products Table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        units TEXT,
        businessId TEXT NOT NULL
      )
    `);

    // ==========================================
    // 2. WORKSPACE AND MANAGEMENT LAYER TABLES
    // ==========================================

    // Combined & Unified Businesses Table
    db.run(`
      CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessName TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        city TEXT,
        status TEXT DEFAULT 'active',
        subscriptionPlan TEXT DEFAULT 'trial',
        subscriptionEndsAt TEXT,
        trialEndsAt TEXT,
        ownerId INTEGER,
        lastTransactionId TEXT
      )
    `);

    // Core Users & Staff Table (Depends on businesses)
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
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE SET NULL
      )
    `);

    // Subscriptions Table (Depends on businesses)
    db.run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        businessId INTEGER NOT NULL,
        plan TEXT DEFAULT 'trial',
        status TEXT DEFAULT 'active',
        endDate TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (businessId) REFERENCES businesses(id) ON DELETE CASCADE
      )
    `);

    // ==========================================
    // 3. OPERATIONAL TRANSACTION LAYER TABLES
    // ==========================================

    // Stocks Table
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
        businessId TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Sales Table
    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        quantitySold INTEGER NOT NULL,
        unitPrice REAL NOT NULL,
        totalPrice REAL NOT NULL,
        paymentMethod TEXT NOT NULL,
        paymentStatus TEXT NOT NULL,
        balance REAL DEFAULT 0,
        date TEXT NOT NULL,
        businessId TEXT NOT NULL,
        soldBy TEXT NOT NULL,
        FOREIGN KEY (productId) REFERENCES products(id)
      )
    `);

    // Credits Table
    db.run(`
      CREATE TABLE IF NOT EXISTS credits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        saleId INTEGER NOT NULL,
        businessId TEXT NOT NULL,
        customerName TEXT NOT NULL,
        customerPhone TEXT,
        totalAmount REAL NOT NULL,
        amountPaid REAL DEFAULT 0,
        balance REAL NOT NULL,
        status TEXT NOT NULL,
        nextPaymentDate TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (productId) REFERENCES products(id),
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
      )
    `);

    // Credit Payments Table
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

  });
}

module.exports = db;