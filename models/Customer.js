const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    // 📦 FIXED: Changed from ObjectId to Number to align with SQLite keys
    businessId: { type: Number, required: true }, 
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    creditLimit: { type: Number, default: 50000 },
    currentDebt: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);