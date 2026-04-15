require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const email = process.env.SUPERADMIN_EMAIL || "dukaflowadmin@gmail.com";
    
    // 1. Prevent duplicates
    const existingAdmin = await User.findOne({ email: email });

    if (existingAdmin) {
      console.log("⚠️ Admin already exists");
      process.exit();
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 10);

    
    // 3. Create admin
    const admin = await User.create({
      fname: "Gichure",
      lname: "Maina",
      email: email,
      phone: "0793410951",
      password: hashedPassword,
      city: "Nakuru",
      role: "superadmin",
      isActive: true,
    });

    console.log("✅ Super admin created:", admin.fname, admin.lname);
    process.exit();

  } catch (error) {
    console.error("❌ Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();