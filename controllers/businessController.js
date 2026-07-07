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
        mpesa_short_code: row.mpesa_shortcode || "",
        mpesa_consumer_key: row.mpesa_consumer_key || "",
        mpesa_consumer_secret: row.mpesa_consumer_secret || "",
        mpesa_pass_key: row.mpesa_passkey || ""
      },
      etimsConfig: {
        etims_taxpayer_pin: row.etims_taxpayer_pin || "",
        etims_api_key: row.etims_api_key || "",
        etims_branch_code: row.etims_branch_code || ""
      }
    });
  });
};

// 2. PUT/POST: Upsert integration parameters safely via individual database transaction streams
exports.updateIntegrationSettings = (req, res) => {
  const businessId = req.user.businessId;
  const { mpesaConfig, etimsConfig } = req.body;

  // Destructure incoming keys safely with default fallbacks to prevent NULL column binding crashes
  const mpesa_shortcode = mpesaConfig?.mpesa_short_code || "";
  const mpesa_consumer_key = mpesaConfig?.mpesa_consumer_key || "";
  const mpesa_consumer_secret = mpesaConfig?.mpesa_consumer_secret || "";
  const mpesa_passkey = mpesaConfig?.mpesa_pass_key || "";

  const etims_taxpayer_pin = etimsConfig?.etims_taxpayer_pin || "";
  const etims_api_key = etimsConfig?.etims_api_key || "";
  const etims_branch_code = etimsConfig?.etims_branch_code || "";

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
          mpesa_short_code: mpesa_shortcode,
          mpesa_consumer_key: mpesa_consumer_key,
          mpesa_consumer_secret: mpesa_consumer_secret,
          mpesa_pass_key: mpesa_passkey
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
           (CASE WHEN mpesa_short_code != '' THEN 'Configured' ELSE 'Missing' END) as mpesaStatus,
           (CASE WHEN etims_api_key != '' THEN 'Configured' ELSE 'Missing' END) as etimsStatus
    FROM businesses
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.status(200).json(rows);
  });
};

// 1. GET: Fetch specific integration details for ANY business (For Superadmin view)
exports.getBusinessIntegrationById = (req, res) => {
  // Guard clause: Only you (the Superadmin) can access arbitrary business profiles
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. System administration only." });
  }

  const { id } = req.params; // Get the business ID directly from the URL route parameter

  const sql = `
    SELECT 
      mpesa_short_code, mpesa_consumer_key, mpesa_consumer_secret, mpesa_pass_key,
      etims_taxpayer_pin, etims_api_key, etims_branch_code
    FROM businesses 
    WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!row) return res.status(404).json({ message: "Target business workspace instance not found." });

    // Restructure the response exactly like your standard 'getIntegrationSettings' 
    // so you can reuse the exact same input form components on your frontend dashboard!
    res.status(200).json({
      mpesaConfig: {
        mpesa_short_code: row.mpesa_short_code || "",
        mpesa_consumer_key: row.mpesa_consumer_key || "",
        mpesa_consumer_secret: row.mpesa_consumer_secret || "",
        mpesa_pass_key: row.mpesa_pass_key || ""
      },
      etimsConfig: {
        etims_taxpayer_pin: row.etims_taxpayer_pin || "",
        etims_api_key: row.etims_api_key || "",
        etims_branch_code: row.etims_branch_code || ""
      }
    });
  });
};

// 2. PUT: Save configuration overrides on behalf of a specific shop owner
exports.superadminUpdateBusinessIntegration = (req, res) => {
  // Guard clause: Ensure non-admin users cannot spoof or manipulate other accounts
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. System administration only." });
  }

  // Accept the targetBusinessId directly from the payload instead of relying on req.user
  const { targetBusinessId, mpesaConfig, etimsConfig } = req.body;

  if (!targetBusinessId) {
    return res.status(400).json({ message: "Missing targetBusinessId parameter." });
  }

  const mpesa_short_code = mpesaConfig?.mpesa_short_code || "";
  const mpesa_consumer_key = mpesaConfig?.mpesa_consumer_key || "";
  const mpesa_consumer_secret = mpesaConfig?.mpesa_consumer_secret || "";
  const mpesa_pass_key = mpesaConfig?.mpesa_pass_key || "";

  const etims_taxpayer_pin = etimsConfig?.etims_taxpayer_pin || "";
  const etims_api_key = etimsConfig?.etims_api_key || "";
  const etims_branch_code = etimsConfig?.etims_branch_code || "";

  const updateSql = `
    UPDATE businesses 
    SET 
      mpesa_short_code = ?, 
      mpesa_consumer_key = ?, 
      mpesa_consumer_secret = ?, 
      mpesa_pass_key = ?,
      etims_taxpayer_pin = ?, 
      etims_api_key = ?, 
      etims_branch_code = ?
    WHERE id = ?
  `;

  const queryParams = [
    mpesa_short_code,
    mpesa_consumer_key,
    mpesa_consumer_secret,
    mpesa_pass_key,
    etims_taxpayer_pin,
    etims_api_key,
    etims_branch_code,
    targetBusinessId // 💡 Updates the selected customer's business row, not your own!
  ];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(updateSql, queryParams, function (err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Failed to save administrative updates: " + err.message });
      }

      if (this.changes === 0) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Target business workspace instance not found." });
      }

      db.run("COMMIT");
      res.status(200).json({ message: "Business integrations configured successfully by Superadmin!" });
    });
  });
};