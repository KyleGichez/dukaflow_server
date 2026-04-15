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
      businessId: req.user.businessId,
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

exports.updateSettings = async (req, res) => {
  try {
    const {
      fname,
      lname,
      email,
      currentPassword,
      newPassword,
      themePreference,
    } = req.body;

    // 1. Find user by ID (from the 'protect' middleware)
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Handle Password Change (Optional)
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch)
        return res.status(400).json({ message: "Current password incorrect" });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    // 3. Update other fields
    if (fname) user.fname = fname;
    if (lname) user.lname = lname;
    if (email) user.email = email;
    if (req.body.themePreference) {
      user.themePreference = req.body.themePreference;
    }

    await user.save();

    // 4. Return updated user (without password)
    const updatedUser = {
      _id: user._id,
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      role: user.role,
      themePreference: user.themePreference,
    };

    res
      .status(200)
      .json({ message: "Settings updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.log(error);
  }
};

// 👑 Superadmin → all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate("businessId", "name")
      .select("-password");

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🧑‍💼 Admin → only their business users
exports.getBusinessUsers = async (req, res) => {
  try {
    const users = await User.find({
      businessId: req.user.businessId,
    }).select("-password");

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update User (Universal for Admin and Superadmin)
exports.updateUser = async (req, res) => {
  try {
    const { fname, lname, email, phone, businessName, role, status, city, password } = req.body;
    const userId = req.params.id;

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) return res.status(404).json({ message: "User not found" });

    // 🛡️ Security Check: If not Superadmin, must belong to the same business
    if (req.user.role !== 'superadmin' && 
        userToUpdate.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Unauthorized access to this user." });
    }

    // Update fields
    userToUpdate.fname = fname || userToUpdate.fname;
    userToUpdate.lname = lname || userToUpdate.lname;
    userToUpdate.email = email || userToUpdate.email;
    userToUpdate.phone = phone || userToUpdate.phone;
    userToUpdate.role = role || userToUpdate.role;
    userToUpdate.status = status || userToUpdate.status;
    userToUpdate.city = city || userToUpdate.city;
    userToUpdate.businessName = businessName || userToUpdate.businessName;

    // Handle password change if provided
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      userToUpdate.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await userToUpdate.save();
    
    // Remove password from response
    const responseData = updatedUser.toObject();
    delete responseData.password;

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete User (Universal)
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const userToDelete = await User.findById(userId);
    if (!userToDelete) return res.status(404).json({ message: "User not found" });

    // 🛡️ Security Check
    if (req.user.role !== 'superadmin' && 
        userToDelete.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Unauthorized: You cannot delete this user." });
    }

    // Prevent self-deletion
    if (userToDelete._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account here." });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};