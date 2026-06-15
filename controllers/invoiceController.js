const db = require("../config/db");

exports.createInvoice = (req, res) => {
  console.log("🔥 CREATE INVOICE CONTROLLER HIT");
  const businessId = req.user?.businessId || 1;
  const soldBy = req.user?.id || null;
  const {
    invoiceNumber,
    customerId,
    customerName,
    totalAmount,
    amountPaid,
    status,
    items,
    dueDate,
  } = req.body;

  const parsedTotal = Number(totalAmount || 0);
  const parsedPaid = Number(amountPaid || 0);
  const balance = parsedTotal - parsedPaid;

  const createdAt = new Date().toISOString();
  const finalizedCustomerName = customerName || "Walk-in Customer";
  const finalizedDueDate = dueDate || "Immediate Settlement";

  // Determine standard sale type classification mapping
  let saleType = "CASH";
  if (balance > 0 && parsedPaid > 0) saleType = "PARTIAL";
  else if (balance > 0 && parsedPaid === 0) saleType = "CREDIT";


  db.get(
    `SELECT phone FROM customers WHERE id = ?`,
    [customerId],
    (customerErr, customerRow) => {
      const customerPhone = customerRow?.phone || null;

      // START TRANSACTION: This ensures ALL steps pass together, or none do.
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1️⃣ INSERT INVOICE RECORD
        const insertInvoiceSql = `
          INSERT INTO invoices (invoiceNumber, customerId, customerName, totalAmount, amountPaid, balance, status, createdAt, businessId, soldBy, dueDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(
          insertInvoiceSql,
          [
            invoiceNumber,
            customerId || null,
            finalizedCustomerName,
            parsedTotal,
            parsedPaid,
            balance,
            status,
            createdAt,
            businessId,
            soldBy,
            finalizedDueDate,
          ],
          function (err) {
            if (err) {
              console.error("Invoice SQL error:", err);
              db.run("ROLLBACK");
              return res.status(500).json({
                message: "Failed to create invoice baseline structural entry.",
              });
            }

            const invoiceId = this.lastID;

            // 2️⃣ RECORD THE SALE (For financial reports ledger tracking)
            const insertSaleSql = `
              INSERT INTO sales (invoiceId, productId, quantitySold, unitPrice, totalPrice, paymentMethod, paymentStatus, balance, date, businessId, soldBy)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // Defaulting payment method to CASH if partial, or CREDIT if zero down payment
            const paymentMethod = balance > 0 ? "CREDIT" : "CASH";
            const paymentStatus =
              balance <= 0 ? "Paid" : parsedPaid > 0 ? "Partial" : "Unpaid";

            // Using a fallback productId (like 0 or a generic item ID) if logging total summary flatly
            const fallbackProductId = items[0]?.productId || 0;

            db.run(
              insertSaleSql,
              [
                invoiceId,
                fallbackProductId,
                1, // quantitySold
                parsedTotal, // unitPrice
                parsedTotal, // totalPrice (Matches your schema)
                paymentMethod,
                paymentStatus, // paymentStatus (Matches your schema)
                balance,
                createdAt, // date (Matches your schema)
                businessId,
                soldBy,
              ],
              (saleErr) => {
                if (saleErr) {
                  console.error("Sales Logging error:", saleErr);
                  db.run("ROLLBACK");
                  return res.status(500).json({
                    message: saleErr.message,
                    code: saleErr.code,
                  });
                }

                // 3️⃣ UPDATE CUSTOMER METRICS (If it's a credit sale, accumulate their debt balance)
                if (customerId && balance > 0) {
                  db.run(
                    `UPDATE customers SET currentDebt = currentDebt + ? WHERE id = ?`,
                    [balance, customerId],
                    (custDebtErr) => {
                      if (custDebtErr) {
                        console.error(
                          "Customer Debt accumulation failure:",
                          custDebtErr
                        );
                        db.run("ROLLBACK");
                        return res.status(500).json({
                          message:
                            "Failed to allocate account credit limits updates safely.",
                        });
                      }
                    }
                  );
                }

                // 4️⃣ LOOP THROUGH CART ITEMS: Save Line Items & Deduct Inventory Stock
                const insertItemSql = `
                INSERT INTO invoice_items (invoiceId, productId, quantity, price)
                VALUES (?, ?, ?, ?)
              `;

                let processedItemsCount = 0;
                let itemErrorEncountered = false;

                items.forEach((item) => {
                  if (itemErrorEncountered) return;

                  // Write the item to the invoice break-down table
                  db.run(
                    insertItemSql,
                    [invoiceId, item.productId, item.quantity, item.price],
                    (itemErr) => {
                      if (itemErr) {
                        console.error("Line item save failure:", itemErr);
                        itemErrorEncountered = true;
                        db.run("ROLLBACK");
                        return res.status(500).json({
                          message: "Failed to commit invoice breakdown arrays.",
                        });
                      }

                      // 📉 DEDUCT FROM PRODUCT STOCK INVENTORY
                      db.run(
                        `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
                        [item.quantity, item.productId],
                        (stockErr) => {
                          if (stockErr) {
                            console.error("Stock reduction failure:", stockErr);
                            itemErrorEncountered = true;
                            db.run("ROLLBACK");
                            return res.status(500).json({
                              message:
                                "Failed to reduce associated product warehouse stock quantities.",
                            });
                          }

                          processedItemsCount++;
                          // Once all items are looped through completely without errors, commit the transaction pipeline!
                          if (
                            processedItemsCount === items.length &&
                            !itemErrorEncountered
                          ) {
                            db.run("COMMIT", (commitErr) => {
                              if (commitErr) {
                                db.run("ROLLBACK");
                                return res.status(500).json({
                                  message:
                                    "Transaction commit failed operations.",
                                });
                              }
                              return res.status(201).json({
                                message:
                                  "Invoice processed, stock deducted, and sales ledger synchronized completely.",
                                invoiceId: invoiceId,
                                status: status, // <-- Send the request status down ('PAID', 'UNPAID', etc.)
                                balance: balance, // <-- Send down computed financial balances
                                amountPaid: parsedPaid,
                              });
                            });
                          }
                        }
                      );
                    }
                  );
                });
              }
            );
          }
        );
      });
    }
  );
};

// 🛠️ READ ALL INVOICES
exports.getInvoices = (req, res) => {
  const businessId = req.user?.businessId || 1;

  db.all(
    `SELECT i.*, c.name as customerName 
     FROM invoices i 
     LEFT JOIN customers c ON i.customerId = c.id 
     WHERE i.businessId = ? ORDER BY i.createdAt DESC`,
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

exports.getInvoiceById = (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);

    if (isNaN(invoiceId)) {
      return res
        .status(400)
        .json({ message: "Invalid invoice ID format provided." });
    }

    // 💡 1. Fetch the main Invoice row from SQLite
    const invoiceSql = `
      SELECT i.*, c.phone as customerPhone, c.email as customerEmail
      FROM invoices i
      LEFT JOIN customers c ON i.customerId = c.id
      WHERE i.id = ?
    `;

    db.get(invoiceSql, [invoiceId], (err, invoiceRow) => {
      if (err) {
        console.error("❌ SQLite error reading invoice row:", err.message);
        return res.status(500).json({
          message: "Database error resolving invoice ledger records.",
        });
      }

      if (!invoiceRow) {
        return res.status(404).json({ message: "Invoice document not found." });
      }

      // 💡 2. Fetch the line items attached to this invoice, joining products to get the name
      const itemsSql = `
        SELECT ii.*, p.name as productName
        FROM invoice_items ii
        LEFT JOIN products p ON ii.productId = p.id
        WHERE ii.invoiceId = ?
      `;

      db.all(itemsSql, [invoiceId], (itemsErr, itemRows) => {
        if (itemsErr) {
          console.error(
            "❌ SQLite error reading invoice line items:",
            itemsErr.message
          );
          return res.status(500).json({
            message: "Database error resolving product specifications.",
          });
        }

        // 💡 3. Build the response object mapping directly to your React frontend requirements
        // Inside exports.getInvoiceById where you construct the responseData object:
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

          // 💡 This line reads your newly added database column property securely:
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

        // Send down the structural data bundle to your UI page
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
  const sql = `SELECT * FROM invoice_payments WHERE invoiceId = ? ORDER BY paymentDate DESC`;

  db.all(sql, [invoiceId], (err, rows) => {
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
  const businessId = req.user?.businessId || 1;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get(
      `SELECT * FROM invoices WHERE id = ?`,
      [invoiceId],
      (err, invoice) => {
        if (err || !invoice) {
          db.run("ROLLBACK");
          return res.status(404).json({ message: "Invoice record not found" });
        }

        const remainingBalance = Number(invoice.balance || 0);

        if (remainingBalance > 0) {
          if (invoice.customerId) {
            db.run(
              `UPDATE customers SET currentDebt = currentDebt - ? WHERE id = ?`,
              [remainingBalance, invoice.customerId]
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

        // Clean up dependent tables
        db.run(`DELETE FROM invoice_payments WHERE invoiceId = ?`, [invoiceId]);
        db.run(`DELETE FROM invoice_items WHERE invoiceId = ?`, [invoiceId]);

        // Finish core removal step
        db.run(
          `DELETE FROM invoices WHERE id = ?`,
          [invoiceId],
          function (deleteErr) {
            if (deleteErr) {
              db.run("ROLLBACK");
              return res
                .status(500)
                .json({ message: "Failed to delete core invoice tracking" });
            }

            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                db.run("ROLLBACK");
                return res.status(500).json({
                  message: "Failed to safely finalize database changes",
                });
              }
              return res.json({
                success: true,
                message:
                  "Invoice and historical line details cleaned up cleanly.",
              });
            });
          }
        );
      }
    );
  });
};

exports.addInvoicePayment = (req, res) => {
  const invoiceId = req.params.id;
  const businessId = req.user?.businessId || 1;
  const { amount, method, reference } = req.body;
  const parsedAmount = Number(amount || 0);
  const timestamp = new Date().toISOString();

  db.get(`SELECT * FROM invoices WHERE id = ?`, [invoiceId], (err, invoice) => {
    if (err || !invoice) {
      return res.status(404).json({ message: "Invoice record missing" });
    }

    const newPaid = Number(invoice.amountPaid || 0) + parsedAmount;
    const newBalance = Number(invoice.totalAmount || 0) - newPaid;
    const updatedStatus = newBalance <= 0 ? "PAID" : "PARTIAL";

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // 1️⃣ Log general invoice payment transaction event
      db.run(
        `INSERT INTO invoice_payments (invoiceId, amount, method, reference, paymentDate) VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, parsedAmount, method, reference, timestamp]
      );

      // 2️⃣ Update active invoice core tracking numbers
      db.run(
        `UPDATE invoices SET amountPaid = ?, balance = ?, status = ? WHERE id = ?`,
        [newPaid, newBalance, updatedStatus, invoiceId]
      );

      // 3️⃣ Subtract from Customer Account profile balances
      if (invoice.customerId) {
        db.run(
          `UPDATE customers SET currentDebt = currentDebt - ? WHERE id = ?`,
          [parsedAmount, invoice.customerId]
        );
      }

      // 4️⃣ Synchronize operational flat transaction sales ledger logs
      db.run(
        `UPDATE sales 
         SET balance = ?,
             paymentStatus = ?
         WHERE invoiceId = ?`,
        [newBalance, updatedStatus === "PAID" ? "Paid" : "Partial", invoiceId]
      );

      // 5️⃣ Update credits ledger values & record a transaction split tracking entry
      db.run(
        `UPDATE credits 
         SET amountPaid = amountPaid + ?,
             balance = balance - ?,
             status = CASE WHEN balance - ? <= 0 THEN 'PAID' ELSE 'PENDING' END
         WHERE invoiceId = ?`,
        [parsedAmount, parsedAmount, parsedAmount, invoiceId],
        function (creditUpdateErr) {
          if (creditUpdateErr) {
            console.error("Credit balance math update crash:", creditUpdateErr);
          }

          // Fetch the credit profile id to drop a historical ledger bookmark record
          db.get(`SELECT id FROM credits WHERE invoiceId = ?`, [invoiceId], (credLookupErr, creditRow) => {
            if (!credLookupErr && creditRow) {
              
              // 6️⃣ DROP A CLEAN TIME-STAMPED LEDGER AUDIT ENTRY FOR TRACKING CREDIT RECOVERY
              db.run(
                `INSERT INTO credit_payments (creditId, amount, method, date) VALUES (?, ?, ?, ?)`,
                [creditRow.id, parsedAmount, method || 'Cash', timestamp]
              );
            }
          });
        }
      );

      // 7️⃣ Readjust aggregate localized business metrics
      db.run(
        `UPDATE business_analytics 
         SET currentCreditBalance = currentCreditBalance - ? 
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

// 🛠️ FETCH HISTORICAL INSTALLMENT TRACKING LOGS FOR AN INVOICE CREDIT BALANCE
exports.getCreditStatementHistory = (req, res) => {
  const invoiceId = req.params.invoiceId;

  const sql = `
    SELECT cp.*, c.customerName, i.invoiceNumber, i.totalAmount as originalInvoiceTotal
    FROM credit_payments cp
    JOIN credits c ON cp.creditId = c.id
    JOIN invoices i ON c.invoiceId = i.id
    WHERE c.invoiceId = ?
    ORDER BY cp.date DESC
  `;

  db.all(sql, [invoiceId], (err, rows) => {
    if (err) {
      console.error("❌ Statement extraction error:", err.message);
      return res.status(500).json({ message: "Failed to extract audit collections history." });
    }
    return res.status(200).json(rows);
  });
};

// 📊 FETCH DASHBOARD PERFORMANCE METRICS
exports.getDashboardRevenueMetrics = (req, res) => {
  const businessId = req.user?.businessId || 1;

  // Query 1: Total Accrued Sales (Stays the same when a balance is cleared)
  const accruedSalesSql = `
    SELECT COALESCE(SUM(totalPrice), 0) AS totalBookedRevenue 
    FROM sales 
    WHERE businessId = ?
  `;

  // Query 2: Actual Cash Collected (Goes UP when an invoice balance is cleared)
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

      // Return both distinct financial concepts to your React frontend
      return res.status(200).json({
        totalBookedRevenue: salesRow.totalBookedRevenue, // Total volume of sales pushed
        totalCashInHand: cashRow.totalCashInHand,       // Real liquid cash collected so far
        outstandingReceivables: salesRow.totalBookedRevenue - cashRow.totalCashInHand // Remaining customer debt
      });
    });
  });
};