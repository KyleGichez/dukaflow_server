const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  createStock,
  getStockItems,
  updateStock,
  deleteStock,
} = require("../controllers/stockController");

router.use(auth);

router.post("/", createStock);
router.get("/", getStockItems);
router.put("/:id", updateStock);  
router.delete("/:id",deleteStock);

module.exports = router;