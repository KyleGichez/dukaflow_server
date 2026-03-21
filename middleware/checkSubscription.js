const User = require("../models/User"); // Adjust path to your User model

const checkSubscription = async (req, res, next) => {
  try {
    // 1. Fetch the full user from DB using the ID from the token (req.user.id)
    const user = await User.findById(req.user.id);

    if (!user || !user.subscription) {
      return res.status(403).json({ message: "Subscription record not found." });
    }

    const now = new Date();
    const subEndDate = new Date(user.subscription.endDate);
    const trialEndDate = new Date(user.subscription.trialEndDate);

    // 2. Check for active paid subscription
    if (user.subscription.status === "active" && subEndDate > now) {
      return next();
    }

    // 3. Check if the trial is still valid
    if (trialEndDate > now) {
      return next();
    }

    // 4. If both fail, block access
    return res.status(403).json({ 
      message: "Subscription expired. Please pay Ksh 1,500 (Monthly) or Ksh 18,000 (Yearly) to continue." 
    });

  } catch (error) {
    console.error("Subscription Check Error:", error);
    return res.status(500).json({ message: "Internal server error during subscription check." });
  }
};

module.exports = checkSubscription;