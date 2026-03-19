const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const {
  createSale,
  getSales,
  deleteSale,
  getSalesSummary
} = require("../controllers/saleController");

router.use(auth);

router.post("/", auth, authorize(["admin", "manager", "cashier"]), createSale);
router.get("/", auth, authorize(["admin", "manager", "cashier"]), getSales);
router.get('/summary', auth, authorize(["admin", "manager", "cashier"]), getSalesSummary);
router.delete("/:id", auth, authorize(["admin", "manager", "cashier"]), deleteSale);

module.exports = router;