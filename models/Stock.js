const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
      default: null
    },
    date: {type: Date, required: true},
    category: {type: String, required: true},
    name: {type: String, required: true},
    quantityAdded: { type: Number, required: true },
    totalStockAfter: { type: Number },
    units: { type: String, required: true },
    price: { type: Number, required: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports =  mongoose.model("Stock", stockSchema); 
