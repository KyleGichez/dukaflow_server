const User = require("../models/User");
const Business = require("../models/Business");
const Subscription = require("../models/Subscription");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 1. Find user
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3. Create token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        businessId: user.businessId || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 4. Response
    res.status(200).json({
      token,
      user: {
        id: user._id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        phone: user.phone,
        role: user.role,
        businessId: user.businessId || null,
      },
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

