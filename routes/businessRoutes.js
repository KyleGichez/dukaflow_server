const express = require("express");
const router = express.Router();

const {
  getMyBusinessProfile,
  createBusinessWithAdmin,
  getIntegrationSettings,
  updateIntegrationSettings,
  getAllBusinessIntegrations,
  getBusinessIntegrationById,
  superadminUpdateBusinessIntegration
} = require("../controllers/businessController");

const protect = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");

// =========================================================================
// 1. MATCHES: app.use("/api/admin/business/integrations", ...)
// =========================================================================

// GET /api/admin/business/integrations
// GET /api/admin/business/integrations?businessId=2
router.get("/", protect, (req, res, next) => {
  // If this handles a profile fetch on /api/myprofile, pass control down
  if (req.baseUrl === "/api/myprofile") return next();
  
  // Only allow superadmins to view integration configs
  authorize("superadmin")(req, res, () => {
    if (req.query.businessId) {
      req.params.id = req.query.businessId;
      return getBusinessIntegrationById(req, res);
    }
    return getAllBusinessIntegrations(req, res);
  });
});

// PUT /api/admin/business/integrations
router.put("/", protect, (req, res, next) => {
  if (req.baseUrl === "/api/myprofile") return next();
  
  authorize("superadmin")(req, res, () => {
    return superadminUpdateBusinessIntegration(req, res);
  });
});


// =========================================================================
// 2. MATCHES: app.use("/api/admin/business", ...)
// =========================================================================

// POST /api/admin/business (Onboarding system)
router.post("/", protect, authorize("superadmin"), (req, res, next) => {
  if (req.baseUrl !== "/api/admin/business") return next();
  return createBusinessWithAdmin(req, res);
});


// =========================================================================
// 3. MATCHES: app.use("/api/myprofile", ...)
// =========================================================================

// GET /api/myprofile
router.get("/", protect, (req, res, next) => {
  if (req.baseUrl !== "/api/myprofile") return next();
  return getMyBusinessProfile(req, res);
});


// =========================================================================
// 4. BACKWARDS COMPATIBILITY / MERCHANT DIRECT PATHS
// =========================================================================
// For individual shop operators viewing/modifying their own settings
router.get("/merchant/settings", protect, getIntegrationSettings);
router.put("/merchant/settings", protect, updateIntegrationSettings);

module.exports = router;