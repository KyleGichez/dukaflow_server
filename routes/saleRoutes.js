const express = require("express");
const router = express.Router();
const checkSub = require("../middleware/checkSubscription");
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const {
  createSale,
  getSales,
  deleteSale,
  getSalesSummary
} = require("../controllers/saleController");

// Global middleware for this entire route file
router.use(auth);

// 🛒 This is the exact endpoint that receives checkout actions!
router.post("/", checkSub, authorize(["admin", "manager", "cashier"]), createSale);

router.get("/", authorize(["admin", "manager", "cashier"]), getSales);
router.get('/summary', authorize(["admin", "manager", "cashier"]), getSalesSummary);
router.delete("/:id", checkSub, authorize(["admin", "manager", "cashier"]), deleteSale);

module.exports = router;