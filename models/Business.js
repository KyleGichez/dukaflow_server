const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },
    ownerId: { type: Number, default: null }, // Maps to SQLite ownerId INTEGER
    phone: { type: String, required: false }, // String preserves +254 formatting
    email: { type: String, required: false },
    city: { type: String, required: false },
    status: { type: String, default: "active" }, // Aligned with SQLite 'active'
    subscriptionPlan: { type: String, default: "trial" },
    subscriptionEndsAt: { type: Date, default: Date.now },
    trialEndsAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    lastTransactionId: { type: String, default: null },
    mpesaConfig: {
      paymentType: { type: String, enum: ["PAYBILL", "BUY_GOODS"], default: "PAYBILL" },
      mpesa_short_code: { type: String, default: "" },      // Store's Paybill or Till Number
      mpesa_pass_key: { type: String, default: "" },        // Used for generating local STK prompt encryption
      mpesa_consumer_key: { type: String, default: "" },    // From shop owner's Daraja developer account
      mpesa_consumer_secret: { type: String, default: "" }  // From shop owner's Daraja developer account
    },
    etimsConfig: {
      etims_taxpayer_pin: { type: String, default: "" },
      etims_api_key: { type: String, default: "" }, 
      etims_branch_code: { type: String, default: "" },   
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", businessSchema);