const db = require("../config/db");

function getDateFilterConstraint(range) {
  switch (range) {
    case "today":
      return "date(date) = date('now', 'localtime')";
    case "this-week":
      return "date(date) >= date('now', '-7 days')";
    case "this-month":
      return "date(date) >= date('now', '-1 month')";
    case "all-time":
    default:
      return "1=1";
  }
}

// 1. Create Sale (Captures snapshot buying price for accurate profit margins)
exports.createSale = (req, res) => {
  const {
    items,
    paymentMethod,
    date,
    customerName,
    customerPhone,
    amountPaid,
    nextPaymentDate,
  } = req.body;
  const businessId = req.user.businessId;
  const userId = req.user?.id || req.user?._id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Your customer shopping basket is empty" });
  }

  const saleDate = date || new Date().toISOString();
  const processedSalesIds = [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    let itemIndex = 0;

    function processNextItem() {
      if (itemIndex >= items.length) {
        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: commitErr.message });
          }
          fetchAndReturnSales();
        });
        return;
      }

      const item = items[itemIndex];
      const { productId, quantitySold } = item;

      // 1. Get current item snapshots including its active buying_price cost layer
      const checkProductSql = "SELECT name, price, buying_price, quantity FROM products WHERE id = ? AND businessId = ?";
      db.get(checkProductSql, [productId, businessId], (err, product) => {
        if (err || !product) {
          db.run("ROLLBACK");
          return res.status(400).json({ message: `Product with ID ${productId} was not found.` });
        }

        if (product.quantity < Number(quantitySold)) {
          db.run("ROLLBACK");
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Only ${product.quantity} items remaining.` 
          });
        }

        const totalPrice = product.price * Number(quantitySold);
        const currentBuyingPrice = product.buying_price || 0; // Fallback safeguarding 
        let assignedStatus = "Paid";
        let initialBalance = 0;

        if (paymentMethod === "Credit") {
          const parsedPaid = Number(amountPaid || 0);
          initialBalance = totalPrice - parsedPaid;
          assignedStatus = initialBalance <= 0 ? "Paid" : parsedPaid > 0 ? "Partial" : "Pending";
        }

        // 2. Log historical ledger entry along with cached core costing metrics
        const insertSaleSql = `
          INSERT INTO sales (productId, quantitySold, buyingPrice, unitPrice, totalPrice, paymentMethod, paymentStatus, balance, date, businessId, soldBy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const saleParams = [
          productId, 
          Number(quantitySold), 
          currentBuyingPrice, // Save exact snapshot cost configuration
          product.price, 
          totalPrice, 
          paymentMethod, 
          assignedStatus, 
          initialBalance, 
          saleDate, 
          businessId, 
          userId
        ];

        db.run(insertSaleSql, saleParams, function (saleErr) {
          if (saleErr) {
            db.run("ROLLBACK");
            return res.status(400).json({ message: saleErr.message });
          }

          const newSaleId = this.lastID;
          processedSalesIds.push(newSaleId);

          if (paymentMethod === "Credit") {
            const insertCreditSql = `
              INSERT INTO credits (productId, saleId, businessId, customerName, customerPhone, totalAmount, amountPaid, balance, status, nextPaymentDate, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const creditStatus = assignedStatus.toUpperCase();
            const creditParams = [productId, newSaleId, businessId, customerName, customerPhone, totalPrice, Number(amountPaid || 0), initialBalance, creditStatus, nextPaymentDate || null, new Date().toISOString()];

            db.run(insertCreditSql, creditParams, function (creditErr) {
              if (creditErr) {
                db.run("ROLLBACK");
                return res.status(400).json({ message: creditErr.message });
              }
              updateStockAndContinue();
            });
          } else {
            updateStockAndContinue();
          }

          function updateStockAndContinue() {
            const updateStockSql = "UPDATE products SET quantity = quantity - ? WHERE id = ? AND businessId = ?";
            db.run(updateStockSql, [Number(quantitySold), productId, businessId], (stockErr) => {
              if (stockErr) {
                db.run("ROLLBACK");
                return res.status(400).json({ message: stockErr.message });
              }
              itemIndex++;
              processNextItem();
            });
          }
        });
      });
    }

    function fetchAndReturnSales() {
      const placeholders = processedSalesIds.map(() => "?").join(",");
      const fetchSql = `
        SELECT s.*, p.name as productName, p.price as productPrice, p.buying_price as productBuyingPrice, u.fname as userFname, u.role as userRole
        FROM sales s
        LEFT JOIN products p ON s.productId = p.id
        LEFT JOIN users u ON s.soldBy = u.id
        WHERE s.id IN (${placeholders})
        ORDER BY s.id DESC
      `;

      db.all(fetchSql, processedSalesIds, (fetchErr, rows) => {
        if (fetchErr) {
          return res.status(400).json({ message: fetchErr.message });
        }

        const formattedSales = rows.map(row => ({
          ...row,
          _id: row.id,
          productId: { _id: row.productId, name: row.productName, price: row.productPrice, buyingPrice: row.buyingPrice || row.productBuyingPrice },
          soldBy: { fname: row.userFname, role: row.userRole }
        }));

        res.status(201).json({ success: true, sales: formattedSales });
      });
    }

    processNextItem();
  });
};

// 2. Get Sales History
exports.getSales = (req, res) => {
  const businessId = req.user.businessId;
  const { range, startDate, endDate, paymentMethod } = req.query;

  let queryConditions = ["s.businessId = ?"];
  let queryParams = [businessId];

  if (startDate && endDate) {
    queryConditions.push("date(s.date) BETWEEN date(?) AND date(?)");
    queryParams.push(startDate, endDate + "T23:59:59");
  } else {
    queryConditions.push(getDateFilterConstraint(range));
  }

  if (paymentMethod && paymentMethod !== "All") {
    queryConditions.push("s.paymentMethod = ?");
    queryParams.push(paymentMethod);
  }

  const sql = `
    SELECT s.*, p.name as productName, p.price as productPrice, p.buying_price as productBuyingPrice, u.fname as userFname, u.role as userRole
    FROM sales s
    LEFT JOIN products p ON s.productId = p.id
    LEFT JOIN users u ON s.soldBy = u.id
    WHERE ${queryConditions.join(" AND ")}
    ORDER BY s.date DESC
  `;

  db.all(sql, queryParams, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }

    const formattedSales = rows.map(row => ({
      ...row,
      _id: row.id,
      productId: { _id: row.productId, name: row.productName, price: row.productPrice, buyingPrice: row.buyingPrice || row.productBuyingPrice },
      soldBy: { fname: row.userFname, role: row.userRole }
    }));

    res.json(formattedSales);
  });
};

// 3. Delete Sale
exports.deleteSale = (req, res) => {
  const businessId = req.user.businessId;
  const saleId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const findSaleSql = "SELECT productId, quantitySold FROM sales WHERE id = ? AND businessId = ?";
    db.get(findSaleSql, [saleId, businessId], (err, sale) => {
      if (err || !sale) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Sale not found" });
      }

      const restoreStockSql = "UPDATE products SET quantity = quantity + ? WHERE id = ? AND businessId = ?";
      db.run(restoreStockSql, [sale.quantitySold, sale.productId, businessId], (stockErr) => {
        if (stockErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: stockErr.message });
        }

        const deleteSaleSql = "DELETE FROM sales WHERE id = ? AND businessId = ?";
        db.run(deleteSaleSql, [saleId, businessId], (deleteErr) => {
          if (deleteErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: deleteErr.message });
          }

          db.run("COMMIT");
          res.json({ message: "Sale deleted and stock restored" });
        });
      });
    });
  });
};

// 4. Get Dashboard Analytical Summary (Computes true profit vectors)
exports.getSalesSummary = (req, res) => {
  const businessId = req.user.businessId;
  const { range, startDate, endDate, paymentMethod } = req.query;

  let salesFilterConditions = ["businessId = ?"];
  let salesFilterParams = [businessId];

  if (startDate && endDate) {
    salesFilterConditions.push("date(date) BETWEEN date(?) AND date(?)");
    salesFilterParams.push(startDate, endDate + "T23:59:59");
  } else {
    salesFilterConditions.push(getDateFilterConstraint(range));
  }

  if (paymentMethod && paymentMethod !== "All") {
    salesFilterConditions.push("paymentMethod = ?");
    salesFilterParams.push(paymentMethod);
  }

  // Modified to cleanly pull total volume revenue along with net manufacturing/wholesale acquisition cost
  const salesQuery = `
    SELECT 
      SUM(totalPrice) as totalRevenue,
      SUM(quantitySold) as totalItemsSold,
      SUM(quantitySold * COALESCE(buyingPrice, 0)) as totalCostOfGoods,
      COUNT(id) as totalTransactions
    FROM sales
    WHERE ${salesFilterConditions.join(" AND ")}
  `;

  db.get(salesQuery, salesFilterParams, (err, mainStats) => {
    if (err) return res.status(500).json({ message: err.message });

    const breakdownQuery = `
      SELECT paymentMethod, SUM(totalPrice) as amount
      FROM sales
      WHERE ${salesFilterConditions.join(" AND ")}
      GROUP BY paymentMethod
    `;

    db.all(breakdownQuery, salesFilterParams, (breakdownErr, breakdownRows) => {
      if (breakdownErr) return res.status(500).json({ message: breakdownErr.message });

      const paymentBreakdown = {};
      breakdownRows.forEach(row => {
        if (row.paymentMethod) paymentBreakdown[row.paymentMethod] = row.amount;
      });

      // Calculate stock val, credits, and historical 7-day profit boundaries
      const summaryMetricsQuery = `
        SELECT 
          (SELECT COALESCE(SUM(totalPrice), 0) FROM sales WHERE businessId = ? AND date(date) >= date('now', '-7 days')) as revenue7Days,
          (SELECT COALESCE(SUM(quantitySold * COALESCE(buyingPrice, 0)), 0) FROM sales WHERE businessId = ? AND date(date) >= date('now', '-7 days')) as cost7Days,
          (SELECT COALESCE(SUM(balance), 0) FROM credits WHERE businessId = ?) as outstandingCredits,
          (SELECT COALESCE(SUM(buying_price * quantity), 0) FROM products WHERE businessId = ?) as totalStockValue
      `;

      db.get(summaryMetricsQuery, [businessId, businessId, businessId, businessId], (summaryErr, metrics) => {
        if (summaryErr) return res.status(500).json({ message: summaryErr.message });

        const revenue7Days = metrics.revenue7Days || 0;
        const cost7Days = metrics.cost7Days || 0;
        const profit7Days = revenue7Days - cost7Days; // DukaFlow real-time calculated profit margins
        
        const totalRevenue = mainStats.totalRevenue || 0;
        const totalCostOfGoods = mainStats.totalCostOfGoods || 0;
        const calculatedRangeProfit = totalRevenue - totalCostOfGoods; // Profit value specifically for current chosen date ranges

        res.json({
          totalRevenue,
          totalItemsSold: mainStats.totalItemsSold || 0,
          totalTransactions: mainStats.totalTransactions || 0,
          totalStockValue: metrics.totalStockValue || 0, 
          profit7Days: profit7Days || 0,
          avgDailyProfit: Math.round(profit7Days / 7),
          rangeProfit: calculatedRangeProfit || 0, // 🆕 Expose specific search range profits to frontend components
          activeCredits: metrics.outstandingCredits || 0,
          paymentBreakdown,
        });
      });
    });
  });
};