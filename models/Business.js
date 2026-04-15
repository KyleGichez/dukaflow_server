const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    phone: { type: Number, unique: true, required: false },
    email: { type: String, unique: true, required: false },
    city: { type: String, required: false },
    
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", businessSchema);