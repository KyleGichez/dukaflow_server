const User = require("../models/User");
const Business = require("../models/Business");
const Subscription = require("../models/Subscription");
const bcrypt = require("bcryptjs");

// SUPERADMIN creates business + admin
exports.createBusinessWithAdmin = async (req, res) => {
  try {
    const { fname, lname, email, phone, password, city, businessName } = req.body;

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const adminUser = await User.create({
      fname,
      lname,
      email,
      phone,
      city,
      password: hashedPassword,
      role: "admin",
    });

    const business = await Business.create({
      name: businessName,
      ownerId: adminUser._id,
    });

    adminUser.businessId = business._id;
    await adminUser.save();

    await Subscription.create({
      businessId: business._id,
      plan: "trial",
      status: "trial",
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ message: "Business & Admin created successfully" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};