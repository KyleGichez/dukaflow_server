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
    // VALIDATE AMOUNT
    // =========================

    if (!amount || Number(amount) <= 0) {
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

    const total = Number(credit.totalAmount || 0);
    const currentPaid = Number(credit.amountPaid || 0);

    const paymentAmount = Number(amount);

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
    // UPDATE CREDIT
    // =========================

    credit.amountPaid = newPaid;

    credit.balance = total - newPaid;

    if (nextPaymentDate) {
      credit.nextPaymentDate = nextPaymentDate;
    }

    // =========================
    // PAYMENT HISTORY
    // =========================

    credit.paymentHistory.push({
      amount: paymentAmount,
      method: method || "Cash",
      date: new Date(),
    });

    // =========================
    // CREDIT STATUS
    // =========================

    if (credit.balance <= 0) {
      credit.status = "PAID";
    } else if (newPaid > 0) {
      credit.status = "PARTIAL";
    } else {
      credit.status = "PENDING";
    }

    await credit.save();

    // =========================
    // UPDATE SALE STATUS TOO
    // =========================

    const sale = await Sale.findById(credit.saleId);

    if (sale) {
      sale.balance = credit.balance;

      if (credit.balance <= 0) {
        sale.paymentStatus = "Paid";
      } else if (newPaid > 0) {
        sale.paymentStatus = "Partial";
      } else {
        sale.paymentStatus = "Pending";
      }

      await sale.save();
    }

    // =========================
    // RESPONSE
    // =========================

    res.status(200).json({
      success: true,
      message:
        credit.balance <= 0
          ? "Credit fully cleared successfully"
          : "Payment added successfully",

      credit,
    });
  } catch (error) {
    console.error("ADD PAYMENT ERROR:", error);

    res.status(500).json({
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