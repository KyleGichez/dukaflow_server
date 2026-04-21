const axios = require("axios");
const Business = require("../models/Business");

// Helper to get Safaricom OAuth Token
const getAccessToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  try {
    const res = await axios.get(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    return res.data.access_token;
  } catch (error) {
    console.error("TOKEN ERROR:", error.response?.data || error.message);
    throw new Error("Failed to get M-Pesa access token");
  }
};

// Trigger the STK Push
exports.stkPush = async (req, res) => {
  const { phone, amount, plan } = req.body;
  const businessId = req.user?.businessId;

  try {
    const token = await getAccessToken();

    // Format phone to 2547XXXXXXXX
    const formattedPhone = phone.startsWith("0")
      ? "254" + phone.slice(1)
      : phone;

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      process.env.MPESA_SHORTCODE +
        process.env.MPESA_PASSKEY +
        timestamp
    ).toString("base64");

    const response = await axios.post(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline", // Keep this for Paybill
        Amount: Number(amount),
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: "DukaFlow Software",
        TransactionDesc: `Subscription for ${plan}`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // Save transaction reference
    if (businessId) {
      await Business.findByIdAndUpdate(businessId, {
        "subscription.lastTransactionId":
          response.data.CheckoutRequestID,
      });
    }

    res.status(200).json({
      message: "STK Push sent successfully",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "STK PUSH ERROR:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: error.message,
      details: error.response?.data,
    });
  }
};

// M-pesa Callback
exports.mpesaCallback = async (req, res) => {
  try {
    if (!req.body.Body || !req.body.Body.stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: "Ignored" });
    }

    const result = req.body.Body.stkCallback;

    if (result.ResultCode === 0) {
      const checkoutID = result.CheckoutRequestID;

      const business = await Business.findOne({
        "subscription.lastTransactionId": checkoutID,
      });

      if (business) {
        const amountItem = result.CallbackMetadata.Item.find(
          (i) => i.Name === "Amount"
        );

        const amountPaid = amountItem?.Value || 0;

        business.subscription.status = "active";
        business.subscription.plan =
          amountPaid >= 30000 ? "yearly" : "monthly";
        business.subscription.startDate = new Date();
        business.subscription.endDate = new Date(
          Date.now() +
            (amountPaid >= 30000 ? 365 : 30) *
              24 *
              60 *
              60 *
              1000
        );

        await business.save();

        console.log(
          `Subscription activated for ${business.email}`
        );
      }
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    console.error("CALLBACK ERROR:", error.message);

    res.json({ ResultCode: 0, ResultDesc: "Handled" });
  }
};
