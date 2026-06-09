const db = require("../config/db");

exports.getSuperAdminDashboard = (req, res) => {
  // Query 1: Single-pass performance counter using conditional CASE expressions
  const statsSql = `
    SELECT
      -- User Statistics
      COUNT(u.id) as totalUsers,
      SUM(CASE WHEN u.role != 'superadmin' THEN 1 ELSE 0 END) as activeUsers, -- Using role filter as an activity/non-admin indicator

      -- Business Workspace Statistics
      COUNT(b.id) as totalBusinesses,
      SUM(CASE WHEN b.status = 'active' THEN 1 ELSE 0 END) as activeBusinesses,

      -- Flattened Subscription Metrics
      SUM(CASE WHEN b.status = 'active' THEN 1 ELSE 0 END) as activeSubs,
      SUM(CASE WHEN b.subscriptionPlan = 'trial' THEN 1 ELSE 0 END) as trialSubs,
      SUM(CASE WHEN b.status = 'expired' THEN 1 ELSE 0 END) as expiredSubs,
      SUM(CASE WHEN b.subscriptionPlan = 'monthly' AND b.status = 'active' THEN 1 ELSE 0 END) as monthlySubs,
      SUM(CASE WHEN b.subscriptionPlan = 'yearly' AND b.status = 'active' THEN 1 ELSE 0 END) as yearlySubs,
      SUM(CASE WHEN b.subscriptionPlan = 'lifetime' AND b.status = 'active' THEN 1 ELSE 0 END) as lifetimeSubs
    FROM users u
    LEFT JOIN businesses b ON u.businessId = b.id
  `;

  // Query 2: Fetch the 5 most recently onboarded user accounts
  const recentUsersSql = `
    SELECT id, fname, lname, email, phone, role, city, businessId
    FROM users
    WHERE role != 'superadmin'
    ORDER BY id DESC
    LIMIT 5
  `;

  // Execute queries sequentially inside a thread-safe serialize wrapper
  db.serialize(() => {
    db.get(statsSql, [], (err, statsRow) => {
      if (err) {
        console.error("Dashboard Stats Error:", err.message);
        return res.status(500).json({ message: "Error fetching dashboard stats", error: err.message });
      }

      db.all(recentUsersSql, [], (recentErr, recentRows) => {
        if (recentErr) {
          console.error("Dashboard Recent Users Error:", recentErr.message);
          return res.status(500).json({ message: "Error fetching recent users", error: recentErr.message });
        }

        // Standardize output rows to match your frontend data expectations
        const formattedRecentUsers = recentRows.map(row => ({
          ...row,
          _id: row.id // Replicates MongoDB ID property for component compatibility
        }));

        // Respond with the clean nested JSON object shape matching your React code
        res.status(200).json({
          stats: {
            users: {
              total: statsRow.totalUsers || 0,
              active: statsRow.activeUsers || 0
            },
            businesses: {
              total: statsRow.totalBusinesses || 0,
              active: statsRow.activeBusinesses || 0
            },
            subscriptions: {
              total: statsRow.totalBusinesses || 0, // In flattened tables, businesses equal subscription footprints
              active: statsRow.activeSubs || 0,
              trial: statsRow.trialSubs || 0,
              expired: statsRow.expiredSubs || 0,
              monthly: statsRow.monthlySubs || 0,
              yearly: statsRow.yearlySubs || 0,
              lifetime: statsRow.lifetimeSubs || 0
            }
          },
          recentUsers: formattedRecentUsers
        });
      });
    });
  });
};