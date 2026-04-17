const Subscription = require("../models/Subscription");
const User = require("../models/User");

// Get all subscriptions for Admin Dashboard
const getAllSubscriptions = async (req, res) => {
    try {
      const subscriptions = await Subscription.find({})
        .populate({
          path: "businessId",
          select: "businessName", // Fields from the Business model
          populate: {
            path: "ownerId",
            select: "phone email city" // Fields from the User model (the owner)
          }
        })
        .sort({ createdAt: -1 });
  
      res.status(200).json(subscriptions);
    } catch (error) {
      res.status(500).json({ message: "Error fetching data", error });
    }
  };

module.exports = { getAllSubscriptions };