const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const checkSub = require("../middleware/checkSub");
const authorize = require("../middleware/authorize");

const {
  createCredit,
  getCredits,
  getCreditById,
  updateCredit,
  addPayment,
  deleteCredit
} = require("../controllers/creditController");

router.use(auth);

router.post("/", checkSub, createCredit);
router.get("/", getCredits);
router.get("/:id", getCreditById);
router.put("/:id", updateCredit);

// 🔥 PARTIAL PAYMENT ROUTE 
router.patch("/:id/pay", addPayment);

router.delete(
  "/:id",
  checkSub,
  authorize(["admin", "manager"]),
  deleteCredit
);

module.exports = router;