const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    invoiceId: { type: Number, required: true }, // Links directly to the invoice record
    productId: { type: Number, required: true },
    quantitySold: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true },
    balance: { type: Number, default: 0 },
    date: { type: String, required: true }, // Matches local timestamp strings
    businessId: { type: Number, required: true },
    soldBy: { type: Number, required: true }
  },
  { timestamps: true }
);

saleSchema.index({ businessId: 1, date: -1 });

module.exports = mongoose.model("Sale", saleSchema);