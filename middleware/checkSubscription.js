const checkSubscription = (req, res, next) => {
  const user = req.user; 
  const now = new Date();

  // 1. Safety Check: Ensure user and subscription data exist
  if (!user || !user.subscription) {
    return res.status(403).json({ 
      message: "Access denied. Subscription record not found." 
    });
  }

  // 2. Convert database strings to Date objects for accurate comparison
  const subEndDate = new Date(user.subscription.endDate);
  const trialEndDate = new Date(user.subscription.trialEndDate);

  // 3. Check for active monthly/yearly plan
  if (user.subscription.status === "active" && subEndDate > now) {
    return next();
  }

  // 4. Check if the 7-day trial is still valid (FIXED PATH)
  if (trialEndDate > now) {
    return next();
  }

  // 5. Otherwise, block access
  return res.status(403).json({ 
    message: "Subscription expired. Please pay Ksh 1,500 (Monthly) or Ksh 18,000 (Yearly) to continue." 
  });
};

module.exports = checkSubscription;