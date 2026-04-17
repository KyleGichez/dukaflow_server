const express = require("express");
const router = express.Router();

const {
  getMyBusinessProfile,
  createBusinessWithAdmin,
  createStaffUser,
} = require("../controllers/businessController");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

router.get("/", protect, getMyBusinessProfile);
router.post("/", protect, authorize("superadmin"), createBusinessWithAdmin);
router.post("/", protect, authorize("superadmin"), createStaffUser);

module.exports = router;
