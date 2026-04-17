const Subscription = require("../models/Subscription");

// Get all subscriptions for Admin Dashboard
const getAllSubscriptions = async (req, res) => {
  try {
    // Populate allows us to fetch businessName, email, and phone from the linked Business model
    const subscriptions = await Subscription.find({})
      .populate("businessId", "businessName email phone") 
      .sort({ createdAt: -1 });

    if (!subscriptions) {
      return res.status(404).json({ message: "No subscriptions found" });
    }

    res.status(200).json(subscriptions);
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { getAllSubscriptions };