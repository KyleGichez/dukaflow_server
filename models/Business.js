const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    phone: { type: Number, required: false },
    email: { type: String, required: false },
    city: { type: String, required: false },

    subscriptionPlan: {
      type: String,
      enum: ["trial", "monthly", "yearly", "lifetime"],
      default: "trial",
    },

    subscriptionEndsAt: {
      type: Date,
      default: null,
    },

    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", businessSchema);
