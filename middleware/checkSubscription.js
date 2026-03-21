const checkSubscription = (req, res, next) => {
    const user = req.user; // Ensure this is the ADMIN user
    const now = new Date();
  
    // 1. If they have an active monthly/yearly plan that hasn't expired
    if (user.subscription.status === "active" && user.subscription.endDate > now) {
      return next();
    }
  
    // 2. If they are still in the 7-day trial period
    if (user.trialEndDate > now) {
      return next();
    }
  
    // 3. Otherwise, block access
    return res.status(403).json({ 
      message: "Subscription expired. Please pay Ksh 1,500 (Monthly) or Ksh 18,000 (Yearly) to continue." 
    });
  };
  
  module.exports = checkSubscription;