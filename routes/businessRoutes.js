const express = require("express");
const router = express.Router();

const {
  getMyBusinessProfile,
  createBusinessWithAdmin,
  getIntegrationSettings,
  updateIntegrationSettings,
} = require("../controllers/businessController");
const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

router.get("/", protect, getMyBusinessProfile);
router.get("/", protect, authorize("admin"), getIntegrationSettings)
router.put("/", protect, authorize("admin"), updateIntegrationSettings);
router.post("/", protect, authorize("superadmin"), createBusinessWithAdmin);

module.exports = router;
