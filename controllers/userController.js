const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.createStaff = async (req, res) => {
    try {
      const { FName, email, phone, password, role } = req.body;
      
      // 1. Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ message: "Email already in use" });
  
      // 2. Hash the staff's temporary password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // 3. Create the staff member tied to the current Admin (req.user._id)
      const newStaff = new User({
        FName,
        LName:"",
        City: "Default",
        email,
        phone,
        password: hashedPassword,
        role, // manager or cashier
        ownerId: req.user._id 
      });
  
      await newStaff.save();
      res.status(201).json({ message: "Staff member added successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
exports.getStaff = async (req, res) => {
try {
    // Only fetch users where ownerId is the current Admin's ID
    const staff = await User.find({ ownerId: req.user._id }).select("-password");
    res.json(staff);
} catch (error) {
    res.status(500).json({ error: error.message });
}
};

exports.deleteStaff = async (req, res) => {
try {
    const staffId = req.params.id;
    const adminId = req.user._id;

    // Find the staff member
    const staffMember = await User.findById(staffId);

    if (!staffMember) {
    return res.status(404).json({ message: "Staff member not found" });
    }

    // SECURITY: Ensure this staff member actually belongs to this Admin
    // We compare the staff's ownerId with the current logged-in Admin's ID
    if (staffMember.ownerId.toString() !== adminId.toString()) {
    return res.status(403).json({ message: "Unauthorized: You do not own this staff account" });
    }

    await User.findByIdAndDelete(staffId);
    res.json({ message: "Staff member removed successfully" });
} catch (error) {
    res.status(500).json({ error: error.message });
}
};