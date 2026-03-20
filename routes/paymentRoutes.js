const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// 1. Match the name 'auth' from your middleware file
const auth = require("../middleware/authMiddleware"); 

// 2. Use 'auth' as the middleware function
router.post("/stk-push", auth, paymentController.stkPush);
router.post("/callback", paymentController.mpesaCallback);

module.exports = router;