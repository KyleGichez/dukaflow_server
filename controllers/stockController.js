const db = require("../config/db");

// 1. Create Stock & Sync/Upsert to Product Table
exports.createStock = (req, res) => {
  const { category, name, quantityAdded, units, price } = req.body;
  const businessId = req.user.businessId; // From Auth Middleware
  const trimmedName = name.trim();
  const addedQty = Number(quantityAdded);
  const currentPrice = Number(price);
  const currentDate = new Date().toISOString();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Check if the product already exists inside this business workspace
    const checkProductSql = "SELECT id, quantity FROM products WHERE name = ? AND businessId = ?";
    db.get(checkProductSql, [trimmedName, businessId], (err, product) => {
      if (err) {
        db.run("ROLLBACK");
        return res.status(400).json({ message: err.message });
      }

      if (product) {
        // Product exists: Update its metrics and increment its balance quantity
        const updateProductSql = `
          UPDATE products 
          SET quantity = quantity + ?, category = ?, units = ?, price = ?
          WHERE id = ? AND businessId = ?
        `;
        db.run(updateProductSql, [addedQty, category, units, currentPrice, product.id, businessId], function (updateErr) {
          if (updateErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: updateErr.message });
          }
          insertStockEntry(product.id);
        });
      } else {
        // Product does not exist: Simulate an $setOnInsert / Upsert behavior by creating it
        const createProductSql = `
          INSERT INTO products (name, category, price, quantity, units, businessId)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(createProductSql, [trimmedName, category, currentPrice, addedQty, units, businessId], function (insertErr) {
          if (insertErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: insertErr.message });
          }
          insertStockEntry(this.lastID);
        });
      }

      // Inner helper to append the tracking entry row to your stocks logging table
      function insertStockEntry(productId) {
        const insertStockSql = `
          INSERT INTO stocks (product_id, name, category, quantityAdded, units, price, date, businessId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const stockParams = [productId, trimmedName, category, addedQty, units, currentPrice, currentDate, businessId];

        db.run(insertStockSql, stockParams, function (stockErr) {
          if (stockErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: stockErr.message });
          }

          db.run("COMMIT");
          res.status(201).json({
            id: this.lastID,
            product_id: productId,
            name: trimmedName,
            category,
            quantityAdded: addedQty,
            units,
            price: currentPrice,
            date: currentDate,
            businessId
          });
        });
      }
    });
  });
};

// 2. Get All Stock Log Entries for the workspace
exports.getStockItems = (req, res) => {
  const businessId = req.user.businessId;
  const sql = "SELECT * FROM stocks WHERE businessId = ?";

  db.all(sql, [businessId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    // Formats SQLite row identifiers to match MongoDB object schemas
    const formattedRows = rows.map(row => ({ ...row, _id: row.id }));
    res.json(formattedRows);
  });
};

// 3. Update Stock & Re-calculate Product Inventory Differences
exports.updateStock = (req, res) => {
  const businessId = req.user.businessId;
  const stockId = req.params.id;
  const { category, units } = req.body;
  const newQuantity = Number(req.body.quantityAdded);
  const newPrice = Number(req.body.price);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Fetch old record snapshot ensuring context safety
    const findOldStockSql = "SELECT product_id, name, quantityAdded FROM stocks WHERE id = ? AND businessId = ?";
    db.get(findOldStockSql, [stockId, businessId], (err, oldStock) => {
      if (err || !oldStock) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Stock not found in your workspace" });
      }

      // Compute incremental variance difference margin
      const quantityDifference = newQuantity - oldStock.quantityAdded;

      // Update baseline historical record metadata row
      const updateStockSql = `
        UPDATE stocks 
        SET category = ?, quantityAdded = ?, units = ?, price = ?
        WHERE id = ? AND businessId = ?
      `;
      db.run(updateStockSql, [category, newQuantity, units, newPrice, stockId, businessId], function (stockErr) {
        if (stockErr) {
          db.run("ROLLBACK");
          return res.status(400).json({ message: stockErr.message });
        }

        // Apply corresponding delta recalculations directly onto product levels
        const updateProductSql = `
          UPDATE products 
          SET quantity = quantity + ?, price = ?, category = ?, units = ?
          WHERE id = ? AND businessId = ?
        `;
        db.run(updateProductSql, [quantityDifference, newPrice, category, units, oldStock.product_id, businessId], function (productErr) {
          if (productErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: productErr.message });
          }

          db.run("COMMIT");
          res.json({
            id: stockId,
            product_id: oldStock.product_id,
            name: oldStock.name,
            category,
            quantityAdded: newQuantity,
            units,
            price: newPrice,
            businessId
          });
        });
      });
    });
  });
};

// 4. Delete Stock Entry & Deduct Balancing Totals From Inventory
exports.deleteStock = (req, res) => {
  const businessId = req.user.businessId;
  const stockId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Validate ownership visibility scopes
    const findStockSql = "SELECT product_id, quantityAdded FROM stocks WHERE id = ? AND businessId = ?";
    db.get(findStockSql, [stockId, businessId], (err, stockToDelete) => {
      if (err || !stockToDelete) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Stock not found" });
      }

      // Deduct balancing stock quantity from the related Product row
      const reduceProductSql = "UPDATE products SET quantity = quantity - ? WHERE id = ? AND businessId = ?";
      db.run(reduceProductSql, [stockToDelete.quantityAdded, stockToDelete.product_id, businessId], function (productErr) {
        if (productErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: productErr.message });
        }

        // Permanently erase the isolated ledger row
        const deleteStockSql = "DELETE FROM stocks WHERE id = ? AND businessId = ?";
        db.run(deleteStockSql, [stockId, businessId], function (deleteErr) {
          if (deleteErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: deleteErr.message });
          }

          db.run("COMMIT");
          res.json({ message: "Stock deleted and Product quantity updated" });
        });
      });
    });
  });
};