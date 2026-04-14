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

// SUPERADMIN creates business + admin
exports.createBusinessWithAdmin = async (req, res) => {
  try {
    const { fname, lname, email, phone, password, city, businessName } = req.body;

    // 1. Check if user exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create admin
    const adminUser = await User.create({
      fname,
      lname,
      email,
      phone,
      city,
      password: hashedPassword,
      role: "admin",
    });

    // 4. Create business
    const business = await Business.create({
      name: businessName,
      ownerId: adminUser._id,
    });

    // 5. Link admin → business
    adminUser.businessId = business._id;
    await adminUser.save();

    // 6. Create trial subscription
    await Subscription.create({
      businessId: business._id,
      plan: "trial",
      status: "trial",
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({
      message: "Business & Admin created successfully",
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSuperAdminDashboard = async (req, res) => {
  try {
    // 🔥 USERS
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });

    // 🔥 BUSINESSES
    const totalBusinesses = await Business.countDocuments();
    const activeBusinesses = await User.countDocuments({ isActive: true });
    const inactiveBusinesses = await User.countDocuments({ isActive: false });

    // 🔥 SUBSCRIPTIONS
    const totalSubscriptions = await Subscription.countDocuments();

    const activeSubscriptions = await Subscription.countDocuments({
      status: "active",
    });

    const trialSubscriptions = await Subscription.countDocuments({
      status: "trial",
    });

    const expiredSubscriptions = await Subscription.countDocuments({
      status: "expired",
    });

    // 🔥 PLAN BREAKDOWN
    const monthlySubscriptions = await Subscription.countDocuments({
      plan: "monthly",
      status: "active",
    });

    const yearlySubscriptions = await Subscription.countDocuments({
      plan: "yearly",
      status: "active",
    });

    // 🔥 RECENT USERS (last 5)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-Password");

    // ✅ RESPONSE
    res.status(200).json({
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
        },
        businesses: {
          total: totalBusinesses,
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          trial: trialSubscriptions,
          expired: expiredSubscriptions,
          monthly: monthlySubscriptions,
          yearly: yearlySubscriptions,
        },
      },
      recentUsers,
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};
