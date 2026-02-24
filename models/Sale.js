const mongoose = require("mongoose");

const saleSchema = mongoose.Schema(
  {
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true 
    },
    date: { type: Date, required: true},
    quantitySold: { type: Number, required: true },
    unitPrice: { type: Number},
    totalPrice : {type: Number, required: true},
    units: {type: String},
    paymentMethod: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
