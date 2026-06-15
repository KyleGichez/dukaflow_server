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
    if (!business) {
      return res
        .status(404)
        .json({ message: "Business workspace details not found" });
    }

    // Step 2: Query complementary licensing track metadata entries
    const subSql =
      "SELECT * FROM subscriptions WHERE businessId = ? ORDER BY id DESC LIMIT 1";
    db.get(subSql, [business.id], (subErr, subscription) => {
      if (subErr) return res.status(500).json({ message: subErr.message });

      // Step 3: Determine the source of truth for the subscription plan and date
      // If the subscriptions table has an entry, treat it as the ultimate authority
      const truePlan = subscription ? subscription.plan : business.subscriptionPlan;
      const trueExpiryDate = subscription ? subscription.endDate : (business.subscriptionEndsAt || business.trialEndsAt);

      // Structure flattened relational outputs to explicitly match what Navbar.jsx handles
      res.status(200).json({
        ...business,
        _id: business.id,                // MongoDB compatibility mapping alias
        subscriptionPlan: truePlan,      // Overwrites business baseline with latest license state
        trialEndsAt: truePlan === "trial" ? trueExpiryDate : null,
        subscriptionEndsAt: truePlan !== "trial" ? trueExpiryDate : null,
        endDate: trueExpiryDate,         // Shared fallback property
        subscription: subscription
          ? { ...subscription, _id: subscription.id }
          : null,
      });
    });
  });
};

// 1. GET: Fetch integration credentials for the specific business workspace
exports.getIntegrationSettings = (req, res) => {
  const businessId = req.user.businessId; // Decoded from your auth middleware

  const sql = `
    SELECT 
      mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey,
      etims_taxpayer_pin, etims_api_key, etims_branch_code
    FROM businesses 
    WHERE id = ?
  `;

  db.get(sql, [businessId], (err, row) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!row) return res.status(404).json({ message: "Business settings not found." });

    // Format data into clean, isolated camelCase configuration objects for the frontend
    res.status(200).json({
      mpesaConfig: {
        shortCode: row.mpesa_shortcode || "",
        consumerKey: row.mpesa_consumer_key || "",
        consumerSecret: row.mpesa_consumer_secret || "",
        passKey: row.mpesa_passkey || ""
      },
      etimsConfig: {
        taxpayerPin: row.etims_taxpayer_pin || "",
        apiKey: row.etims_api_key || "",
        branchCode: row.etims_branch_code || ""
      }
    });
  });
};

// 2. PUT/POST: Upsert integration parameters safely via individual database transaction streams
exports.updateIntegrationSettings = (req, res) => {
  const businessId = req.user.businessId;
  const { mpesaConfig, etimsConfig } = req.body;

  // Destructure incoming keys safely with default fallbacks to prevent NULL column binding crashes
  const mpesa_shortcode = mpesaConfig?.shortCode || "";
  const mpesa_consumer_key = mpesaConfig?.consumerKey || "";
  const mpesa_consumer_secret = mpesaConfig?.consumerSecret || "";
  const mpesa_passkey = mpesaConfig?.passKey || "";

  const etims_taxpayer_pin = etimsConfig?.taxpayerPin || "";
  const etims_api_key = etimsConfig?.apiKey || "";
  const etims_branch_code = etimsConfig?.branchCode || "";

  const updateSql = `
    UPDATE businesses 
    SET 
      mpesa_shortcode = ?, 
      mpesa_consumer_key = ?, 
      mpesa_consumer_secret = ?, 
      mpesa_passkey = ?,
      etims_taxpayer_pin = ?, 
      etims_api_key = ?, 
      etims_branch_code = ?
    WHERE id = ?
  `;

  const queryParams = [
    mpesa_shortcode,
    mpesa_consumer_key,
    mpesa_consumer_secret,
    mpesa_passkey,
    etims_taxpayer_pin,
    etims_api_key,
    etims_branch_code,
    businessId
  ];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(updateSql, queryParams, function (err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Failed to update integration keys: " + err.message });
      }

      // If no rows were changed, the business ID doesn't exist
      if (this.changes === 0) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Target business workspace instance not found." });
      }

      db.run("COMMIT");

      res.status(200).json({
        message: "Integration settings updated successfully!",
        mpesaConfig: {
          mpesa_shortcode: mpesa_shortcode,
          mpesa_consumer_key: mpesa_consumer_key,
          mpesa_consumer_secret: mpesa_consumer_secret,
          mpesa_passkey: mpesa_passkey
        },
        etimsConfig: {
          etims_taxpayer_pin: etims_taxpayer_pin,
          etims_api_key: etims_api_key,
          etims_branch_code: etims_branch_code
        }
      });
    });
  });
};

// Add this to a separate superadmin controller file
exports.getAllBusinessIntegrations = (req, res) => {
  // Check if the requester is actually the platform owner
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. System administration only." });
  }

  const sql = `
    SELECT id, businessName, phone, city, status, subscriptionPlan,
           (CASE WHEN mpesa_shortcode != '' THEN 'Configured' ELSE 'Missing' END) as mpesaStatus,
           (CASE WHEN etims_api_key != '' THEN 'Configured' ELSE 'Missing' END) as etimsStatus
    FROM businesses
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.status(200).json(rows);
  });
};