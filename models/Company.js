const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  trialStartDate: Date,
  trialEndDate: Date,

  subscriptionStatus: {
    type: String,
    enum: ["trial", "active", "expired"],
    default: "trial"
  }

}, { timestamps: true });

module.exports = mongoose.model("Company", CompanySchema);