const express = require("express");
const router = express.Router();

const {
  updateSettings,
  getAllUsers,
  createBusiness,
  getBusinessUsers,
  getAllBusinesses,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

router.put("/settings", protect, updateSettings);
router.get("/", protect, getAllUsers);
router.get("/businesses", protect, getAllBusinesses);
router.get("/business", protect, getBusinessUsers);
router.post("/", protect, createBusiness);
router.put("/:id", protect, updateUser);
router.delete("/:id", protect, deleteUser);

module.exports = router;
