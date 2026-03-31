const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.signup = async (req, res) => {
  try {
    const { FName, LName, Email, Phone, Password, City } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findOne({ Phone });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    // 2. Hash the password for the database
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Password, salt);

    // 43 Save to MongoDB
    const newUser = new User({
      FName: FName,
      LName: LName,
      Email: Email,
      Phone: Phone,
      City: City,
      Password: hashedPassword,
      role: "admin",
    });

    newUser.ownerId = newUser._id;

    await newUser.save();

    res.status(201).json({ message: "Admin registered successfully!" });
    console.log("Admin credentials:", newUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// LOGIN LOGIC
exports.login = async (req, res) => {
  try {
    const { Phone, Password } = req.body;

    // 1. Find User
    const user = await User.findOne({ Phone });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Check Password
    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // 3. Create Token
    const token = jwt.sign(
      {
        id: user._id,
        ownerId: user.ownerId,
        role: user.role,
        subscription: user.subscription,
        trialEndDate: user.trialEndDate,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        FName: user.FName,
        LName: user.LName,
        Email: user.Email,
        Phone: user.Phone,
        ownerId: user.ownerId,
        role: user.role
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { FName, LName, Email, currentPassword, newPassword, themePreference } = req.body;
    
    // 1. Find user by ID (from the 'protect' middleware)
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Handle Password Change (Optional)
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.Password);
      if (!isMatch) return res.status(400).json({ message: "Current password incorrect" });
      
      const salt = await bcrypt.genSalt(10);
      user.Password = await bcrypt.hash(newPassword, salt);
    }

    // 3. Update other fields
    if (FName) user.FName = FName;
    if (LName) user.LName = LName;
    if (Email) user.Email = Email;
    if (themePreference) user.themePreference = themePreference;

    await user.save();

    // 4. Return updated user (without password)
    const updatedUser = {
      _id: user._id,
      FName: user.FName,
      LName: user.LName,
      Email: user.Email,
      role: user.role,
      themePreference: user.themePreference,
      trialEndDate: user.trialEndDate,
      subscription: user.subscription
    };

    res.status(200).json({ message: "Settings updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.log(error);
  }
};