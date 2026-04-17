const express = require("express");
const router = express.Router();


const {
    getAllSubscriptions
  } = require("../controllers/subscriptionController");
  const protect = require("../middleware/authMiddleware");
  
  router.get("/", protect, getAllSubscriptions);

  module.exports = router;