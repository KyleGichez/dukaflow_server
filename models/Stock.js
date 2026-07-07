const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    quantityAdded: { type: Number, required: true },
    units: { type: String, required: true },
    buyingPrice: { type: Number, required: true},
    price: { type: Number, required: true },
    date: { type: String, required: true },
    businessId: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Stock", stockSchema);