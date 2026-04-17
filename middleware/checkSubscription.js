const Subscription = require("../models/Subscription");

const checkSubscription = async (req, res, next) => {
  try {
    // 1. Superadmin bypass
    if (req.user.Role === "superadmin") {
      return next();
    }

    const businessId = req.user.businessId;
    if (!businessId) {
      return res.status(400).json({ message: "User is not linked to any business." });
    }

    const subscription = await Subscription.findOne({ businessId });
    if (!subscription) {
      return res.status(403).json({ message: "No subscription found for this business." });
    }

    const now = new Date();

    // 2. Check Trial Expiration
    if (subscription.status === "trial") {
      if (subscription.trialEndDate && new Date(subscription.trialEndDate) <= now) {
        return res.status(403).json({
          message: "Trial expired. Please add a subscription plan to continue.",
        });
      }
      // If trial is still valid, proceed
      return next();
    }

    // 3. Check Paid Subscription Expiration
    if (subscription.status === "active") {
      if (subscription.endDate && new Date(subscription.endDate) <= now) {
        return res.status(403).json({
          message: "Subscription expired. Please renew your subscription to continue.",
        });
      }
      // If paid sub is still valid, proceed
      return next();
    }

    // 4. Fallback (If status is 'expired', 'pending', or anything else)
    return res.status(403).json({
      message: "Access denied. Your subscription is not active.",
    });

  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ message: "Server error checking subscription." });
  }
};

module.exports = checkSubscription;