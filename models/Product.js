const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    buyingPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 0, required: true },
    units: { type: String, required: true },
    businessId: { type: Number, required: true } // Matches SQLite INTEGER id
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);