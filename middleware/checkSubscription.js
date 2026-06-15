const db = require("../config/db"); // Your SQLite database connection instance

const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized. User data missing." });
    }

    // 1. Handle Superadmin bypass cleanly
    const userRole = (req.user.role || req.user.Role || "")
      .toLowerCase()
      .replace("_", "");
    if (userRole === "superadmin") {
      return next();
    }

    const businessId = req.user.businessId ? String(req.user.businessId) : null;
    if (!businessId) {
      return res
        .status(400)
        .json({ message: "User is not linked to any business." });
    }

    // 2. Query SQLite safely using a Promise wrapper
    // 2. Query SQLite safely using columns that actually exist
    const subscription = await new Promise((resolve, reject) => {
      db.get(
        "SELECT plan, status, endDate FROM subscriptions WHERE businessId = ?",
        [businessId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!subscription) {
      return res
        .status(403)
        .json({ message: "No subscription found for this business." });
    }

    // 3. Handle Permanent Lifetime Access cleanly
    if (
      subscription.plan === "lifetime" ||
      subscription.status === "lifetime"
    ) {
      return next();
    }

    const now = new Date();

    // 4. Check Trial Expiration (Using standard endDate if trialEndDate doesn't exist)
    if (subscription.status === "trial") {
      const trialEnd = subscription.endDate
        ? new Date(subscription.endDate)
        : null;
      if (trialEnd && trialEnd <= now) {
        return res.status(403).json({
          message: "Trial expired. Please add a subscription plan to continue.",
        });
      }
      return next();
    }

    // 5. Check Paid Subscription Expiration
    if (subscription.status === "active") {
      const regularEnd = subscription.endDate
        ? new Date(subscription.endDate)
        : null;
      if (regularEnd && regularEnd <= now) {
        return res.status(403).json({
          message:
            "Subscription expired. Please renew your subscription to continue.",
        });
      }
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Your subscription is not active.",
    });
  } catch (error) {
    console.error("❌ LOCAL SUBSCRIPTION CHECK CRASH:", error);
    return res
      .status(500)
      .json({ message: "Server error checking subscription." });
  }
};

module.exports = checkSubscription;
