const express = require("express");
const router = express.Router();

const {
  login,
  updateSettings,
  createBusinessWithAdmin,
  getSuperAdminDashboard,
} = require("../controllers/authController");

const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

// ✅ Login
router.post("/login", login);

router.put("/settings", protect, updateSettings);

// Superadmin creates new business + admin
router.post(
  "/superadmin/create-business",
  protect,
  authorize("superadmin"),
  createBusinessWithAdmin
);

// Superadmin gets their dashboard data
router.get(
    "/superadmin/dashboard",
    protect,
    authorize("superadmin"),
    getSuperAdminDashboard
  );

module.exports = router;