const express = require("express");
const router = express.Router();

const {
  updateSettings,
  getAllUsers,
  getBusinessUsers,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

router.put("/settings", protect, updateSettings);
router.get("/", protect, getAllUsers);
router.get("/business", protect, getBusinessUsers);
router.put("/:id", protect, updateUser);
router.delete("/:id", protect, deleteUser);

module.exports = router;
