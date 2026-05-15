const express = require("express");
const router = express.Router();

const {
  getAllSubscriptions,
  activateLifetime,
} = require("../controllers/subscriptionController");
const protect = require("../middleware/authMiddleware");

router.get("/", protect, getAllSubscriptions);
router.put("/:id/lifetime", protectAdmin, activateLifetime);

module.exports = router;
