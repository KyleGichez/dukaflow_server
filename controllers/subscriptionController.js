const Subscription = require("../models/Subscription");
const Business = require("../models/Business");

// Get all subscriptions for Admin Dashboard
const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({})
      .populate({
        path: "businessId",
        select: "businessName",
        populate: {
          path: "ownerId",
          select: "phone email city", 
        },
      })
      .sort({ createdAt: -1 });

    res.status(200).json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching data", error });
  }
};

const activateLifetime = async (req, res) => {
  try {
    const businessId = req.params.id;

    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Prevent re-activation if already lifetime
    if (business.subscriptionPlan === "lifetime") {
      return res.status(400).json({
        message: "Business already has lifetime access",
      });
    }

    // 1. Update Business (runtime access control)
    business.subscriptionPlan = "lifetime";
    business.subscriptionEndsAt = null;

    await business.save();

    // 2. Update Subscription record (audit trail)
    await Subscription.findOneAndUpdate(
      { businessId },
      {
        plan: "lifetime",
        status: "active",
        endDate: null,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Lifetime ownership activated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const hasAccess = (business) => {
  if (!business) return false;

  // Lifetime (always allowed)
  if (business.subscriptionPlan === "lifetime") {
    return true;
  }

  // Trial
  if (
    business.subscriptionPlan === "trial" &&
    business.trialEndsAt &&
    business.trialEndsAt > new Date()
  ) {
    return true;
  }

  // Paid plans
  if (
    ["monthly", "yearly"].includes(business.subscriptionPlan) &&
    business.subscriptionEndsAt &&
    business.subscriptionEndsAt > new Date()
  ) {
    return true;
  }

  return false;
};

module.exports = { getAllSubscriptions, activateLifetime, hasAccess };
