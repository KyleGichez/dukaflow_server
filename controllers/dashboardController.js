const db = require("../config/db");

exports.getSuperAdminDashboard = (req, res) => {
  // 1. Core User Aggregations (Using only known structural columns)
  const userStatsSql = `
    SELECT
      COUNT(id) as totalUsers,
      SUM(CASE WHEN role != 'superadmin' THEN 1 ELSE 0 END) as activeUsers
    FROM users
  `;

  // 2. Real Business Workspace & Subscription Footprint Aggregations 
  const businessStatsSql = `
    SELECT
      COUNT(id) as totalBusinesses,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeBusinesses,
      SUM(CASE WHEN subscriptionPlan = 'trial' THEN 1 ELSE 0 END) as trialSubs,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expiredSubs,
      SUM(CASE WHEN subscriptionPlan = 'monthly' AND status = 'active' THEN 1 ELSE 0 END) as monthlySubs,
      SUM(CASE WHEN subscriptionPlan = 'yearly' AND status = 'active' THEN 1 ELSE 0 END) as yearlySubs,
      SUM(CASE WHEN subscriptionPlan = 'lifetime' AND status = 'active' THEN 1 ELSE 0 END) as lifetimeSubs
    FROM businesses
  `;

  // 3. Fetch the 5 most recently onboarded user accounts
  const recentUsersSql = `
    SELECT id, fname, lname, email, phone, role, city, businessId
    FROM users
    WHERE role != 'superadmin'
    ORDER BY id DESC
    LIMIT 5
  `;

  db.serialize(() => {
    // Run User Stats
    db.get(userStatsSql, [], (err, userRow) => {
      if (err) {
        console.error("Dashboard User Stats Error:", err.message);
        return res.status(500).json({ message: "Error fetching user stats", error: err.message });
      }

      // Run Business Stats 
      db.get(businessStatsSql, [], (bizErr, bizRow) => {
        if (bizErr) {
          console.error("Dashboard Business Stats Error:", bizErr.message);
          return res.status(500).json({ message: "Error fetching business metrics", error: bizErr.message });
        }

        // Run Recent Users
        db.all(recentUsersSql, [], (recentErr, recentRows) => {
          if (recentErr) {
            console.error("Dashboard Recent Users Error:", recentErr.message);
            return res.status(500).json({ message: "Error fetching recent users", error: recentErr.message });
          }

          // Format output rows to ensure complete compatibility with your frontend keys
          const formattedRecentUsers = recentRows.map(row => ({
            ...row,
            _id: row.id 
          }));

          // Send down the exact structural shape your React dashboard code expects
          res.status(200).json({
            stats: {
              users: {
                total: userRow?.totalUsers || 0,
                active: userRow?.activeUsers || 0
              },
              businesses: {
                total: bizRow?.totalBusinesses || 0,
                active: bizRow?.activeBusinesses || 0
              },
              subscriptions: {
                total: bizRow?.totalBusinesses || 0, 
                active: bizRow?.activeBusinesses || 0,
                trial: bizRow?.trialSubs || 0,
                expired: bizRow?.expiredSubs || 0,
                monthly: bizRow?.monthlySubs || 0,
                yearly: bizRow?.yearlySubs || 0,
                lifetime: bizRow?.lifetimeSubs || 0
              }
            },
            recentUsers: formattedRecentUsers
          });
        });
      });
    });
  });
};