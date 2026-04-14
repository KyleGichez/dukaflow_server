const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    plan: {
      type: String,
      enum: ["trial", "monthly", "yearly"],
      default: "trial",
    },

    status: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },

    startDate: Date,
    endDate: Date,

    trialEndDate: {
      type: Date,
      default: () =>
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },

    lastTransactionId: String, // M-Pesa
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);