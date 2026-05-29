const Credit = require("../models/Credit");
const Sale = require("../models/Sale");
const mongoose = require("mongoose");

exports.createCredit = async (req, res) => {
  try {
    const credit = await Credit.create({
      ...req.body,
      amountPaid: req.body.amountPaid || 0,
      createdAt: new Date(),
    });

    res.status(201).json(credit);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create credit record",
      error: error.message,
    });
  }
};

exports.getCredits = async (req, res) => {
  try {
    const credits = await Credit.find()
      .populate("productId")
      .populate("saleId")
      .sort({ createdAt: -1 });

    res.status(200).json(credits);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch credits",
      error: error.message,
    });
  }
};

exports.getCreditById = async (req, res) => {
  try {
    const credit = await Credit.findById(req.params.id);

    if (!credit) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    res.status(200).json(credit);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching credit",
      error: error.message,
    });
  }
};

exports.updateCredit = async (req, res) => {
  try {
    const updated = await Credit.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
      }
    );

    if (!updated) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update credit",
      error: error.message,
    });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const { amount, nextPaymentDate, method } = req.body;

    // =========================
    // VALIDATE AMOUNT (STRICT)
    // =========================
    const paymentAmount = Number(amount);

    if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount",
      });
    }

    // =========================
    // FIND CREDIT
    // =========================
    const credit = await Credit.findById(req.params.id);

    if (!credit) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    // =========================
    // ENSURE SAFE DEFAULTS
    // =========================
    credit.paymentHistory = Array.isArray(credit.paymentHistory)
      ? credit.paymentHistory
      : [];

    const total = Number(credit.totalAmount || 0);
    const currentPaid = Number(credit.amountPaid || 0);

    const newPaid = currentPaid + paymentAmount;

    // =========================
    // PREVENT OVERPAYMENT
    // =========================
    if (newPaid > total) {
      return res.status(400).json({
        message: "Payment exceeds remaining balance",
      });
    }

    // =========================
    // UPDATE CREDIT VALUES
    // =========================
    credit.amountPaid = newPaid;
    credit.balance = total - newPaid;

    if (nextPaymentDate) {
      credit.nextPaymentDate = nextPaymentDate;
    }

    // =========================
    // PAYMENT HISTORY (SAFE PUSH)
    // =========================
    credit.paymentHistory.push({
      amount: paymentAmount,
      method: method || "Cash",
      date: new Date(),
    });

    // =========================
    // STATUS UPDATE (CLEAN LOGIC)
    // =========================
    if (credit.balance <= 0) {
      credit.status = "PAID";
    } else {
      credit.status = "PARTIAL";
    }

    await credit.save();

    // =========================
    // UPDATE RELATED SALE
    // =========================
    const sale = await Sale.findById(credit.saleId);

    if (sale) {
      sale.balance = credit.balance;

      if (credit.balance <= 0) {
        sale.paymentStatus = "Paid";
      } else {
        sale.paymentStatus = "Partial";
      }

      await sale.save();
    }

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      message:
        credit.balance <= 0
          ? "Credit fully cleared successfully"
          : "Payment added successfully",
      credit,
    });
  } catch (error) {
    console.error("ADD PAYMENT ERROR:", error);

    return res.status(500).json({
      message: "Failed to add payment",
      error: error.message,
    });
  }
};

exports.deleteCredit = async (req, res) => {
  try {
    const deleted = await Credit.findByIdAndDelete(
      req.params.id
    );

    if (!deleted) {
      return res.status(404).json({
        message: "Credit not found",
      });
    }

    res.status(200).json({
      message: "Credit deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete credit",
      error: error.message,
    });
  }
};

exports.getCreditPayments = async (req, res) => {
  try {
    const { range } = req.query;
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Default to start of today

    const now = new Date();

    // Handle range filtering conditions mirroring your sales engine
    if (range === "this-week") {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust to get Monday
      startDate = new Date(startDate.setDate(diff));
    } else if (range === "this-month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "all-time") {
      startDate = new Date(0); // Epoch time (returns everything)
    }
    // "today" keeps the default start of today

    // Fetch records where payment date is greater than or equal to the filtered start date
    // If your application tracks user-specific data, add a shop/user filter here: { shopId: req.user.shopId }
    const payments = await CreditPayment.find({
      date: { $gte: startDate, $lte: now }
    }).populate("customerId", "name"); // Optional styling populate

    res.status(200).json(payments);
  } catch (error) {
    console.error("Error in getCreditPayments backend:", error);
    res.status(500).json({ message: "Server error fetching repayments history", error: error.message });
  }
};