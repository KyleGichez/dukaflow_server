const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Adjust path to your SQLite database configuration

router.get("/summary", (req, res) => {
  const businessId = req.user?.businessId || 1; // Safeguard multi-tenant context boundary

  // 📊 Query to pull global summary matrices atomically
  const query = `
    SELECT 
      (SELECT COALESCE(SUM(currentDebt), 0) FROM customers) AS totalOutstandingCredits,
      (SELECT COALESCE(SUM(totalAmount), 0) FROM sales WHERE businessId = ?) AS totalSalesVolume,
      (SELECT COALESCE(SUM(amountPaid), 0) FROM sales WHERE businessId = ?) AS totalCollectedCash,
      (SELECT COUNT(*) FROM invoices WHERE status = 'PARTIAL' OR status = 'UNPAID') AS activeDebtInvoicesCount
  `;

  db.get(query, [businessId, businessId], (err, row) => {
    if (err) {
      console.error("Analytics extraction report engine failure:", err);
      return res.status(500).json({ message: "Failed to compile store summary metrics data." });
    }
    return res.status(200).json(row);
  });
});

module.exports = router;