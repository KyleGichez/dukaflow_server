// models/Invoice.js
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    // The explicit link ID from your local SQLite auto-increment primary key
    id: { type: Number, required: true }, 
    
    invoiceNumber: { type: String, required: true },
    customerId: { type: Number, default: null },
    customerName: { type: String, default: "Walk-in Customer" },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0.0 },
    balance: { type: Number, required: true },
    status: { type: String, default: "UNPAID" }, // UNPAID, PARTIAL, PAID
    dueDate: { type: String, default: "Immediate Settlement" },
    soldBy: { type: Number, required: true },
    businessId: { type: Number, required: true }
  },
  { timestamps: true }
);

// Compound index to drastically speed up multi-tenant sales dashboard requests
invoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model("Invoice", invoiceSchema);