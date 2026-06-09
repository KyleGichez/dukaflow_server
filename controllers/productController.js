const db = require("../config/db"); // Path to your SQLite db configuration file

// 1. Create Product & Initial Stock Entry
exports.createProduct = (req, res) => {
  const { name, category, price, quantity, units } = req.body;
  const businessId = req.user.businessId; // Extracted from your JWT middleware
  const trimmedName = name.trim();

  // Run as a transaction so if creating stock history fails, the product creation rolls back
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const insertProductSql = `
      INSERT INTO products (name, category, price, quantity, units, businessId)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const productParams = [trimmedName, category, price, quantity, units, businessId];

    db.run(insertProductSql, productParams, function (err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(400).json({ message: err.message });
      }

      const newProductId = this.lastID; // SQLite automatically provides the generated ID
      const currentDate = new Date().toISOString();

      const insertStockSql = `
        INSERT INTO stocks (product_id, name, category, quantityAdded, units, price, date, businessId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const stockParams = [newProductId, trimmedName, category, quantity, units, price, currentDate, businessId];

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
  const sql = "SELECT * FROM products WHERE businessId = ?";

  db.all(sql, [businessId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    res.json(rows);
  });
};

// 3. Update Product & Update Stock Record
exports.updateProduct = (req, res) => {
  const { name, category, price, quantity, units } = req.body;
  const businessId = req.user.businessId;
  const productId = req.params.id; // Typically a numeric string now, e.g., "12"
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
        SET name = ?, category = ?, price = ?, quantity = ?, units = ?
        WHERE id = ? AND businessId = ?
      `;
      const productParams = [trimmedName, category, price, newTotal, units, productId, businessId];

      db.run(updateProductSql, productParams, function (updateErr) {
        if (updateErr) {
          db.run("ROLLBACK");
          return res.status(400).json({ message: updateErr.message });
        }

        // SQLite Upsert logic for Stock update (updates if exists, creates if missing)
        const currentDate = new Date().toISOString();
        const updateStockSql = `
          INSERT INTO stocks (product_id, name, category, quantityAdded, units, price, date, businessId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            price = excluded.price,
            units = excluded.units,
            quantityAdded = excluded.quantityAdded,
            date = excluded.date
        `;
        const stockParams = [productId, trimmedName, category, newTotal, units, price, currentDate, businessId];

        db.run(updateStockSql, stockParams, function (stockErr) {
          if (stockErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: stockErr.message });
          }

          db.run("COMMIT");

          res.json({
            id: productId,
            name: trimmedName,
            category,
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