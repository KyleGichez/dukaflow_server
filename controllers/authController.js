const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Phone/Email and password are required" });
    }

    // 💡 FIX 1: Clean and sanitize the input (remove spaces, tabs, etc.)
    const searchIdentifier = phone.trim();

    // 💡 FIX 2: Check BOTH the phone and email columns for flexibility
    const query = `
      SELECT * FROM users 
      WHERE phone = ? OR email = ? 
      LIMIT 1
    `;

    // 1. Query the database using the asynchronous sqlite3 driver
    db.get(query, [searchIdentifier, searchIdentifier], async (err, user) => {
      if (err) {
        console.error("❌ Database query error:", err);
        return res
          .status(500)
          .json({ message: "Internal Server Error", error: err.message });
      }

      // 2. Handle missing user records safely
      if (!user) {
        console.log(
          `🔍 Authentication failed for identifier: ${searchIdentifier}`
        );
        return res.status(404).json({ message: "User not found" });
      }

      // 3. Verify using the correct column name from your schema ('password')
      const storedHash = user.password;
      if (!storedHash) {
        return res
          .status(500)
          .json({
            message: "Database password column is missing or misconfigured.",
          });
      }

      const isMatch = await bcrypt.compare(password, storedHash);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      // 4. Generate local stateless JWT access token
      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          businessId: user.businessId || null,
        },
        process.env.JWT_SECRET || "fallback_secret_key",
        { expiresIn: "1d" }
      );

      // 5. Package clean payload and dispatch response down to client views
      return res.status(200).json({
        token,
        user: {
          id: user.id,
          _id: user.id,
          fname: user.fname || "",
          lname: user.lname || "",
          email: user.email || "",
          phone: user.phone,
          role: user.role,
          businessId: user.businessId || null,
          businessName: user.businessName,
          storeLocation: user.storeLocation,
          poBox: user.poBox,
          taxPin: user.taxPin,
          receiptDescription: user.receiptDescription,
          lowStockThreshold: user.lowStockThreshold,
        },
      });
    });
  } catch (err) {
    console.error("❌ Login Controller Crash Details:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};
