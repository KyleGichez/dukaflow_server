const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    phone: { type: Number, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    city: { type: String, required: true },
    
    isActive: {
      type: Boolean,
      default: true,
    },

    createdAt: {
      type: Date,
      required: true,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", businessSchema);