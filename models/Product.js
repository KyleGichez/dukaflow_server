const mongoose = require("mongoose");

const productSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 0, required: true },
    units: { type: String, required: true},
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
