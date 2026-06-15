const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: {
      type: String, // 🔑 Changed from ObjectId to String to accept SQLite integer IDs seamlessly
      required: true,
      unique: true, 
      index: true,  
    },

    plan: {
      type: String,
      enum: ["trial", "monthly", "yearly", "lifetime"],
      default: "trial",
    },

    status: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },

    startDate: {
      type: Date,
      default: Date.now,
    },
    
    endDate: {
      type: Date,
    },

    trialEndDate: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },

    lastTransactionId: {
      type: String, // M-Pesa CheckoutRequestID or Receipt Number
      sparse: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);