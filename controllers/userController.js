const User = require("../models/User");
const Business = require("../models/Business");
const Subscription = require("../models/Subscription");
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

exports.createBusiness = async (req, res) => {
  try {
    const { businessName, email, phone, city, status } = req.body;
    
    const newBusiness = await Business.create({
      businessName,
      email,
      phone,
      city,
      status
    });

    res.status(201).json(newBusiness);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 👑 Superadmin → all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate("businessId", "businessName")
      .select("-password");

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllBusinesses = async (req, res) => {
  try {
    // Assuming 'ownerId' is a field in your Business model
    const businesses = await Business.find({})
      .populate("ownerId", "fname lname") 
      .sort({ createdAt: -1 });
    
    res.status(200).json(businesses);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
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
    const { businessName, password, ...userData } = req.body;

    // 1. Handle Password: If password is empty or blank, don't update it
    if (password && password.trim() !== "") {
      // If you use bcrypt hashing in your model, this will trigger it
      userData.password = password; 
    }

    // 2. Update the User
    const user = await User.findByIdAndUpdate(req.params.id, userData, { new: true });

    // 3. Update the Business (Now 'Business' is defined!)
    if (user.businessId && businessName) {
      await Business.findByIdAndUpdate(user.businessId, { businessName });
    }

    const updatedUser = await User.findById(user._id).populate("businessId");
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete User (Universal)
// exports.deleteUser = async (req, res) => {
//   try {
//     const userId = req.params.id;

//     const userToDelete = await User.findById(userId);
//     if (!userToDelete) return res.status(404).json({ message: "User not found" });

//     // 🛡️ Security Check
//     if (req.user.role !== 'superadmin' && 
//         userToDelete.businessId.toString() !== req.user.businessId.toString()) {
//       return res.status(403).json({ message: "Unauthorized: You cannot delete this user." });
//     }

//     // Prevent self-deletion
//     if (userToDelete._id.toString() === req.user.id) {
//       return res.status(400).json({ message: "You cannot delete your own account here." });
//     }

//     await User.findByIdAndDelete(userId);
//     res.json({ message: "User deleted successfully" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };


exports.deleteUserAndAssociatedData = async (req, res) => {
  try {
    const userId = req.params.id;

    // 1. Find the user first to get their businessId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const businessId = user.businessId;

    // 2. If the user has a business, delete the business and its subscription
    if (businessId) {
      // Delete the Subscription associated with this business
      await Subscription.deleteMany({ businessId: businessId });

      // Delete the Business itself
      await Business.findByIdAndDelete(businessId);
      
      // Delete all staff members belonging to this business 
      await User.deleteMany({ businessId: businessId });
    } else {
      // If no business (just a standalone user), just delete the user
      await User.findByIdAndDelete(userId);
    }

    res.status(200).json({ message: "User, Business, and Subscriptions deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error during deletion" });
  }
};