const db = require("../config/db");
const bcrypt = require("bcryptjs");

// 1. Create Staff Member (Captures specific creation date)
exports.createStaff = (req, res) => {
  const { fname, lname, email, phone, password, role } = req.body;
  const businessId = req.user.businessId;

  const checkSql = "SELECT id FROM users WHERE email = ?";
  db.get(checkSql, [email], async (err, existingUser) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existingUser)
      return res.status(400).json({ message: "Email already in use" });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Captured explicitly on row creation using ISO 8601 format
      const createdAt = new Date().toISOString();

      const insertSql = `
        INSERT INTO users (fname, lname, email, phone, password, city, role, businessId, createdAt)
        VALUES (?, ?, ?, ?, ?, 'Default', ?, ?, ?)
      `;
      const params = [
        fname,
        lname,
        email,
        phone,
        hashedPassword,
        role,
        businessId,
        createdAt,
      ];

      db.run(insertSql, params, function (insertErr) {
        if (insertErr)
          return res.status(500).json({ error: insertErr.message });

        res.status(201).json({
          message: "Staff member added successfully",
          user: {
            id: this.lastID,
            fname,
            lname,
            email,
            phone,
            role,
            businessId,
            createdAt,
          },
        });
      });
    } catch (hashError) {
      res.status(500).json({ error: hashError.message });
    }
  });
};

// 2. Get Staff Performance Metrics (Fixed for strict SQLite Grouping & Naming)
exports.getStaff = (req, res) => {
  const businessId = req.user.businessId;

  const sql = `
    SELECT 
      u.id, 
      u.fname, 
      u.lname, 
      u.email, 
      u.phone, 
      u.role, 
      u.city, 
      u.businessId, 
      u.themePreference, 
      u.createdAt, -- 💡 FIXED: Changed from u.created_at to match schema camelCase
      COALESCE(SUM(s.totalPrice), 0) as totalSales,
      COALESCE(SUM(s.quantitySold), 0) as itemsSold
    FROM users u
    LEFT JOIN sales s ON u.id = s.soldBy
    WHERE u.businessId = ? AND u.role != 'superadmin'
    GROUP BY 
      u.id, 
      u.fname, 
      u.lname, 
      u.email, 
      u.phone, 
      u.role, 
      u.city, 
      u.businessId, 
      u.themePreference, 
      u.createdAt -- 💡 FIXED: Grouping statement must match your selector variable exactly
  `;

  db.all(sql, [businessId], (err, rows) => {
    if (err) {
      console.error("❌ SQL Query Error inside getStaff:", err.message);
      return res.status(500).json({
        message: "Failed to fetch staff records from database.",
        error: err.message,
      });
    }

    // Format response so both standard notations work seamlessly
    const formattedStaff = rows.map((row) => ({
      ...row,
      id: row.id,
      _id: row.id,
      createdAt: row.createdAt || null,
      isActive: true,
    }));

    res.json(formattedStaff);
  });
};

// 3. Update Staff Security Role
exports.updateStaffRole = (req, res) => {
  const { role } = req.body;
  const staffId = req.params.id;
  const allowedRoles = ["admin", "manager", "cashier"];

  if (!allowedRoles.includes(role))
    return res.status(400).json({ message: "Invalid role selected" });

  const userId = req.user._id?.toString() || req.user.id?.toString();
  if (userId === staffId && role !== "admin") {
    return res
      .status(400)
      .json({ message: "You cannot remove your own admin privileges" });
  }

  const findSql = "SELECT id FROM users WHERE id = ?";
  db.get(findSql, [staffId], (err, staff) => {
    if (err || !staff)
      return res.status(404).json({ message: "Staff member not found" });

    const updateSql = "UPDATE users SET role = ? WHERE id = ?";
    db.run(updateSql, [role, staffId], function (updateErr) {
      if (updateErr)
        return res.status(500).json({ message: "Failed to update role" });
      res
        .status(200)
        .json({ success: true, message: "Role updated successfully" });
    });
  });
};

// 4. Delete Staff Profile
exports.deleteStaff = (req, res) => {
  const staffId = req.params.id;
  const currentUserId = req.user.id || req.user._id;

  const sql = "SELECT id, businessId FROM users WHERE id = ?";
  db.get(sql, [staffId], (err, staffMember) => {
    if (err || !staffMember)
      return res.status(404).json({ message: "Staff member not found" });

    if (String(staffMember.businessId) !== String(req.user.businessId)) {
      return res
        .status(403)
        .json({
          message: "Unauthorized: Cannot delete user from another business.",
        });
    }

    if (String(staffMember.id) === String(currentUserId)) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account." });
    }

    db.run("DELETE FROM users WHERE id = ?", [staffId], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ message: "Staff member removed successfully" });
    });
  });
};

// 5. Update Profile & Security Passwords Settings
exports.updateSettings = (req, res) => {
  const userId = req.user.id;
  const { fname, lname, email, currentPassword, newPassword, themePreference } =
    req.body;

  const sql = "SELECT * FROM users WHERE id = ?";
  db.get(sql, [userId], async (err, user) => {
    if (err || !user)
      return res.status(404).json({ message: "User not found" });

    try {
      let hashedPassword = user.password;
      if (currentPassword && newPassword) {
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch)
          return res
            .status(400)
            .json({ message: "Current password incorrect" });
        hashedPassword = await bcrypt.hash(newPassword, 10);
      }

      const updateSql = `
        UPDATE users 
        SET fname = ?, lname = ?, email = ?, password = ?, themePreference = ? 
        WHERE id = ?
      `;
      const params = [
        fname || user.fname,
        lname || user.lname,
        email || user.email,
        hashedPassword,
        themePreference || user.themePreference,
        userId,
      ];

      db.run(updateSql, params, function (updateErr) {
        if (updateErr)
          return res.status(500).json({ message: updateErr.message });

        res.status(200).json({
          message: "Settings updated successfully",
          user: {
            _id: userId,
            fname: fname || user.fname,
            lname: lname || user.lname,
            email: email || user.email,
            role: user.role,
            themePreference: themePreference || user.themePreference,
          },
        });
      });
    } catch (passwordError) {
      res.status(500).json({ message: passwordError.message });
    }
  });
};

// 6. Create Workspace Business Profile
exports.createBusiness = (req, res) => {
  const { businessName, email, phone, city, status } = req.body;

  const sql = `
    INSERT INTO businesses (businessName, email, phone, city, status)
    VALUES (?, ?, ?, ?, ?)
  `;
  db.run(
    sql,
    [businessName, email, phone, city, status || "active"],
    function (err) {
      if (err) return res.status(500).json({ message: err.message });
      res
        .status(201)
        .json({ id: this.lastID, businessName, email, phone, city, status });
    }
  );
};

// 7. Superadmin View → Fetch All System Registered Accounts
exports.getAllUsers = (req, res) => {
  const sql = `
    SELECT u.id, u.fname, u.lname, u.email, u.phone, u.role, u.city, u.businessId, b.businessName, u.createdAt
    FROM users u
    LEFT JOIN businesses b ON u.businessId = b.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });

    const formattedUsers = rows.map((row) => ({
      ...row,
      _id: row.id,
      businessId: row.businessId
        ? { _id: row.businessId, businessName: row.businessName }
        : null,
    }));
    res.json(formattedUsers);
  });
};

// 8. Superadmin View → Fetch Registered Businesses with Realtime Live Counts
exports.getAllBusinesses = (req, res) => {
  const sql = `
    SELECT 
      b.*, 
      u.fname as ownerFname, u.lname as ownerLname,
      (SELECT COUNT(id) FROM users WHERE businessId = b.id) as totalUsers
    FROM businesses b
    LEFT JOIN users u ON b.ownerId = u.id
    ORDER BY b.id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err)
      return res
        .status(500)
        .json({ message: "Server Error", error: err.message });

    const formattedBusinesses = rows.map((row) => ({
      ...row,
      _id: row.id,
      ownerId: row.ownerId
        ? { _id: row.ownerId, fname: row.ownerFname, lname: row.ownerLname }
        : null,
    }));
    res.status(200).json(formattedBusinesses);
  });
};

// 9. Admin View → Fetch Staff Members Operating within the same Workspace
exports.getBusinessUsers = (req, res) => {
  const businessId = req.user.businessId;
  const sql =
    "SELECT id, fname, lname, email, phone, role, city, businessId, createdAt FROM users WHERE businessId = ?";

  db.all(sql, [businessId], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const formatted = rows.map((row) => ({ ...row, _id: row.id }));
    res.json(formatted);
  });
};

// 10. Update User Meta Specs & Accompanying Workspace Metadata Structures
exports.updateUser = (req, res) => {
  const userId = req.params.id;
  const { businessName, password, ...userData } = req.body;
  const fields = Object.keys(userData);

  db.serialize(async () => {
    db.run("BEGIN TRANSACTION");

    try {
      if (password && password.trim() !== "") {
        fields.push("password");
        userData.password = await bcrypt.hash(password, 10);
      }

      if (fields.length > 0) {
        const sets = fields.map((f) => `${f} = ?`).join(", ");
        const params = [...fields.map((f) => userData[f]), userId];

        db.run(`UPDATE users SET ${sets} WHERE id = ?`, params, (err) => {
          if (err) throw err;
        });
      }

      if (businessName) {
        db.run(
          "UPDATE businesses SET businessName = ? WHERE id = (SELECT businessId FROM users WHERE id = ?)",
          [businessName, userId],
          (err) => {
            if (err) throw err;
          }
        );
      }

      db.run("COMMIT");

      const selectSql = `
        SELECT u.*, b.businessName, b.city as bCity, b.phone as bPhone 
        FROM users u 
        LEFT JOIN businesses b ON u.businessId = b.id WHERE u.id = ?
      `;
      db.get(selectSql, [userId], (err, row) => {
        if (err || !row)
          return res
            .status(500)
            .json({ message: "Failed formatting final object" });

        res.json({
          ...row,
          _id: row.id,
          businessId: row.businessId
            ? {
                _id: row.businessId,
                businessName: row.businessName,
                city: row.bCity,
                phone: row.bPhone,
              }
            : null,
        });
      });
    } catch (txError) {
      db.run("ROLLBACK");
      res.status(500).json({ message: txError.message });
    }
  });
};

// 11. Purge Account Profile, Subscriptions, Staff logs and data paths
exports.deleteUserAndAssociatedData = (req, res) => {
  const userId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const selectSql = "SELECT businessId FROM users WHERE id = ?";
    db.get(selectSql, [userId], (err, user) => {
      if (err || !user) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "User not found" });
      }

      const businessId = user.businessId;

      if (businessId) {
        db.run(
          "DELETE FROM subscriptions WHERE businessId = ?",
          [businessId],
          (e1) => {
            if (e1) {
              db.run("ROLLBACK");
              return res.status(500).json({ message: e1.message });
            }

            db.run(
              "DELETE FROM businesses WHERE id = ?",
              [businessId],
              (e2) => {
                if (e2) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ message: e2.message });
                }

                db.run(
                  "DELETE FROM users WHERE businessId = ?",
                  [businessId],
                  (e3) => {
                    if (e3) {
                      db.run("ROLLBACK");
                      return res.status(500).json({ message: e3.message });
                    }

                    db.run("COMMIT");
                    res
                      .status(200)
                      .json({
                        message:
                          "User, Business, and Subscriptions deleted successfully",
                      });
                  }
                );
              }
            );
          }
        );
      } else {
        db.run("DELETE FROM users WHERE id = ?", [userId], (standaloneErr) => {
          if (standaloneErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: standaloneErr.message });
          }

          db.run("COMMIT");
          res.status(200).json({ message: "User deleted successfully" });
        });
      }
    });
  });
};
