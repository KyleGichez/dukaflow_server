const db = require("../config/db");
const bcrypt = require("bcryptjs");

// 1. SUPERADMIN onboarding: Creates business workspace, registers admin owner, and links trial logs
exports.createBusinessWithAdmin = (req, res) => {
  const { fname, lname, email, phone, password, city, businessName } = req.body;

  // Step 1: Pre-validation scan to check for duplicate accounts locally
  const checkUserSql = "SELECT id FROM users WHERE email = ? OR phone = ?";
  db.get(checkUserSql, [email, phone], async (err, existingUser) => {
    if (err) return res.status(500).json({ message: err.message });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email or phone already exists" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Initialize atomic transaction chain execution blocks
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Step 2: Write business record shell rows
        const insertBizSql =
          "INSERT INTO businesses (businessName, city, status, subscriptionPlan) VALUES (?, ?, 'active', 'trial')";
        db.run(insertBizSql, [businessName, city], function (bizErr) {
          if (bizErr) {
            db.run("ROLLBACK");
            return res
              .status(500)
              .json({
                message: "Failed to initialize business registration mapping",
              });
          }

          const businessId = this.lastID;

          // Step 3: Insert administrative security profile user row linked to new workspace ID
          const insertUserSql = `
            INSERT INTO users (fname, lname, email, phone, password, city, role, businessId)
            VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)
          `;
          const userParams = [
            fname,
            lname,
            email,
            phone,
            hashedPassword,
            city,
            businessId,
          ];

          db.run(insertUserSql, userParams, function (userErr) {
            if (userErr) {
              db.run("ROLLBACK");
              return res
                .status(500)
                .json({
                  message: "Failed saving root security administrative details",
                });
            }

            const adminUserId = this.lastID;

            // Step 4: Backlink owner profile indicators safely into master business metadata cells
            const updateBizOwnerSql =
              "UPDATE businesses SET ownerId = ? WHERE id = ?";
            db.run(
              updateBizOwnerSql,
              [adminUserId, businessId],
              function (updateBizErr) {
                if (updateBizErr) {
                  db.run("ROLLBACK");
                  return res
                    .status(500)
                    .json({
                      message: "Failed cross-linking business owner parameters",
                    });
                }

                // Step 5: Append default active 7-day local evaluation access credentials tracking indexes
                // Calculates exact timeline thresholds using native ISOString dates matching original logic
                const trialEndsAt = new Date(
                  Date.now() + 7 * 24 * 60 * 60 * 1000
                ).toISOString();
                const insertSubSql = `
                INSERT INTO subscriptions (businessId, plan, status, endDate, createdAt)
                VALUES (?, 'trial', 'trial', ?, ?)
              `;
                const currentIsoDate = new Date().toISOString();

                db.run(
                  insertSubSql,
                  [businessId, trialEndsAt, currentIsoDate],
                  function (subErr) {
                    if (subErr) {
                      db.run("ROLLBACK");
                      return res
                        .status(500)
                        .json({
                          message: "Failed generating desktop app license logs",
                        });
                    }

                    // If all sequential operations completed smoothly without issues, commit mutations permanently
                    db.run("COMMIT");

                    // Return a combined dataset mirroring MongoDB's schema models to update frontend components
                    res.status(201).json({
                      _id: adminUserId,
                      id: adminUserId,
                      fname,
                      lname,
                      email,
                      phone,
                      city,
                      role: "admin",
                      businessId,
                      businessName,
                    });
                  }
                );
              }
            );
          });
        });
      });
    } catch (hashError) {
      res.status(500).json({ message: hashError.message });
    }
  });
};

// 2. Profile Fetcher: Consolidates operational workspace values with matching licensing items
exports.getMyBusinessProfile = (req, res) => {
  const businessId = req.user.businessId;

  // Step 1: Query the business record matching the token payload
  const bizSql = "SELECT * FROM businesses WHERE id = ?";
  db.get(bizSql, [businessId], (err, business) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!business)
      return res
        .status(404)
        .json({ message: "Business workspace details not found" });

    // Step 2: Query complementary licensing track metadata entries
    const subSql =
      "SELECT * FROM subscriptions WHERE businessId = ? ORDER BY id DESC LIMIT 1";
    db.get(subSql, [business.id], (subErr, subscription) => {
      if (subErr) return res.status(500).json({ message: subErr.message });

      // Structure flattened relational outputs to match expected object properties
      res.status(200).json({
        ...business,
        _id: business.id, // Compatibility alias mapping
        subscription: subscription
          ? { ...subscription, _id: subscription.id }
          : null,
      });
    });
  });
};
