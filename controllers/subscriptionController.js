const db = require("../config/db");

// 1. Get all subscriptions with deep population (Admin Audit Logs)
const getAllSubscriptions = (req, res) => {
  // Select timeline endings clearly to prevent mapping voids on the UI layout
  const sql = `
    SELECT 
      s.id as subscriptionId, 
      s.plan, 
      s.status, 
      s.endDate as expiryDate,            -- Explicitly map to match React expectations
      s.createdAt,
      b.id as bId, 
      b.businessName,
      b.trialEndsAt as trialEndDate,      -- Pull trail timelines from business workspace context
      u.id as uId, 
      u.phone, 
      u.email, 
      u.city
    FROM subscriptions s
    LEFT JOIN businesses b ON s.businessId = b.id
    LEFT JOIN users u ON b.ownerId = u.id
    ORDER BY s.createdAt DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res
        .status(500)
        .json({ message: "Error fetching data", error: err.message });
    }

    // Remap tabular keys into nested objects cleanly
    const formattedSubscriptions = rows.map((row) => ({
      _id: row.subscriptionId,
      plan: row.plan,
      status: row.status,
      expiryDate: row.expiryDate, // Hydrated values mapping cleanly
      trialEndDate: row.trialEndDate, // Safely exposed database strings
      createdAt: row.createdAt,
      businessId: {
        _id: row.bId,
        businessName: row.businessName,
        subscriptionPlan: row.plan, // Keeps state synced up with the action modifier button
        ownerId: {
          phone: row.phone,
          email: row.email,
          city: row.city,
        },
      },
    }));

    res.status(200).json(formattedSubscriptions);
  });
};

// 2. Activate Permanent Lifetime Access Offline
const activateLifetime = (req, res) => {
  const businessId = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Check if the business entity exists locally
    const checkSql = "SELECT subscriptionPlan FROM businesses WHERE id = ?";
    db.get(checkSql, [businessId], (err, business) => {
      if (err || !business) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Business not found" });
      }

      if (business.subscriptionPlan === "lifetime") {
        db.run("ROLLBACK");
        return res
          .status(400)
          .json({ message: "Business already has lifetime access" });
      }

      // Update local workspace restrictions
      const updateBusinessSql = `
        UPDATE businesses 
        SET subscriptionPlan = 'lifetime', subscriptionEndsAt = NULL 
        WHERE id = ?
      `;
      db.run(updateBusinessSql, [businessId], function (businessErr) {
        if (businessErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: businessErr.message });
        }

        // Update licensing history trail row
        const updateSubSql = `
          UPDATE subscriptions 
          SET plan = 'lifetime', status = 'active', endDate = NULL 
          WHERE businessId = ?
        `;
        db.run(updateSubSql, [businessId], function (subErr) {
          if (subErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: subErr.message });
          }

          db.run("COMMIT");
          return res.status(200).json({
            success: true,
            message: "Lifetime ownership activated successfully",
          });
        });
      });
    });
  });
};

// 3. Sync and evaluate access control checks (Local runtime validator)
const hasAccess = (business) => {
  if (!business) return false;

  // Lifetime (always allowed)
  if (business.subscriptionPlan === "lifetime") {
    return true;
  }

  const now = new Date();

  // Trial Access Evaluation
  if (business.subscriptionPlan === "trial" && business.trialEndsAt) {
    return new Date(business.trialEndsAt) > now;
  }

  // Paid plans (Monthly/Yearly local activation periods)
  if (
    ["monthly", "yearly"].includes(business.subscriptionPlan) &&
    business.subscriptionEndsAt
  ) {
    return new Date(business.subscriptionEndsAt) > now;
  }

  return false;
};

module.exports = { getAllSubscriptions, activateLifetime, hasAccess };
