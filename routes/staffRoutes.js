const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const { createStaff, getStaff, updateStaffRole, deleteStaff } = require("../controllers/userController");

// Protect all routes in this file for Admin only
router.use(auth);
router.use(authorize(["admin"]));

router.post("/", createStaff);
router.get("/", getStaff);
router.post("/:id", updateStaffRole);
router.delete("/:id", deleteStaff);

module.exports = router; 