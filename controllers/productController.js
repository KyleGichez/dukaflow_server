const db = require("../config/db"); // Path to your SQLite db configuration file

// 1. Create Product & Initial Stock Entry
exports.createProduct = (req, res) => {
  const { name, category, price, buyingPrice, quantity, units } = req.body;
  const businessId = req.user.businessId; // Extracted from your JWT middleware
  const trimmedName = name.trim();

  const userRole = (req.user.role || req.user.Role || "").toLowerCase().replace("_", "");

  // 💡 THE CRITICAL FIX: Bypass subscription checks if it's a super_admin
  if (userRole !== 'superadmin') {
    // Your existing database call evaluating business subscriptions:
    // db.get("SELECT status FROM subscriptions WHERE businessId = ?", [businessId], ...)
    
    // Ensure that if a business lookup returns undefined, it safely returns an error instead of breaking:
    if (!businessId) {
      return res.status(400).json({ message: "This staff account is not assigned to an active business workspace." });
    }
  }

  // Run as a transaction so if creating stock history fails, the product creation rolls back
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const insertProductSql = `
      INSERT INTO products (name, category, buying_price, price, quantity, units, businessId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const productParams = [trimmedName, category, buyingPrice, price, quantity, units, businessId];

    db.run(insertProductSql, productParams, function (err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(400).json({ message: err.message });
      }

      const newProductId = this.lastID; // SQLite automatically provides the generated ID
      const currentDate = new Date().toISOString();

      const insertStockSql = `
        INSERT INTO stocks (product_id, name, category, quantityAdded, units, buying_price, price, date, businessId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const stockParams = [newProductId, trimmedName, category, quantity, units, buyingPrice, price, currentDate, businessId];

      db.run(insertStockSql, stockParams, function (stockErr) {
        if (stockErr) {
          db.run("ROLLBACK");
          return res.status(400).json({ message: stockErr.message });
        }

        db.run("COMMIT");

        // Return a mock object matching your original MongoDB return structure
        res.status(201).json({
          id: newProductId,
          name: trimmedName,
          category,
          buyingPrice: buyingPrice,
          price,
          quantity,
          units,
          businessId
        });
      });
    });
  });
};

// 2. Get All Products (Scoped to businessId)
exports.getProducts = (req, res) => {
  const businessId = req.user.businessId;
  
  // 🌟 FIXED: Aliased buying_price to buyingPrice so the array maps cleanly to the frontend table state
  const sql = `
    SELECT id, name, category, price, quantity, units, businessId, 
           buying_price AS buyingPrice 
    FROM products 
    WHERE businessId = ?
  `;

  db.all(sql, [businessId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    res.json(rows);
  });
};

// 3. Update Product & Append Stock History Log Record
exports.updateProduct = (req, res) => {
  const { name, category, price, buyingPrice, quantity, units } = req.body;
  const businessId = req.user.businessId;
  const productId = req.params.id; 
  const trimmedName = name.trim();
  const newTotal = Number(quantity);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Check if the product exists and belongs to this business
    const checkSql = "SELECT id FROM products WHERE id = ? AND businessId = ?";
    db.get(checkSql, [productId, businessId], (err, row) => {
      if (err || !row) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Product not found in your workspace" });
      }

      // Update Product record
      const updateProductSql = `
        UPDATE products 
        SET name = ?, category = ?, buying_price = ?, price = ?, quantity = ?, units = ?
        WHERE id = ? AND businessId = ?
      `;
      const productParams = [trimmedName, category, buyingPrice, price, newTotal, units, productId, businessId];

      db.run(updateProductSql, productParams, function (updateErr) {
        if (updateErr) {
          db.run("ROLLBACK");
          return res.status(400).json({ message: updateErr.message });
        }

        // 📝 FIX HERE: Insert a clean new stock movement/history log entry 
        // instead of a conflicting ON CONFLICT upsert.
        const currentDate = new Date().toISOString();
        const insertStockSql = `
          INSERT INTO stocks (product_id, name, category, quantityAdded, units, price, buying_price, date, businessId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const stockParams = [productId, trimmedName, category, newTotal, units, price, buyingPrice, currentDate, businessId];

        db.run(insertStockSql, stockParams, function (stockErr) {
          if (stockErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: stockErr.message });
          }

          db.run("COMMIT");

          // Return structured data object matching frontend expectations
          res.json({
            id: Number(productId), // Cast to number for local SQLite compliance
            name: trimmedName,
            category,
            buyingPrice: buyingPrice,
            price,
            quantity: newTotal,
            units,
            businessId
          });
        });
      });
    });
  });
};

// 4. Delete Product & All Stock History
exports.deleteProduct = (req, res) => {
  const businessId = req.user.businessId;
  const productId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Verify ownership before executing deletion strings
    const checkSql = "SELECT id FROM products WHERE id = ? AND businessId = ?";
    db.get(checkSql, [productId, businessId], (err, row) => {
      if (err || !row) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Product not found" });
      }

      // Delete stock history matching this product and workspace
      const deleteStockSql = "DELETE FROM stocks WHERE product_id = ? AND businessId = ?";
      db.run(deleteStockSql, [productId, businessId], function (stockErr) {
        if (stockErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: stockErr.message });
        }

        // Delete the main product listing
        const deleteProductSql = "DELETE FROM products WHERE id = ? AND businessId = ?";
        db.run(deleteProductSql, [productId, businessId], function (productErr) {
          if (productErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: productErr.message });
          }

          db.run("COMMIT");
          res.json({ message: "Product and all related stock history deleted" });
        });
      });
    });
  });
};