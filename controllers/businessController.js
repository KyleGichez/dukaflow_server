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
            return res.status(500).json({
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
              return res.status(500).json({
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
                  return res.status(500).json({
                    message: "Failed cross-linking business owner parameters",
                  });
                }

                // Step 5: Append default active 7-day local evaluation access credentials tracking indexes
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
                      return res.status(500).json({
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
      const truePlan = subscription
        ? subscription.plan
        : business.subscriptionPlan;
      const trueExpiryDate = subscription
        ? subscription.endDate
        : business.subscriptionEndsAt || business.trialEndsAt;

      // Structure flattened relational outputs to explicitly match what Navbar.jsx handles
      res.status(200).json({
        ...business,
        _id: business.id, // MongoDB compatibility mapping alias
        subscriptionPlan: truePlan, // Overwrites business baseline with latest license state
        trialEndsAt: truePlan === "trial" ? trueExpiryDate : null,
        subscriptionEndsAt: truePlan !== "trial" ? trueExpiryDate : null,
        endDate: trueExpiryDate, // Shared fallback property
        subscription: subscription
          ? { ...subscription, _id: subscription.id }
          : null,
      });
    });
  });
};

// 3. Merchant GET: Fetch integration credentials for the specific business workspace
exports.getIntegrationSettings = (req, res) => {
  const businessId = req.user.businessId;

  const sql = `
    SELECT 
      mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey,
      etims_taxpayer_pin, etims_api_key, etims_branch_code
    FROM businesses 
    WHERE id = ?
  `;

  db.get(sql, [businessId], (err, row) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!row)
      return res.status(404).json({ message: "Business settings not found." });

    res.status(200).json({
      mpesaConfig: {
        mpesa_short_code: row.mpesa_shortcode || "",
        mpesa_consumer_key: row.mpesa_consumer_key || "",
        mpesa_consumer_secret: row.mpesa_consumer_secret || "",
        mpesa_pass_key: row.mpesa_passkey || "",
      },
      etimsConfig: {
        etims_taxpayer_pin: row.etims_taxpayer_pin || "",
        etims_api_key: row.etims_api_key || "",
        etims_branch_code: row.etims_branch_code || "",
      },
    });
  });
};

// 4. Merchant PUT/POST: Update or Insert merchant's own integration fields (Upsert with Name Fix)
exports.updateIntegrationSettings = (req, res) => {
  const businessId = req.user.businessId;
  const { mpesaConfig, etimsConfig, businessName: bodyName } = req.body;

  // Fallback name to satisfy the NOT NULL constraint if missing from body
  const businessName = bodyName || "My Duka Workspace";

  const mpesa_shortcode = mpesaConfig?.mpesa_short_code || "";
  const mpesa_consumer_key = mpesaConfig?.mpesa_consumer_key || "";
  const mpesa_consumer_secret = mpesaConfig?.mpesa_consumer_secret || "";
  const mpesa_passkey = mpesaConfig?.mpesa_pass_key || "";

  const etims_taxpayer_pin = etimsConfig?.etims_taxpayer_pin || "";
  const etims_api_key = etimsConfig?.etims_api_key || "";
  const etims_branch_code = etimsConfig?.etims_branch_code || "";

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get(
      "SELECT id FROM businesses WHERE id = ?",
      [businessId],
      (err, row) => {
        if (err) {
          db.run("ROLLBACK");
          return res
            .status(500)
            .json({
              message: "Database verification check failed: " + err.message,
            });
        }

        if (!row) {
          // Include businessName to satisfy SQLite NOT NULL constraints
          const insertSql = `
          INSERT INTO businesses (
            id, businessName, mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey,
            etims_taxpayer_pin, etims_api_key, etims_branch_code, status, subscriptionPlan
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'trial')
        `;
          db.run(
            insertSql,
            [
              businessId,
              businessName,
              mpesa_shortcode,
              mpesa_consumer_key,
              mpesa_consumer_secret,
              mpesa_passkey,
              etims_taxpayer_pin,
              etims_api_key,
              etims_branch_code,
            ],
            function (insertErr) {
              if (insertErr) {
                db.run("ROLLBACK");
                return res
                  .status(500)
                  .json({
                    message:
                      "Failed to insert integration profile row: " +
                      insertErr.message,
                  });
              }
              db.run("COMMIT");
              return sendSuccessResponse(
                res,
                mpesa_shortcode,
                mpesa_consumer_key,
                mpesa_consumer_secret,
                mpesa_passkey,
                etims_taxpayer_pin,
                etims_api_key,
                etims_branch_code
              );
            }
          );
        } else {
          // Row exists, update fields safely without altering the name
          const updateSql = `
          UPDATE businesses 
          SET mpesa_shortcode = ?, mpesa_consumer_key = ?, mpesa_consumer_secret = ?, mpesa_passkey = ?,
              etims_taxpayer_pin = ?, etims_api_key = ?, etims_branch_code = ?
          WHERE id = ?
        `;
          db.run(
            updateSql,
            [
              mpesa_shortcode,
              mpesa_consumer_key,
              mpesa_consumer_secret,
              mpesa_passkey,
              etims_taxpayer_pin,
              etims_api_key,
              etims_branch_code,
              businessId,
            ],
            function (updateErr) {
              if (updateErr) {
                db.run("ROLLBACK");
                return res
                  .status(500)
                  .json({
                    message:
                      "Failed to update integration keys: " + updateErr.message,
                  });
              }
              db.run("COMMIT");
              return sendSuccessResponse(
                res,
                mpesa_shortcode,
                mpesa_consumer_key,
                mpesa_consumer_secret,
                mpesa_passkey,
                etims_taxpayer_pin,
                etims_api_key,
                etims_branch_code
              );
            }
          );
        }
      }
    );
  });
};

// Helper for consistency
function sendSuccessResponse(res, sc, ck, cs, pk, pin, key, branch) {
  return res.status(200).json({
    message: "Integration settings saved successfully!",
    mpesaConfig: {
      mpesa_short_code: sc,
      mpesa_consumer_key: ck,
      mpesa_consumer_secret: cs,
      mpesa_pass_key: pk,
    },
    etimsConfig: {
      etims_taxpayer_pin: pin,
      etims_api_key: key,
      etims_branch_code: branch,
    },
  });
}
// 5. SUPERADMIN GET ALL: Fetch minimal status indicators for the main table view
exports.getAllBusinessIntegrations = (req, res) => {
  if (req.user.role !== "superadmin") {
    return res
      .status(403)
      .json({ message: "Access denied. System administration only." });
  }

  // Fixed specific naming schema properties inside status checks
  const sql = `
    SELECT id, businessName, phone, city, status, subscriptionPlan,
           (CASE WHEN mpesa_shortcode != '' AND mpesa_shortcode IS NOT NULL THEN 'Configured' ELSE 'Missing' END) as mpesaStatus,
           (CASE WHEN etims_api_key != '' AND etims_api_key IS NOT NULL THEN 'Configured' ELSE 'Missing' END) as etimsStatus
    FROM businesses
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.status(200).json(rows);
  });
};

// 6. SUPERADMIN GET BY ID: Fetch exact integration details for administrative overrides
exports.getBusinessIntegrationById = (req, res) => {
  if (req.user.role !== "superadmin") {
    return res
      .status(403)
      .json({ message: "Access denied. System administration only." });
  }

  const { id } = req.params;

  // Aligned column names with the master schema structure (removed the extra underscores)
  const sql = `
    SELECT 
      mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey,
      etims_taxpayer_pin, etims_api_key, etims_branch_code
    FROM businesses 
    WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!row)
      return res
        .status(404)
        .json({ message: "Target business workspace instance not found." });

    res.status(200).json({
      mpesaConfig: {
        mpesa_short_code: row.mpesa_shortcode || "",
        mpesa_consumer_key: row.mpesa_consumer_key || "",
        mpesa_consumer_secret: row.mpesa_consumer_secret || "",
        mpesa_pass_key: row.mpesa_passkey || "",
      },
      etimsConfig: {
        etims_taxpayer_pin: row.etims_taxpayer_pin || "",
        etims_api_key: row.etims_api_key || "",
        etims_branch_code: row.etims_branch_code || "",
      },
    });
  });
};

// 7. SUPERADMIN PUT: Save overrides cleanly avoiding constraints violations
exports.superadminUpdateBusinessIntegration = (req, res) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. System administration only." });
  }

  const { targetBusinessId, businessName: bodyName, mpesaConfig, etimsConfig } = req.body;

  if (!targetBusinessId) {
    return res.status(400).json({ message: "Missing targetBusinessId parameter." });
  }

  const businessName = bodyName || "Dukaflow Merchant Business";

  const mpesa_shortcode = mpesaConfig?.mpesa_short_code || "";
  const mpesa_consumer_key = mpesaConfig?.mpesa_consumer_key || "";
  const mpesa_consumer_secret = mpesaConfig?.mpesa_consumer_secret || "";
  const mpesa_passkey = mpesaConfig?.mpesa_pass_key || "";

  const etims_taxpayer_pin = etimsConfig?.etims_taxpayer_pin || "";
  const etims_api_key = etimsConfig?.etims_api_key || "";
  const etims_branch_code = etimsConfig?.etims_branch_code || "";

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get("SELECT id FROM businesses WHERE id = ?", [targetBusinessId], (err, row) => {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ message: "Database query error: " + err.message });
      }

      if (!row) {
        // Fixed: Added businessName to the parameter array map
        const insertSql = `
          INSERT INTO businesses (
            id, businessName, mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey,
            etims_taxpayer_pin, etims_api_key, etims_branch_code, status, subscriptionPlan
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'trial')
        `;
        db.run(insertSql, [targetBusinessId, businessName, mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, etims_taxpayer_pin, etims_api_key, etims_branch_code], function (insertErr) {
          if (insertErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: "Failed initializing integration configurations: " + insertErr.message });
          }
          db.run("COMMIT");
          return res.status(200).json({ message: "Business integrations initialized and configured successfully by Superadmin!" });
        });
      } else {
        const updateSql = `
          UPDATE businesses 
          SET mpesa_shortcode = ?, mpesa_consumer_key = ?, mpesa_consumer_secret = ?, mpesa_passkey = ?,
              etims_taxpayer_pin = ?, etims_api_key = ?, etims_branch_code = ?
          WHERE id = ?
        `;
        db.run(updateSql, [mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, etims_taxpayer_pin, etims_api_key, etims_branch_code, targetBusinessId], function (updateErr) {
          if (updateErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: "Failed to save administrative updates: " + updateErr.message });
          }
          db.run("COMMIT");
          return res.status(200).json({ message: "Business integrations configured successfully by Superadmin!" });
        });
      }
    });
  });
};