const axios = require("axios");
const db = require("../config/db");

// Helper to acquire Safaricom OAuth Gateway Token
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

// 1. Trigger the STK Push Payment Request
exports.stkPush = async (req, res) => {
  const { phone, amount, plan } = req.body;
  const businessId = req.user?.businessId;

  try {
    const token = await getAccessToken();

    // Format phone number uniformly to regional structures (2547XXXXXXXX)
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
        TransactionType: "CustomerPayBillOnline",
        Amount: Number(amount),
        PartyA: formattedPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: "DukaFlow",
        TransactionDesc: `Subscription for ${plan}`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const checkoutRequestID = response.data.CheckoutRequestID;

    // Cache the execution checkout token to identify the business callback
    if (businessId) {
      const sql = "UPDATE businesses SET lastTransactionId = ? WHERE id = ?";
      db.run(sql, [checkoutRequestID, businessId], function (err) {
        if (err) {
          console.error("SQL Error saving M-Pesa checkout token reference:", err.message);
        }
      });
    }

    res.status(200).json({
      message: "STK Push sent successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("STK PUSH ERROR:", error.response?.data || error.message);

    res.status(500).json({
      error: error.message,
      details: error.response?.data,
    });
  }
};

// 2. M-Pesa Webhook Callback Receiver
exports.mpesaCallback = (req, res) => {
  try {
    if (!req.body.Body || !req.body.Body.stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: "Ignored" });
    }

    const result = req.body.Body.stkCallback;

    if (result.ResultCode === 0) {
      const checkoutID = result.CheckoutRequestID;

      // Locate the matching workspace reference using the transaction key
      const selectSql = "SELECT id, email FROM businesses WHERE lastTransactionId = ?";
      db.get(selectSql, [checkoutID], (err, business) => {
        if (err || !business) {
          console.error("Callback matching failed: Business reference not found locally.");
          return;
        }

        const amountItem = result.CallbackMetadata?.Item?.find((i) => i.Name === "Amount");
        const amountPaid = amountItem?.Value || 0;

        // Compute local workspace access constraints extension lengths
        // Standard rate thresholds: >= 27000 indicates a full yearly license validation period
        const chosenPlan = amountPaid >= 27000 ? "yearly" : "monthly";
        const daysToAdd = amountPaid >= 27000 ? 365 : 30;
        
        const subscriptionEndsAt = new Date(
          Date.now() + daysToAdd * 24 * 60 * 60 * 1000
        ).toISOString();

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          // Update the local Business subscription profile status mapping targets
          const updateBusinessSql = `
            UPDATE businesses 
            SET status = 'active', subscriptionPlan = ?, subscriptionEndsAt = ?
            WHERE id = ?
          `;
          db.run(updateBusinessSql, [chosenPlan, subscriptionEndsAt, business.id], function (businessErr) {
            if (businessErr) {
              db.run("ROLLBACK");
              console.error("Failed handling callback business modifications:", businessErr.message);
              return;
            }

            // Sync and log an audit tracking trail record inside the licensing table
            const insertSubSql = `
              INSERT INTO subscriptions (businessId, plan, status, endDate, createdAt)
              VALUES (?, ?, 'active', ?, ?)
            `;
            const currentIsoDate = new Date().toISOString();
            const subParams = [business.id, chosenPlan, subscriptionEndsAt, currentIsoDate];

            db.run(insertSubSql, subParams, function (subErr) {
              if (subErr) {
                db.run("ROLLBACK");
                console.error("Failed capturing callback license logging histories:", subErr.message);
                return;
              }

              db.run("COMMIT");
              console.log(`Subscription activated and logged for ${business.email || 'Workspace ID ' + business.id}`);
            });
          });
        });
      });
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    console.error("CALLBACK ERROR:", error.message);
    res.json({ ResultCode: 0, ResultDesc: "Handled" });
  }
};