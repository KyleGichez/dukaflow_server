const User = require("../models/User");
const Business = require("../models/Business");
const Subscription = require("../models/Subscription");
const bcrypt = require("bcryptjs");

// SUPERADMIN creates business + admin
exports.createBusinessWithAdmin = async (req, res) => {
  try {
    const { fname, lname, email, phone, password, city, businessName } = req.body;

    // 1. Check if user already exists BEFORE creating anything
    const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email or phone already exists" });
    }

    // 2. Create the Business first so we have the business._id ready
    const business = await Business.create({
      businessName: businessName,
      city: city, 
      // Note: we can update ownerId after the user is created
    });

    // 3. Hash password and Create the Admin User
    const hashedPassword = await bcrypt.hash(password, 10);

    const adminUser = await User.create({
      fname,
      lname,
      email,
      phone,
      city,
      password: hashedPassword,
      role: "admin",
      businessId: business._id, 
      businessName: businessName,
    });

    // 4. Update Business with the ownerId and create Subscription
    business.ownerId = adminUser._id;
    await business.save();

    // 5. Update the Business with the Owner's ID
    await Business.findByIdAndUpdate(business._id, {
      ownerId: adminUser._id
    });

    await Subscription.create({
      businessId: business._id,
      plan: "trial",
      status: "trial",
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 5. Return the created user to update the frontend state
    res.status(201).json(adminUser);

  } catch (error) {
    console.error("Creation Error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getMyBusinessProfile = async (req, res) => {
  try {
    // 1. Get the business linked to the logged-in user
    const business = await Business.findById(req.user.businessId);
    if (!business) return res.status(404).json({ message: "Business not found" });

    // 2. Get the subscription for this business
    const subscription = await Subscription.findOne({ businessId: business._id });

    // 3. Send back a combined object
    res.status(200).json({
      ...business._doc,
      subscription: subscription || null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create staff user under the same business
exports.createStaffUser = async (req, res) => {
  try {
    const { fname, lname, email, phone, password, role, businessId } = req.body;

    // 1. Validate if user exists
    const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 2. Fetch business details to copy the businessName (optional but keeps your User model consistent)
    const business = await Business.findById(businessId);
    if (!business) return res.status(404).json({ message: "No Business details found." });

    // 3. Create the Staff User
    const hashedPassword = await bcrypt.hash(password, 10);
    const newStaff = await User.create({
      fname,
      lname,
      email,
      phone,
      password: hashedPassword,
      role: role || "cashier", 
      businessId: business._id,
      businessName: business.businessName, 
      city: business.city 
    });

    res.status(201).json(newStaff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
