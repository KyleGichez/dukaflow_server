const express = require("express");
const router = express.Router();
const checkSub = require("../middleware/checkSubscription");
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const {
  createStock,
  getStockItems,
  updateStock,
  deleteStock,
} = require("../controllers/stockController");

router.use(auth);

router.post("/", auth, checkSub, authorize(["admin", "manager"]), createStock);
router.get("/",  auth, authorize(["admin", "manager", "cashier"]), getStockItems);
router.put("/:id", auth, authorize(["admin", "manager"]), updateStock);  
router.delete("/:id", auth, authorize(["admin", "manager"]), deleteStock);

module.exports = router;