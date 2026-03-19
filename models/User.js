const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  FName: { type: String, required: true },
  LName: { type: String, required: true },
  Email: { type: String, unique: true, required: true },
  Phone: { type: Number, unique: true, required: true },
  Password: { type: String, required: true }, // This will store the hashed password
  City: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "manager", "cashier"],
    default: "admin"
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);