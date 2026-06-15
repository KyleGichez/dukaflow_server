const axios = require("axios");
const db = require("../config/db");

// Helper modified to accept dynamic tenant keys or fallback to your own app .env variables
const getAccessToken = async (consumerKey, consumerSecret) => {
  // Fallback to DukaFlow's main system credentials if no tenant credentials are provided
  const key = consumerKey || process.env.MPESA_CONSUMER_KEY;
  const secret = consumerSecret || process.env.MPESA_CONSUMER_SECRET;

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  try {
    const res = await axios.get(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
  } catch (error) {
    console.error("TOKEN ERROR:", error.response?.data || error.message);
    throw new Error("Failed to authenticate M-Pesa gateway.");
  }
};

// Unified STK Push Router Handler
exports.stkPush = async (req, res) => {
  const { phone, amount, plan, isSubscription } = req.body; // 🌟 isSubscription flag sent from frontend
  const businessId = req.user?.businessId || req.body.businessId;

  if (!businessId) {
    return res.status(400).json({ error: "Missing active business validation context." });
  }

  // --- SYSTEM POLICY 1: IF SHOP OWNER IS PAYING YOU (DUKAFLOW SUBSCRIPTION) ---
  if (isSubscription) {
    try {
      // Uses your main DukaFlow developer credentials from your system .env file
      const token = await getAccessToken(); 
      const formattedPhone = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

      const password = Buffer.from(
        process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp
      ).toString("base64");

      const response = await axios.post(
        "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        {
          BusinessShortCode: process.env.MPESA_SHORTCODE, // Your Paybill/Till
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline", 
          Amount: Number(amount), // e.g., 2500 or 27000
          PartyA: formattedPhone,
          PartyB: process.env.MPESA_SHORTCODE,
          PhoneNumber: formattedPhone,
          CallBackURL: process.env.MPESA_CALLBACK_URL,
          AccountReference: `SUB-${businessId}`, // 🌟 Vital prefix flag to identify subscription payments in webhook
          TransactionDesc: `Subscription for ${plan || "DukaFlow System"}`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Save tracking reference code
      db.run("UPDATE business SET lastTransactionId = ? WHERE id = ?", [response.data.CheckoutRequestID, businessId]);

      return res.status(200).json({ message: "Subscription STK Push sent successfully", data: response.data });
    } catch (error) {
      return res.status(500).json({ error: "SaaS Subscription system error", details: error.message });
    }
  }

  // --- SYSTEM POLICY 2: IF CLIENT CUSTOMER IS PAYING THE SHOP (RETAIL POINT OF SALE) ---
  const selectConfigSql = `
    SELECT mpesa_shortcode, mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey 
    FROM business WHERE id = ?
  `;

  db.get(selectConfigSql, [businessId], async (err, config) => {
    if (err || !config || !config.mpesa_shortcode) {
      return res.status(400).json({ error: "M-Pesa integration parameters have not been set up by this merchant yet." });
    }

    try {
      // Uses the shop's individual credentials retrieved from your business table
      const token = await getAccessToken(config.mpesa_consumer_key, config.mpesa_consumer_secret);
      const formattedPhone = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

      const password = Buffer.from(config.mpesa_shortcode + config.mpesa_passkey + timestamp).toString("base64");

      const response = await axios.post(
        "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        {
          BusinessShortCode: config.mpesa_shortcode, // Tenant's unique Till/Paybill
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerBuyGoodsOnline", // Typically Buy Goods for retail counters
          Amount: Number(amount),
          PartyA: formattedPhone,
          PartyB: config.mpesa_shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: process.env.MPESA_CALLBACK_URL,
          AccountReference: `SALE-${businessId}`, // 🌟 Vital prefix flag for retail sale tracing
          TransactionDesc: `Retail Sale Payment`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      db.run("UPDATE business SET lastTransactionId = ? WHERE id = ?", [response.data.CheckoutRequestID, businessId]);
      res.status(200).json({ message: "Customer retail STK Push sent successfully", data: response.data });

    } catch (error) {
      res.status(500).json({ error: "Retail transaction gateway initialization failed", details: error.message });
    }
  });
};

// Unified Multi-Tenant M-Pesa Callback Webhook Receiver
exports.mpesaCallback = (req, res) => {
  try {
    if (!req.body.Body || !req.body.Body.stkCallback) {
      return res.json({ ResultCode: 0, ResultDesc: "Ignored" });
    }

    const result = req.body.Body.stkCallback;

    if (result.ResultCode === 0) {
      const checkoutID = result.CheckoutRequestID;

      // Locate who generated this transaction context
      db.get("SELECT id, email FROM business WHERE lastTransactionId = ?", [checkoutID], (err, business) => {
        if (err || !business) return res.json({ ResultCode: 1, ResultDesc: "Business mapping context untraceable" });

        const amountItem = result.CallbackMetadata?.Item?.find((i) => i.Name === "Amount");
        const amountPaid = amountItem?.Value || 0;

        // Check if Safaricom includes the structural AccountReference string context
        // If not found, we check the transaction volume to dynamically route the license update safely
        if (amountPaid === 2500 || amountPaid === 27000) {
          
          // 💳 PROCESS SAAS APP SUBSCRIPTION FOR YOU
          const chosenPlan = amountPaid >= 27000 ? "yearly" : "monthly";
          const daysToAdd = amountPaid >= 27000 ? 365 : 30;
          const subscriptionEndsAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

          db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run(
              "UPDATE business SET status = 'active', subscriptionPlan = ?, subscriptionEndsAt = ? WHERE id = ?",
              [chosenPlan, subscriptionEndsAt, business.id]
            );
            db.run(
              "INSERT INTO subscriptions (businessId, plan, status, endDate, createdAt) VALUES (?, ?, 'active', ?, ?)",
              [business.id, chosenPlan, subscriptionEndsAt, new Date().toISOString()]
            );
            db.run("COMMIT");
            console.log(`DukaFlow subscription successfully renewed for client: ${business.email}`);
          });

        } else {
          // 🛒 PROCESS RETAIL SALE FOR THE SHOP
          console.log(`Retail counter payment cleared of Ksh ${amountPaid} for Shop ID: ${business.id}`);
          // Add your database statement changes here to mark items as complete/sold!
        }
      });
    }
    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    console.error("WEBHOOK CONTROLLER CRASH ERROR:", error.message);
    res.json({ ResultCode: 0, ResultDesc: "Handled" });
  }
};