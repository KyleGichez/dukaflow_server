const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

const {
  createCredit,
  getCredits,
  getCreditPayments,
  getCreditById,
  updateCredit,
  addPayment,
  deleteCredit
} = require("../controllers/creditController");

router.use(auth);

router.post("/", createCredit);
router.get("/", getCredits);
router.get("/", getCreditPayments);
router.get("/:id", getCreditById);
router.put("/:id", updateCredit);

// 🔥 PARTIAL PAYMENT ROUTE 
router.patch("/:id/pay", addPayment);

router.delete(
  "/:id",
  authorize(["admin", "manager"]),
  deleteCredit
);

module.exports = router;