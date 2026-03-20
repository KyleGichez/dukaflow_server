const axios = require("axios");
const User = require("../models/User");

// Helper to get Safaricom OAuth Token
const getAccessToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  try {
    const res = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
  } catch (error) {
    throw new Error("Failed to get M-Pesa access token");
  }
};

// 1. Trigger the STK Push
exports.stkPush = async (req, res) => {
  const { phone, amount, plan } = req.body;
  const adminId = req.user.id || req.user._id; // From your auth middleware

  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const password = Buffer.from(
      process.env.MPESA_SHORTCODE + process.env.MPESA_PASS_KEY + timestamp
    ).toString("base64");

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: "DukaFlow Sub",
        TransactionDesc: `Subscription for ${plan}`,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Link this specific request to the user so we can identify them in the callback
    await User.findByIdAndUpdate(adminId, {
      "subscription.lastTransactionId": response.data.CheckoutRequestID,
    });

    res.status(200).json({ message: "STK Push initiated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
    console.error("STK PUSH ERROR DETAILS:", error.response?.data || error.message);
  }
};

// 2. The Callback (Safaricom hits this URL after user enters PIN)
exports.mpesaCallback = async (req, res) => {
  const { Body } = req.body;
  const result = Body.stkCallback;

  // ResultCode 0 means the user entered their PIN and the payment was successful
  if (result.ResultCode === 0) {
    const checkoutID = result.CheckoutRequestID;
    
    // Find the user who initiated this specific transaction
    const user = await User.findOne({ "subscription.lastTransactionId": checkoutID });

    if (user) {
      const amountPaid = result.CallbackMetadata.Item.find(i => i.Name === "Amount").Value;
      
      // Update subscription details
      user.subscription.status = "active";
      user.subscription.plan = amountPaid >= 12000 ? "yearly" : "monthly";
      user.subscription.startDate = new Date();
      user.subscription.endDate = new Date(
        Date.now() + (amountPaid >= 12000 ? 365 : 30) * 24 * 60 * 60 * 1000
      );

      await user.save();
      console.log(`Subscription activated for ${user.Email}`);
    }
  }

  // Always respond to Safaricom with success so they stop retrying the callback
  res.json({ ResultCode: 0, ResultDesc: "Success" });
};