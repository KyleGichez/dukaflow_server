const express = require("express");
const router = express.Router();

const {
  getAllSubscriptions,
  activateSubscription,
} = require("../controllers/subscriptionController");
const protect = require("../middleware/authMiddleware");

router.get("/", protect, getAllSubscriptions);
router.put("/:id", protect, activateSubscription);

module.exports = router;
