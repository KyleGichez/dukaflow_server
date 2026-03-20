const express = require("express");
const router = express.Router();
const checkSub = require("../middleware/checkSubscription");
const auth = require("../middleware/authMiddleware");
const authorize = require("../middleware/roleMiddleware");
const {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct
} = require("../controllers/productController");

router.use(auth);

router.post("/", auth, checkSub, authorize(["admin", "manager"]), createProduct);
router.get("/", auth, authorize(["admin", "manager", "cashier"]), getProducts);
router.put("/:id", auth, authorize(["admin", "manager"]), updateProduct);
router.delete("/:id", auth, authorize(["admin", "manager"]), deleteProduct);

module.exports = router;
