const db = require("../config/db");

// 1. Create Credit Ledger Row Document
exports.createCredit = (req, res) => {
  const businessId = req.user.businessId;
  const amountPaid = req.body.amountPaid || 0;
  const createdAt = new Date().toISOString();

  // Extract keys explicitly from req.body to map dynamically into SQL
  const { productId, saleId, customerName, customerPhone, totalAmount, balance, status, nextPaymentDate } = req.body;

  const sql = `
    INSERT INTO credits (productId, saleId, businessId, customerName, customerPhone, totalAmount, amountPaid, balance, status, nextPaymentDate, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [productId, saleId, businessId, customerName, customerPhone, totalAmount, amountPaid, balance, status, nextPaymentDate, createdAt];

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ message: "Failed to create credit record", error: err.message });
    }
    res.status(201).json({ id: this.lastID, ...req.body, businessId, amountPaid, createdAt });
  });
};

// 2. Get All Credits (Filtered by customer names or tracking statuses)
exports.getCredits = (req, res) => {
  const businessId = req.user.businessId;
  const { customerName, status } = req.query;

  let queryConditions = ["c.businessId = ?"];
  let queryParams = [businessId];

  if (customerName) {
    queryConditions.push("c.customerName = ?");
    queryParams.push(customerName);
  }
  if (status) {
    queryConditions.push("c.status = ?");
    queryParams.push(status);
  }

  // Uses relational JOIN operations to replicate Mongoose's .populate() functionality safely offline
  const sql = `
    SELECT c.*, p.name as productName, p.price as productPrice, s.totalPrice as saleTotalPrice, s.paymentMethod as salePaymentMethod
    FROM credits c
    LEFT JOIN products p ON c.productId = p.id
    LEFT JOIN sales s ON c.saleId = s.id
    WHERE ${queryConditions.join(" AND ")}
    ORDER BY c.createdAt DESC
  `;

  db.all(sql, queryParams, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Failed to fetch credits for this business", error: err.message });
    }

    // Map properties into nested object trees so your existing React code layout doesn't break
    const formattedCredits = rows.map(row => ({
      ...row,
      _id: row.id,
      productId: { _id: row.productId, name: row.productName, price: row.productPrice },
      saleId: { _id: row.saleId, totalPrice: row.saleTotalPrice, paymentMethod: row.salePaymentMethod }
    }));

    res.status(200).json(formattedCredits);
  });
};

// 3. Get Single Credit Object By ID
exports.getCreditById = (req, res) => {
  const businessId = req.user.businessId;
  const creditId = req.params.id;

  const sql = "SELECT * FROM credits WHERE id = ? AND businessId = ?";
  db.get(sql, [creditId, businessId], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ message: "Credit record not found or unauthorized" });
    }
    res.status(200).json({ ...row, _id: row.id });
  });
};

// 4. Update Credit Metadata Fields
exports.updateCredit = (req, res) => {
  const creditId = req.params.id;
  const fields = Object.keys(req.body);
  
  if (fields.length === 0) return res.status(400).json({ message: "No update parameters provided" });

  // Dynamically compile an execution query string matching whatever property fields React passed
  const sets = fields.map(field => `${field} = ?`).join(", ");
  const sql = `UPDATE credits SET ${sets} WHERE id = ?`;
  const params = [...fields.map(field => req.body[field]), creditId];

  db.run(sql, params, function (err) {
    if (err || this.changes === 0) {
      return res.status(404).json({ message: "Credit not found or update execution failed" });
    }
    res.status(200).json({ id: creditId, ...req.body });
  });
};

// 5. Add Repayment Log Entry (Strict validation, status changes, multi-table automated clears)
exports.addPayment = (req, res) => {
  const creditId = req.params.id;
  const { amount, nextPaymentDate, method } = req.body;
  const paymentAmount = Number(amount);

  if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ message: "Invalid payment amount" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const selectCreditSql = "SELECT * FROM credits WHERE id = ?";
    db.get(selectCreditSql, [creditId], (err, credit) => {
      if (err || !credit) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Credit record instance not found" });
      }

      const total = Number(credit.totalAmount || 0);
      const currentPaid = Number(credit.amountPaid || 0);
      const newPaid = currentPaid + paymentAmount;

      if (newPaid > total) {
        db.run("ROLLBACK");
        return res.status(400).json({ message: "Payment exceeds remaining balance" });
      }

      const newBalance = total - newPaid;
      const updatedStatus = newBalance <= 0 ? "PAID" : "PARTIAL";
      const paymentDate = new Date().toISOString();

      // Step A: Append entry tracking log row directly into the relational sub-table
      const insertPaymentSql = "INSERT INTO credit_payments (creditId, amount, method, date) VALUES (?, ?, ?, ?)";
      db.run(insertPaymentSql, [creditId, paymentAmount, method || "Cash", paymentDate], function (paymentErr) {
        if (paymentErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: "Failed to log database payment item line" });
        }

        // Step B: Update master credit ledger rows with calculations
        const updateCreditSql = `
          UPDATE credits 
          SET amountPaid = ?, balance = ?, nextPaymentDate = ?, status = ? 
          WHERE id = ?
        `;
        db.run(updateCreditSql, [newPaid, newBalance, nextPaymentDate || credit.nextPaymentDate, updatedStatus, creditId], function (creditUpdateErr) {
          if (creditUpdateErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: "Failed to calculate updated balance paths" });
          }

          // Step C: Sync changes instantly with related sale transaction status maps
          const updateSaleSql = "UPDATE sales SET balance = ?, paymentStatus = ? WHERE id = ?";
          db.run(updateSaleSql, [newBalance, newBalance <= 0 ? "Paid" : "Partial", credit.saleId], function (saleUpdateErr) {
            if (saleUpdateErr) {
              db.run("ROLLBACK");
              return res.status(500).json({ message: "Failed syncing updates to invoice lines" });
            }

            // Step D: Evaluate if customer cleared ALL outstanding debts across the store
            const checkAllDebtsSql = "SELECT id FROM credits WHERE customerName = ? AND customerPhone = ? AND balance > 0 AND id != ?";
            db.get(checkAllDebtsSql, [credit.customerName, credit.customerPhone, creditId], (debtErr, remainingDebt) => {
              
              // If another unpaid ledger entry is found OR this specific payment didn't clear the balance, skip massive wipe
              if (remainingDebt || newBalance > 0) {
                db.run("COMMIT");
                return res.status(200).json({ success: true, message: "Payment added successfully" });
              }

              // Customer is completely debt-free: Update ALL their historical credits and sales to PAID natively
              const updateAllCreditsSql = "UPDATE credits SET status = 'PAID', balance = 0 WHERE customerName = ? AND customerPhone = ?";
              db.run(updateAllCreditsSql, [credit.customerName, credit.customerPhone], function () {
                
                const updateAllSalesSql = `
                  UPDATE sales SET paymentStatus = 'Paid', balance = 0 
                  WHERE id IN (SELECT saleId FROM credits WHERE customerName = ? AND customerPhone = ?)
                `;
                db.run(updateAllSalesSql, [credit.customerName, credit.customerPhone], function () {
                  db.run("COMMIT");
                  res.status(200).json({ success: true, message: "Credit fully cleared successfully" });
                });
              });
            });
          });
        });
      });
    });
  });
};

// 6. Delete Credit Line Entirely
exports.deleteCredit = (req, res) => {
  const sql = "DELETE FROM credits WHERE id = ?";
  db.run(sql, [req.params.id], function (err) {
    if (err || this.changes === 0) {
      return res.status(404).json({ message: "Credit item not found or failed to erase" });
    }
    res.status(200).json({ message: "Credit deleted successfully" });
  });
};

// 7. Fetch Unified Offline Repayments History Reports
exports.getCreditPayments = (req, res) => {
  const { range } = req.query;
  
  let dateConstraint = "date(cp.date) <= date('now', 'localtime')";
  
  if (range === "this-week") {
    dateConstraint += " AND date(cp.date) >= date('now', '-7 days')";
  } else if (range === "this-month") {
    dateConstraint += " AND date(cp.date) >= date('now', '-1 month')";
  } else if (range === "today") {
    dateConstraint += " AND date(cp.date) = date('now', 'localtime')";
  } // 'all-time' omits filters and returns all records

  const sql = `
    SELECT cp.*, c.customerName, c.customerPhone
    FROM credit_payments cp
    LEFT JOIN credits c ON cp.creditId = c.id
    WHERE ${dateConstraint}
    ORDER BY cp.date DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Server error fetching repayments history", error: err.message });
    }

    // Structure properties into an object mapping layout mimicking your MongoDB shape
    const formattedPayments = rows.map(row => ({
      _id: row.id,
      amount: row.amount,
      method: row.method,
      date: row.date,
      customerId: { name: row.customerName, phone: row.customerPhone }
    }));

    res.status(200).json(formattedPayments);
  });
};