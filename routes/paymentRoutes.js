const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// 1. Match the name 'auth' from your middleware file
const auth = require("../middleware/authMiddleware"); 
const authorize = require("../middleware/roleMiddleware");

// Protect all routes in this file for Admin only
router.use(auth);
router.use(authorize(["admin"]));

// 2. Use 'auth' as the middleware function
router.post("/stk-push", auth, paymentController.stkPush);
router.post("/callback", paymentController.mpesaCallback);

module.exports = router;