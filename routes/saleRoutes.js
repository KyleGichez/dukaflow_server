const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  createSale,
  getSales,
  deleteSale,
  getSalesSummary
} = require("../controllers/saleController");

router.use(auth);

router.post("/", createSale);
router.get("/", getSales);
router.get('/summary', getSalesSummary);
router.delete("/:id", deleteSale);

module.exports = router;