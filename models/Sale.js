const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    quantitySold: {
      type: Number,
      required: true,
    },

    unitPrice: {
      type: Number,
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    items: {
      type: [saleItemSchema],
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    balance: {
      type: Number,
      default: 0,
    },

    paymentMethod: {
      type: String,
      required: true, // Cash | M-Pesa | Credit
    },

    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Partial"],
      default: "Paid",
    },

    soldBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);