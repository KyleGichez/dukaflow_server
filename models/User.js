const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  FName: { type: String, required: true },
  LName: { type: String, required: true },
  Email: { type: String, unique: true, required: true },
  Phone: { type: Number, unique: true, required: true },
  Password: { type: String, required: true }, // This will store the hashed password
  PlainPassword: { type: String},
  City: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "manager", "cashier"],
    default: "admin"
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  subscription: {
    plan: { 
      type: String, 
      enum: ["none", "monthly", "yearly"], 
      default: "none" 
    },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { 
      type: String, 
      enum: ["trial", "active", "expired"], 
      default: "trial" 
    },
    lastTransactionId: { type: String } // To store M-Pesa CheckoutRequestID
  },
  trialEndDate: {
    type: Date,
    default: () => new Date(+new Date() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);