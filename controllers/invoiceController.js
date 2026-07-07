const db = require("../config/db");

exports.createInvoice = (req, res) => {
  console.log("🔥 CREATE INVOICE CONTROLLER HIT - MULTI-ITEM BALANCING FIX");
  const businessId = req.user?.businessId;
  const soldBy = req.user?.id || null;

  if (!businessId) {
    return res.status(401).json({ message: "Unauthorized: Missing tenant business context." });
  }

  const {
    customerId,
    customerName,
    totalAmount,
    amountPaid,
    status,
    items,
    dueDate,
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ message: "Cannot checkout with an empty cart." });
  }

  const parsedTotal = Number(totalAmount || 0);
  const parsedPaid = Number(amountPaid || 0);
  const balance = parsedTotal - parsedPaid;

  const createdAt = new Date().toISOString();
  const finalizedCustomerName = customerName || "Walk-in Customer";
  const finalizedDueDate = dueDate || "Immediate Settlement";

  db.get(
    `SELECT phone, email FROM customers WHERE id = ? AND businessId = ?`,
    [customerId, businessId],
    (customerErr, customerRow) => {
      if (customerErr) {
        return res.status(500).json({ message: "Database error checking customer profile." });
      }

      const customerPhone = customerRow?.phone || null;

      // Use serialize to ensure database steps run in strict sequence
      db.serialize(async () => {
        
        const executeQuery = (sql, params = []) => {
          return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
              if (err) return reject(err);
              resolve(this);
            });
          });
        };

        const fetchRow = (sql, params = []) => {
          return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
              if (err) return reject(err);
              resolve(row);
            });
          });
        };

        try {
          await executeQuery("BEGIN TRANSACTION");

          // 1️⃣ DYNAMIC SEQUENTIAL INVOICE NUMBER GENERATION
          await executeQuery(
            `INSERT OR IGNORE INTO invoice_sequences (businessId, prefix, next_value) VALUES (?, 'INV', 1)`,
            [businessId]
          );

          const seqRow = await fetchRow(
            `SELECT next_value FROM invoice_sequences WHERE businessId = ? AND prefix = 'INV'`,
            [businessId]
          );
          
          const nextVal = seqRow ? seqRow.next_value : 1;
          const invoiceNumber = `INV-${String(nextVal).padStart(4, '0')}`;

          await executeQuery(
            `UPDATE invoice_sequences SET next_value = next_value + 1 WHERE businessId = ? AND prefix = 'INV'`,
            [businessId]
          );

          // 2️⃣ INSERT BASE INVOICE RECORD
          const insertInvoiceSql = `
            INSERT INTO invoices (invoiceNumber, customerId, customerName, totalAmount, amountPaid, balance, status, createdAt, businessId, soldBy, dueDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const invoiceResult = await executeQuery(insertInvoiceSql, [
            invoiceNumber, customerId || null, finalizedCustomerName, parsedTotal, parsedPaid, balance, status, createdAt, businessId, soldBy, finalizedDueDate
          ]);
          const invoiceId = invoiceResult.lastID;

          // 3️⃣ PREPARE SQL STRINGS FOR TRANSACTION LEDGERS
          const insertSaleSql = `
            INSERT INTO sales (invoiceId, productId, quantitySold, unitPrice, totalPrice, paymentMethod, paymentStatus, balance, date, businessId, soldBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const insertCreditSql = `
            INSERT INTO credits (invoiceId, productId, saleId, businessId, customerName, customerPhone, totalAmount, amountPaid, balance, status, dueDate, customerId, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const paymentMethod = balance > 0 ? "CREDIT" : "CASH";
          const paymentStatus = balance <= 0 ? "Paid" : parsedPaid > 0 ? "Partial" : "Unpaid";

          // Independent deduction pools for clean calculation loops
          let salePaidPool = parsedPaid;
          let creditPaidPool = parsedPaid; 

          for (const item of items) {
            const itemTotal = item.quantity * item.price;
            
            // Proportional Calculation for Sales Table
            let saleItemPaid = 0;
            if (salePaidPool > 0) {
              if (salePaidPool >= itemTotal) {
                saleItemPaid = itemTotal;
                salePaidPool -= itemTotal;
              } else {
                saleItemPaid = salePaidPool;
                salePaidPool = 0;
              }
            }
            const saleItemBalance = itemTotal - saleItemPaid;

            const saleResult = await executeQuery(insertSaleSql, [
              invoiceId, item.productId, item.quantity, item.price, itemTotal, 
              paymentMethod, paymentStatus, saleItemBalance, createdAt, businessId, soldBy
            ]);
            const saleId = saleResult.lastID;

            // 4️⃣ POPULATE THE CREDITS TABLE ONLY IF ITEM GENERATES REAL DEBT
            // if (balance > 0) {
            //   let creditItemPaid = 0;
            //   if (creditPaidPool > 0) {
            //     if (creditPaidPool >= itemTotal) {
            //       creditItemPaid = itemTotal;
            //       creditPaidPool -= itemTotal;
            //     } else {
            //       creditItemPaid = creditPaidPool;
            //       creditPaidPool = 0;
            //     }
            //   }
            //   const creditItemBalance = itemTotal - creditItemPaid;

            //   // 💡 THE KEY FIX: Only insert into credits if the remaining balance for this item is above 0!
            //   if (creditItemBalance > 0) {
            //     await executeQuery(insertCreditSql, [
            //       invoiceId, item.productId, saleId, businessId, finalizedCustomerName, 
            //       customerPhone, itemTotal, creditItemPaid, creditItemBalance,
            //       'PENDING', finalizedDueDate, customerId || null, createdAt
            //     ]);
            //   }
            // }
          }

          // 5️⃣ UPDATE CUSTOMER ACCOUNT GLOBAL DEBT ONCE
          if (customerId && balance > 0) {
            await executeQuery(
              `UPDATE customers SET currentDebt = currentDebt + ? WHERE id = ? AND businessId = ?`,
              [balance, customerId, businessId]
            );
          }

          // 6️⃣ WRITE CART LINE-ITEMS DETAIL & DECREMENT STOCK
          const insertItemSql = `INSERT INTO invoice_items (invoiceId, productId, quantity, price) VALUES (?, ?, ?, ?)`;

          for (const item of items) {
            await executeQuery(insertItemSql, [invoiceId, item.productId, item.quantity, item.price]);

            await executeQuery(
              `UPDATE products SET quantity = quantity - ? WHERE id = ? AND businessId = ?`,
              [item.quantity, item.productId, businessId]
            );
          }

          await executeQuery("COMMIT");

          return res.status(201).json({
            message: "Invoice processed smoothly, distributed balances matching across reporting tables.",
            invoiceId: invoiceId,
            invoiceNumber: invoiceNumber,
            status: status,
            balance: balance,
            amountPaid: parsedPaid,
          });

        } catch (transactionError) {
          console.error("❌ CRITICAL TRANSACTION FAILURE. ROLLING BACK:", transactionError);
          try {
            await executeQuery("ROLLBACK");
          } catch (rollbackErr) {
            console.error("Failed to rollback:", rollbackErr);
          }
          return res.status(500).json({
            message: "Failed to process sale cleanly due to structural database errors.",
            error: transactionError.message,
          });
        }
      });
    }
  );
};

// 🛠️ READ ALL INVOICES
exports.getInvoices = (req, res) => {
  const businessId = req.user?.businessId;

  db.all(
    `SELECT i.*, c.name as customerName 
     FROM invoices i 
     LEFT JOIN customers c ON i.customerId = c.id 
     WHERE i.businessId = ? 
     ORDER BY i.createdAt DESC`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ FETCH INVOICES LEDGER ERROR:", err.message);
        return res.status(500).json({
          message: "Failed to read database records",
          error: err.message,
        });
      }
      res.json(rows);
    }
  );
};

// 🛠️ READ SINGLE INVOICE
exports.getInvoiceById = (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const businessId = req.user?.businessId;

    if (isNaN(invoiceId)) {
      return res
        .status(400)
        .json({ message: "Invalid invoice ID format provided." });
    }

    const invoiceSql = `
      SELECT i.*, c.phone as customerPhone, c.email as customerEmail
      FROM invoices i
      LEFT JOIN customers c ON i.customerId = c.id
      WHERE i.id = ? AND i.businessId = ?
    `;

    db.get(invoiceSql, [invoiceId, businessId], (err, invoiceRow) => {
      if (err) {
        console.error("❌ SQLite error reading invoice row:", err.message);
        return res.status(500).json({
          message: "Database error resolving invoice ledger records.",
        });
      }

      if (!invoiceRow) {
        return res.status(404).json({ message: "Invoice document not found or unauthorized access." });
      }

      const itemsSql = `
        SELECT ii.*, p.name as productName
        FROM invoice_items ii
        LEFT JOIN products p ON ii.productId = p.id
        WHERE ii.invoiceId = ?
      `;

      db.all(itemsSql, [invoiceId], (itemsErr, itemRows) => {
        if (itemsErr) {
          console.error("❌ SQLite error reading invoice line items:", itemsErr.message);
          return res.status(500).json({
            message: "Database error resolving product specifications.",
          });
        }

        const responseData = {
          id: invoiceRow.id,
          invoiceNumber: invoiceRow.invoiceNumber,
          customerId: invoiceRow.customerId,
          customerName: invoiceRow.customerName,
          customerPhone: invoiceRow.customerPhone,
          customerEmail: invoiceRow.customerEmail,
          totalAmount: invoiceRow.totalAmount,
          amountPaid: invoiceRow.amountPaid,
          balance: invoiceRow.balance,
          status: invoiceRow.status,
          dueDate: invoiceRow.dueDate || "Immediate Settlement",
          createdAt: invoiceRow.createdAt,
          businessId: invoiceRow.businessId,
          soldBy: invoiceRow.soldBy,
          items: itemRows.map((item) => ({
            id: item.id,
            productName: item.productName || "Unknown Product Item",
            price: item.price,
            quantity: item.quantity,
            total: item.price * item.quantity,
          })),
        };

        return res.status(200).json(responseData);
      });
    });
  } catch (error) {
    console.error("🔥 Critical exception in getInvoiceById controller:", error);
    return res.status(500).json({
      message: "Server error resolving ledger records",
      error: error.message,
    });
  }
};

// 🛠️ READ ALL PAYMENTS LOGS FOR AN INVOICE
exports.getInvoicePayments = (req, res) => {
  const invoiceId = parseInt(req.params.id || req.params.invoiceId, 10);
  const businessId = req.user?.businessId;

  const sql = `
    SELECT ip.* FROM invoice_payments ip
    JOIN invoices i ON ip.invoiceId = i.id
    WHERE ip.invoiceId = ? AND i.businessId = ?
    ORDER BY ip.paymentDate DESC
  `;

  db.all(sql, [invoiceId, businessId], (err, rows) => {
    if (err) {
      console.error("Database error fetching history:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
};

// 🛠️ DELETE INVOICE WITH AUTOMATED BALANCES SAFEGUARD
exports.deleteInvoice = (req, res) => {
  const invoiceId = req.params.id;
  const businessId = req.user?.businessId;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get(
      `SELECT * FROM invoices WHERE id = ? AND businessId = ?`,
      [invoiceId, businessId],
      (err, invoice) => {
        if (err || !invoice) {
          db.run("ROLLBACK");
          return res.status(404).json({ message: "Invoice record not found or unauthorized access." });
        }

        const remainingBalance = Number(invoice.balance || 0);

        if (remainingBalance > 0) {
          if (invoice.customerId) {
            db.run(
              `UPDATE customers SET currentDebt = currentDebt - ? WHERE id = ? AND businessId = ?`,
              [remainingBalance, invoice.customerId, businessId]
            );
          }

          db.run(
            `UPDATE business_analytics 
             SET totalCreditSales = totalCreditSales - ?, 
                 currentCreditBalance = currentCreditBalance - ? 
             WHERE businessId = ?`,
            [remainingBalance, remainingBalance, businessId]
          );
        }

        db.run(`DELETE FROM invoice_payments WHERE invoiceId = ?`, [invoiceId]);
        db.run(`DELETE FROM invoice_items WHERE invoiceId = ?`, [invoiceId]);

        db.run(
          `DELETE FROM invoices WHERE id = ? AND businessId = ?`,
          [invoiceId, businessId],
          function (deleteErr) {
            if (deleteErr) {
              db.run("ROLLBACK");
              return res.status(500).json({ message: "Failed to delete core invoice tracking" });
            }

            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ message: "Failed to safely finalize database changes" });
              }
              return res.json({
                success: true,
                message: "Invoice and historical line details cleaned up cleanly.",
              });
            });
          }
        );
      }
    );
  });
};

// 🛠️ ADD INVOICE PAYMENT (FIXED MULTI-ITEM ITEM BALANCE REDUCTION)
exports.addInvoicePayment = (req, res) => {
  const invoiceId = req.params.id;
  const businessId = req.user?.businessId;
  const { amount, method, reference } = req.body;
  const parsedAmount = Number(amount || 0);
  const timestamp = new Date().toISOString();

  db.get(`SELECT * FROM invoices WHERE id = ? AND businessId = ?`, [invoiceId, businessId], (err, invoice) => {
    if (err || !invoice) {
      return res.status(404).json({ message: "Invoice record missing or unauthorized access." });
    }

    const originalTotal = Number(invoice.totalAmount || 0);
    const newPaid = Number(invoice.amountPaid || 0) + parsedAmount;
    const newBalance = Math.max(0, originalTotal - newPaid);
    const updatedStatus = newBalance <= 0 ? "PAID" : "PARTIAL";

    // Dynamic proportional ratio applied to remaining debt balances across sub-ledger tables
    const proportionalRatio = originalTotal > 0 ? (newBalance / originalTotal) : 0;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // 1️⃣ Log transactional entry
      db.run(
        `INSERT INTO invoice_payments (invoiceId, amount, method, reference, paymentDate) VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, parsedAmount, method, reference, timestamp]
      );

      // 2️⃣ Update active master invoice row
      db.run(
        `UPDATE invoices SET amountPaid = ?, balance = ?, status = ? WHERE id = ? AND businessId = ?`,
        [newPaid, newBalance, updatedStatus, invoiceId, businessId]
      );

      // 3️⃣ Subtract from Customer Account profile balances
      if (invoice.customerId) {
        db.run(
          `UPDATE customers SET currentDebt = MAX(0, currentDebt - ?) WHERE id = ? AND businessId = ?`,
          [parsedAmount, invoice.customerId, businessId]
        );
      }

      // 4️⃣ Synchronize itemized flat sales tables proportionally instead of dumping absolute totals
      db.run(
        `UPDATE sales 
         SET balance = totalPrice * ?, paymentStatus = ?
         WHERE invoiceId = ? AND businessId = ?`,
        [proportionalRatio, updatedStatus === "PAID" ? "Paid" : "Partial", invoiceId, businessId]
      );

      // 5️⃣ Update credit profile tracking loops proportionally
      db.run(
        `UPDATE credits 
         SET balance = totalAmount * ?,
             amountPaid = totalAmount - (totalAmount * ?),
             status = CASE WHEN (totalAmount * ?) <= 0 THEN 'PAID' ELSE 'PENDING' END
         WHERE invoiceId = ?`,
        [proportionalRatio, proportionalRatio, proportionalRatio, invoiceId],
        function (creditUpdateErr) {
          if (creditUpdateErr) {
            console.error("Credit balance math update crash:", creditUpdateErr);
          }

          // 6️⃣ Drop single audit trail item mapping back to parent tracking row
          db.get(`SELECT id FROM credits WHERE invoiceId = ? LIMIT 1`, [invoiceId], (credLookupErr, creditRow) => {
            if (!credLookupErr && creditRow) {
              db.run(
                `INSERT INTO credit_payments (creditId, amount, method, date) VALUES (?, ?, ?, ?)`,
                [creditRow.id, parsedAmount, method || 'Cash', timestamp]
              );
            }
          });
        }
      );

      // 7️⃣ Readjust aggregate business analytics
      db.run(
        `UPDATE business_analytics 
         SET currentCreditBalance = MAX(0, currentCreditBalance - ?) 
         WHERE businessId = ?`,
        [parsedAmount, businessId]
      );

      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: "Payment execution crashed." });
        }
        return res.json({ 
          success: true, 
          currentBalance: newBalance, 
          paymentStatus: updatedStatus 
        });
      });
    });
  });
};

// 🛠️ FETCH HISTORICAL INSTALLMENT LOGS
exports.getCreditStatementHistory = (req, res) => {
  const invoiceId = req.params.invoiceId;
  const businessId = req.user?.businessId;

  const sql = `
    SELECT cp.*, c.customerName, i.invoiceNumber, i.totalAmount as originalInvoiceTotal
    FROM credit_payments cp
    JOIN credits c ON cp.creditId = c.id
    JOIN invoices i ON c.invoiceId = i.id
    WHERE c.invoiceId = ? AND i.businessId = ?
    ORDER BY cp.date DESC
  `;

  db.all(sql, [invoiceId, businessId], (err, rows) => {
    if (err) {
      console.error("❌ Statement extraction error:", err.message);
      return res.status(500).json({ message: "Failed to extract audit collections history." });
    }
    return res.status(200).json(rows);
  });
};

// 📊 FETCH DASHBOARD PERFORMANCE METRICS
exports.getDashboardRevenueMetrics = (req, res) => {
  const businessId = req.user?.businessId;

  const accruedSalesSql = `
    SELECT COALESCE(SUM(totalPrice), 0) AS totalBookedRevenue 
    FROM sales 
    WHERE businessId = ?
  `;

  const cashCollectedSql = `
    SELECT COALESCE(SUM(ip.amount), 0) AS totalCashInHand
    FROM invoice_payments ip
    JOIN invoices i ON ip.invoiceId = i.id
    WHERE i.businessId = ?
  `;

  db.get(accruedSalesSql, [businessId], (err, salesRow) => {
    if (err) {
      console.error("❌ Error calculating accrued sales:", err.message);
      return res.status(500).json({ message: "Internal server error reading sales ledger." });
    }

    db.get(cashCollectedSql, [businessId], (cashErr, cashRow) => {
      if (cashErr) {
        console.error("❌ Error calculating cash flow:", cashErr.message);
        return res.status(500).json({ message: "Internal server error reading payment ledger." });
      }

      return res.status(200).json({
        totalBookedRevenue: salesRow.totalBookedRevenue, 
        totalCashInHand: cashRow.totalCashInHand,      
        outstandingReceivables: Math.max(0, salesRow.totalBookedRevenue - cashRow.totalCashInHand) 
      });
    });
  });
};