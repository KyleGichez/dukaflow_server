const axios = require("axios");
const User = require("../models/User");

exports.triggerStkPush = async (req, res) => {
  const { phone, amount, plan } = req.body; // amount: 1000 or 12000
  const adminId = req.user.id;

  try {
    // 1. Get OAuth Token from Safaricom
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
    const tokenRes = await axios.get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: `Basic ${auth}` }
    });
    const token = tokenRes.data.access_token;

    // 2. Trigger STK Push
    const date = new Date();
    const timestamp = date.getFullYear() +
      ("0" + (date.getMonth() + 1)).slice(-2) +
      ("0" + date.getDate()).slice(-2) +
      ("0" + date.getHours()).slice(-2) +
      ("0" + date.getMinutes()).slice(-2) +
      ("0" + date.getSeconds()).slice(-2);

    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");

    const stkRes = await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone, // e.g., 254712345678
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: "https://your-server.onrender.com/api/payments/callback",
      AccountReference: "DukaFlow Sub",
      TransactionDesc: `Payment for ${plan} plan`
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 3. Save the CheckoutRequestID to the User so we can verify later
    await User.findByIdAndUpdate(adminId, { "subscription.lastTransactionId": stkRes.data.CheckoutRequestID });

    res.status(200).json({ message: "STK Push sent! Please enter your PIN." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.mpesaCallback = async (req, res) => {
    const { Body } = req.body;
    const checkoutID = Body.stkCallback.CheckoutRequestID;
    const resultCode = Body.stkCallback.ResultCode;
  
    if (resultCode === 0) {
      // ResultCode 0 means SUCCESS
      const user = await User.findOne({ "subscription.lastTransactionId": checkoutID });
      
      if (user) {
        const amountPaid = Body.stkCallback.CallbackMetadata.Item[0].Value;
        let durationInDays = amountPaid >= 12000 ? 365 : 30;
        let planName = amountPaid >= 12000 ? "yearly" : "monthly";
  
        user.subscription.plan = planName;
        user.subscription.status = "active";
        user.subscription.startDate = new Date();
        user.subscription.endDate = new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000);
        
        await user.save();
      }
    }
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
};