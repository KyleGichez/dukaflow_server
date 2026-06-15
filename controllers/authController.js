const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 1. Query the database using the asynchronous sqlite3 driver
    db.get("SELECT * FROM users WHERE phone = ?", [phone], async (err, user) => {
      if (err) {
        console.error("❌ Database query error:", err);
        return res.status(500).json({ message: "Internal Server Error", error: err.message });
      }

      // 2. Handle missing user records safely
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // console.log("Found user row object keys:", Object.keys(user));
      // console.log("User row data sample:", user);

      // 3. Verify using the correct column name from your schema ('password')
      const storedHash = user.password; 
      if (!storedHash) {
        return res.status(500).json({ message: "Database password column is missing or misconfigured." });
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
        },
      });
    });

  } catch (err) {
    console.error("❌ Login Controller Crash Details:", err);
    return res.status(500).json({ message: "Internal Server Error", error: err.message });
  }
};