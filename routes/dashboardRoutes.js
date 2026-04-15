const express = require("express");
const router = express.Router();

const {
  getSuperAdminDashboard,
} = require("../controllers/dashboardController");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

router.get("/", protect, authorize("superadmin"), getSuperAdminDashboard);

module.exports = router; 