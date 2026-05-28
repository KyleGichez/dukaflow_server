const Credit = require("../models/Credit");
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
    // Populate product fields so frontend credit.productId?.name works out-of-the-box
    const credits = await Credit.find()
      .populate("productId")
      .sort({ createdAt: -1 });
    res.status(200).json(credits);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch credits", error: error.message });
  }
};

exports.getCreditById = async (req, res) => {
  try {
    const credit = await Credit.findById(req.params.id);

    if (!credit) {
      return res.status(404).json({ message: "Credit not found" });
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
    const updated = await Credit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Credit not found" });
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

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const credit = await Credit.findById(req.params.id);

    if (!credit) {
      return res.status(404).json({ message: "Credit not found" });
    }

    const total = credit.totalAmount || 0;
    const currentPaid = credit.amountPaid || 0;

    const newPaid = currentPaid + Number(amount);

    if (newPaid > total) {
      return res.status(400).json({
        message: "Payment exceeds remaining balance",
      });
    }

    // ✅ update payment
    credit.amountPaid = newPaid;

    // ✅ update balance (IMPORTANT)
    credit.balance = total - newPaid;

    // ✅ update next payment date (THIS WAS MISSING)
    if (nextPaymentDate) {
      credit.nextPaymentDate = nextPaymentDate;
    }

    // ✅ payment history (CRITICAL FOR TRACKING)
    credit.paymentHistory.push({
      amount: Number(amount),
      method: method || "Cash",
      date: new Date(),
    });

    // ✅ status update
    credit.status =
      newPaid >= total ? "CLEARED" : newPaid > 0 ? "PARTIAL" : "PENDING";

    await credit.save();

    res.status(200).json(credit);
  } catch (error) {
    res.status(500).json({
      message: "Failed to add payment",
      error: error.message,
    });
  }
};

exports.deleteCredit = async (req, res) => {
  try {
    const deleted = await Credit.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Credit not found" });
    }

    res.status(200).json({ message: "Credit deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete credit",
      error: error.message,
    });
  }
};
