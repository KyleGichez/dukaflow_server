const User = require("../models/User"); // Ensure path is correct

const checkSubscription = async (req, res, next) => {
  try {
    // 1. Fetch fresh user data from DB using the ID from your auth token
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const now = new Date();
    
    // DEBUG: Look at these in your Render/Terminal logs
    console.log(`Checking access for: ${user.Email}`);
    console.log(`Trial Ends: ${user.trialEndDate}`);
    console.log(`Current Time: ${now}`);

    // 2. Check if the 7-day trial is still valid (Now outside subscription)
    if (user.trialEndDate && new Date(user.trialEndDate) > now) {
      return next();
    }

    // 3. Check for active paid subscription (Inside subscription object)
    if (user.subscription && user.subscription.status === "active") {
      const subEndDate = new Date(user.subscription.endDate);
      if (subEndDate > now) {
        return next();
      }
    }

    // 4. If both fail, block access
    return res.status(403).json({ 
      message: "Subscription expired. Please renew your subscription to continue." 
    });

  } catch (error) {
    console.error("Middleware Error:", error);
    return res.status(500).json({ message: "Server error checking subscription." });
  }
};

module.exports = checkSubscription;