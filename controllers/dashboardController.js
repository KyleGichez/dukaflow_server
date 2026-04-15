const User = require("../models/User");
const Business = require("../models/Business");
const Subscription = require("../models/Subscription");

exports.getSuperAdminDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    const totalBusinesses = await Business.countDocuments();
    const activeBusinesses = await Business.countDocuments({ isActive: true });

    const totalSubscriptions = await Subscription.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ status: "active" });
    const trialSubscriptions = await Subscription.countDocuments({ status: "trial" });
    const expiredSubscriptions = await Subscription.countDocuments({ status: "expired" });

    const monthlySubscriptions = await Subscription.countDocuments({
      plan: "monthly",
      status: "active",
    });

    const yearlySubscriptions = await Subscription.countDocuments({
      plan: "yearly",
      status: "active",
    });
    

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password");

    res.status(200).json({
      stats: {
        users: { total: totalUsers, active: activeUsers },
        businesses: { total: totalBusinesses, active: activeBusinesses },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          trial: trialSubscriptions,
          expired: expiredSubscriptions,
          monthly: monthlySubscriptions,
          yearly: yearlySubscriptions,
        },
      },
      recentUsers,
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};