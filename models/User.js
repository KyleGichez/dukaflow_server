const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: { type: String, unique: true, required: true }, // Kept as string for phone auth consistency
    password: { type: String, required: true },
    city: { type: String, default: "Default" },
    role: {
      type: String,
      enum: ["superadmin", "admin", "manager", "cashier"],
      default: "cashier"
    },
    businessId: {
      type: Number,
      required: function () {
        return this.role !== "superadmin";
      }
    },
    businessName: { type: String },
    storeLocation: { type: String },
    poBox: { type: String },
    taxPin: { type: String },
    receiptDescription: { type: String },
    lowStockThreshold: { type: Number },
    status: { type: String, default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);