const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.createStaff = async (req, res) => {
    try {
      const { FName, email, phone, password, role } = req.body;
      
      // 1. Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ message: "Email already in use" });

       // 2. Hash the password for the database
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
  
      // 3. Create the staff member tied to the current Admin (req.user._id)
      const newStaff = new User({
        FName: FName,
        LName: "Staff",        // Satisfies required: true
        Email: email,          // Schema expects 'Email'
        Phone: phone,          // Schema expects 'Phone'
        Password: hashedPassword,
        PlainPassword: password, // Schema expects 'Password'
        City: "Default",       // Satisfies required: true
        role: role, 
        ownerId: req.user.id 
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
    const staff = await User.find({ ownerId: req.user.id }).select("-Password");
    res.json(staff);
} catch (error) {
    res.status(500).json({ error: error.message });
}
};

exports.deleteStaff = async (req, res) => {
    try {
      const staffId = req.params.id;
      const adminId = req.user.id;
  
      const staffMember = await User.findById(staffId);
  
      if (!staffMember) {
        return res.status(404).json({ message: "Staff member not found" });
      }
  
      // ✅ ADD THIS SAFETY CHECK
      // If there is no ownerId, or it doesn't match, block the delete
      if (!staffMember.ownerId || staffMember.ownerId.toString() !== adminId.toString()) {
        return res.status(403).json({ 
          message: "Unauthorized: This account cannot be deleted by you." 
        });
      }
  
      await User.findByIdAndDelete(staffId);
      res.json({ message: "Staff member removed successfully" });
    } catch (error) {
      console.error("Delete Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  };