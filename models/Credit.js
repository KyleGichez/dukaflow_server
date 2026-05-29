// models/Credit.js
const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // Added to populate item details
    quantitySold: { type: Number, default: 1 },                         // Added for table qty column
    
    customerName: String,
    customerPhone: String,

    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // Kept consistent with controller tracking

    nextPaymentDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "PAID"],
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