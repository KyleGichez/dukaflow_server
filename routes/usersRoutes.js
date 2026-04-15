const express = require("express");
const router = express.Router();

const { updateSettings, getAllUsers, getBusinessUsers } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

router.put("/settings", protect, updateSettings);
router.get("/admin", protect, getAllUsers);
router.get("/", protect, getBusinessUsers);

module.exports = router; 

