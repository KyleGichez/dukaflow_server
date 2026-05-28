const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },

    customerName: String,
    customerPhone: String,

    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },

    nextPaymentDate: Date,

    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "CLEARED"],
      default: "PENDING",
    },

    paymentHistory: [
      {
        date: { type: Date, default: Date.now },
        amount: Number,
        method: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Credit", creditSchema);