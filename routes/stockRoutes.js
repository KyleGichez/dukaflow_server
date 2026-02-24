const express = require("express");
const router = express.Router();
const {
  createStock,
  getStockItems,
  updateStock,
  deleteStock,
} = require("../controllers/stockController");

router.post("/", createStock);
router.get("/", getStockItems);
router.put("/:id", updateStock);  
router.delete("/:id",deleteStock);

module.exports = router;