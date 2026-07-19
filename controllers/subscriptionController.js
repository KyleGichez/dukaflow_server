const db = require("../config/db");

// 1. Get all subscriptions with deep population
const getAllSubscriptions = (req, res) => {
  const sql = `
    SELECT 
      s.id as subscriptionId, 
      s.plan, 
      s.status, 
      s.endDate as expiryDate,
      s.createdAt,
      b.id as bId, 
      b.businessName,
      b.trialEndsAt as trialEndDate,
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

    const formattedSubscriptions = rows.map((row) => ({
      _id: row.subscriptionId,
      plan: row.plan,
      status: row.status,
      expiryDate: row.expiryDate,
      trialEndDate: row.trialEndDate,
      createdAt: row.createdAt,
      businessId: {
        _id: row.bId,
        businessName: row.businessName,
        subscriptionPlan: row.plan,
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

// 2. Activate Subscriptions Dynamically (Monthly, Yearly, Lifetime)
const activateSubscription = (req, res) => {
  const businessId = req.params.id;
  const { plan } = req.body; // Expecting 'monthly', 'yearly', or 'lifetime'

  if (!["monthly", "yearly", "lifetime"].includes(plan)) {
    return res.status(400).json({ message: "Invalid subscription plan type requested." });
  }

  // Calculate timelines based on targeted tier
  let endDate = null;
  const targetDate = new Date();

  if (plan === "monthly") {
    targetDate.setDate(targetDate.getDate() + 30);
    endDate = targetDate.toISOString();
  } else if (plan === "yearly") {
    targetDate.setDate(targetDate.getDate() + 365);
    endDate = targetDate.toISOString();
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const checkSql = "SELECT id FROM businesses WHERE id = ?";
    db.get(checkSql, [businessId], (err, business) => {
      if (err || !business) {
        db.run("ROLLBACK");
        return res.status(404).json({ message: "Business entity tracking context not found" });
      }

      // 1. Update Workspace Business Rules Context
      const updateBusinessSql = `
        UPDATE businesses 
        SET subscriptionPlan = ?, subscriptionEndsAt = ? 
        WHERE id = ?
      `;
      db.run(updateBusinessSql, [plan, endDate, businessId], function (businessErr) {
        if (businessErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ message: businessErr.message });
        }

        // 2. Sync active billing history ledger item mapping
        const updateSubSql = `
          UPDATE subscriptions 
          SET plan = ?, status = 'active', endDate = ? 
          WHERE businessId = ?
        `;
        db.run(updateSubSql, [plan, endDate, businessId], function (subErr) {
          if (subErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ message: subErr.message });
          }

          db.run("COMMIT");
          return res.status(200).json({
            success: true,
            message: `${plan.charAt(0).toUpperCase() + plan.slice(1)} access provisioned successfully!`,
          });
        });
      });
    });
  });
};

// 3. Access control runtime validator
const hasAccess = (business) => {
  if (!business) return false;

  if (business.subscriptionPlan === "lifetime") {
    return true;
  }

  const now = new Date();

  if (business.subscriptionPlan === "trial" && business.trialEndsAt) {
    return new Date(business.trialEndsAt) > now;
  }

  if (
    ["monthly", "yearly"].includes(business.subscriptionPlan) &&
    business.subscriptionEndsAt
  ) {
    return new Date(business.subscriptionEndsAt) > now;
  }

  return false;
};

module.exports = { getAllSubscriptions, activateSubscription, hasAccess };