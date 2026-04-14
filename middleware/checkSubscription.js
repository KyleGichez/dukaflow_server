const Subscription = require("../models/Subscription");

const checkSubscription = async (req, res, next) => {
  try {
    // 🔥 Superadmin bypass
    if (req.user.Role === "superadmin") {
      return next();
    }

    const businessId = req.user.businessId;

    if (!businessId) {
      return res.status(400).json({
        message: "User is not linked to any business.",
      });
    }

    // 🔥 Fetch subscription using businessId
    const subscription = await Subscription.findOne({ businessId });

    if (!subscription) {
      return res.status(403).json({
        message: "No subscription found for this business.",
      });
    }

    const now = new Date();

    console.log(`Checking subscription for business: ${businessId}`);
    console.log(`Plan: ${subscription.plan}`);
    console.log(`Status: ${subscription.status}`);
    
    // ✅ Check trial status
    if (
      subscription.status === "trial" &&
      subscription.trialEndDate &&
      new Date(subscription.trialEndDate) <= now
      ) {
        return res.status(403).json({
          message: "Trial expired. Please add a subscription plan to continue.",
        });
      }

    // Check paid subscription status
    if (
      subscription.status === "active" &&
      subscription.endDate &&
      new Date(subscription.endDate) <= now
    ) {
      return res.status(403).json({
        message:
          "Subscription expired. Please renew your subscription to continue.",
      });
    }

    // Fallback (no valid access)
    return res.status(403).json({
      message: "Access denied. No active subscription.",
    });
  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({
      message: "Server error checking subscription.",
    });
  }
};

module.exports = checkSubscription;
