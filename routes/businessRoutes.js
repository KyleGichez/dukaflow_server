const express = require("express");
const router = express.Router();

const {
  createBusinessWithAdmin,
} = require("../controllers/businessController");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

router.post("/", protect, authorize("superadmin"), createBusinessWithAdmin);

module.exports = router;
