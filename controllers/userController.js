const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.createStaff = async (req, res) => {
  try {
    const { fname, lname, email, phone, password, role } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create staff (linked to business)
    const newStaff = await User.create({
      fname,
      lname,
      email,
      phone,
      password: hashedPassword,
      city: "Default",
      role,
      businessId: req.user.businessId, // 🔥 correct
    });

    res.status(201).json({
      message: "Staff member added successfully",
      user: newStaff,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStaff = async (req, res) => {
  try {
    const staff = await User.find({
      businessId: req.user.businessId,
      role: { $ne: "superadmin" }, // optional safety
    }).select("-Password");

    res.json(staff);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const staffId = req.params.id;

    const staffMember = await User.findById(staffId);

    if (!staffMember) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // 🔥 Check same business
    if (
      staffMember.businessId.toString() !== req.user.businessId.toString()
    ) {
      return res.status(403).json({
        message: "Unauthorized: Cannot delete user from another business.",
      });
    }

    // 🔥 Prevent deleting self (optional but smart)
    if (staffMember._id.toString() === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account.",
      });
    }

    await User.findByIdAndDelete(staffId);

    res.json({ message: "Staff member removed successfully" });

  } catch (error) {
    console.error("Delete Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};