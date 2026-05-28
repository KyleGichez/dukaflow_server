const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
    customerName: String,
    customerPhone: Number,
    totalAmount: Number,
    amountPaid: Number,
    balance: Number,
    nextPaymentDate: Date,
    paymentHistory: [{ date: Date, amount: Number, method: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", creditSchema);
