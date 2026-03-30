const User = require("../models/User");

const checkSubscription = async (req, res, next) => {
  try {
    // 1. Fetch the OWNER'S data, not the current user's data
    // req.user.ownerId should be available from your decoded JWT token
    const owner = await User.findById(req.user.ownerId);

    if (!owner) {
      return res.status(404).json({ message: "Shop owner account not found." });
    }

    const now = new Date();
    
    // DEBUG: Logs will now show the Admin's status even if a staff member logs in
    console.log(`Checking Shop Access for: ${owner.Email} (Staff: ${req.user.id})`);
    console.log(`Owner Trial Ends: ${owner.trialEndDate}`);
    console.log(`Current Time: ${now}`);

    // 2. Check if the Admin's 7-day trial is still valid
    if (owner.trialEndDate && new Date(owner.trialEndDate) > now) {
      return next();
    }

    // 3. Check if the Admin has an active paid subscription
    if (owner.subscription && owner.subscription.status === "active") {
      const subEndDate = new Date(owner.subscription.endDate);
      if (subEndDate > now) {
        return next();
      }
    }

    // 4. If the Admin's account is expired, everyone (Admin & Staff) is blocked
    return res.status(403).json({ 
      message: "Subscription expired. Please renew your subscription to continue." 
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Server error checking shop status." });
  }
};

module.exports = checkSubscription;