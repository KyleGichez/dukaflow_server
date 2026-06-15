const express = require("express");
const router = express.Router();

const invoiceController =
require("../controllers/invoiceController");

router.post("/", invoiceController.createInvoice);

router.get("/", invoiceController.getInvoices);

router.get("/analytics/revenue-summary", invoiceController.getDashboardRevenueMetrics);

router.get("/:id", invoiceController.getInvoiceById);

router.patch(
    "/:id/payments",
    invoiceController.addInvoicePayment
);

router.get(
    "/:id/payments",
    invoiceController.getInvoicePayments
);
router.delete(
    "/:id",
    invoiceController.deleteInvoice
);

module.exports = router;