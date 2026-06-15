const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
  {
    invoiceId: { type: Number, default: null },
    productId: { type: Number, required: true },
    saleId: { type: Number, required: true },
    businessId: { type: Number, required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: false },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    status: { type: String, default: "PENDING" }, // PENDING, PAID
    nextPaymentDate: { type: String, default: null },
    createdAt: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Credit", creditSchema);