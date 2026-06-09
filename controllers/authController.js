const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = (req, res) => {
  try {
    const { phone, password } = req.body;

    // 1. Query the database for the user row by phone number
    const sql = "SELECT * FROM users WHERE phone = ?";
    
    db.get(sql, [phone], async (err, user) => {
      if (err) {
        return res.status(500).json({ message: "Database query error", error: err.message });
      }
      
      // 2. Handle missing user records safely
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 3. Verify encrypted password validity securely
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      // 4. Generate local stateless JWT access token 
      // Mapping user.id explicitly replicates your payload expectations
      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          businessId: user.businessId || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      // 5. Package clean payload and dispatch response down to client views
      res.status(200).json({
        token,
        user: {
          id: user.id,
          _id: user.id, // Included for absolute compatibility with frontend state trees
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          businessId: user.businessId || null,
        },
      });
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};