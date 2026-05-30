const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Credit = require("../models/Credit");
const mongoose = require("mongoose");

function getDateFilter(range) {
  const now = new Date();
  let startDate = new Date();

  switch (range) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;

    case "this-week":
      startDate.setDate(now.getDate() - 7);
      break;

    case "this-month":
      startDate.setMonth(now.getMonth() - 1);
      break;

    case "all-time":
      return new Date(0);

    default:
      return new Date(0);
  }

  return startDate;
}

exports.createSale = async (req, res) => {
  const {
    items,
    paymentMethod,
    date,
    customerName,
    customerPhone,
    amountPaid = 0,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const businessId = req.user.businessId;
    const userId = req.user?.id || req.user?._id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Your customer shopping basket is empty",
      });
    }

    const processedSalesIds = [];

    const enrichedItems = [];

    let totalAmount = 0;

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        businessId,
      }).session(session);

      product.quantity -= Number(item.quantitySold);
      await product.save({ session });

      if (!product) throw new Error("Product not found");

      if (product.quantity < Number(item.quantitySold)) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      const itemTotal = product.price * Number(item.quantitySold);

      enrichedItems.push({
        productId: item.productId,
        quantitySold: Number(item.quantitySold),
        unitPrice: product.price,
        totalPrice: itemTotal,
      });

      totalAmount += itemTotal;
    }

    const paid = Number(amountPaid || 0);
    const balance = totalAmount - paid;

    let paymentStatus;

    if (balance <= 0) paymentStatus = "Paid";
    else if (paid > 0) paymentStatus = "Partial";
    else paymentStatus = "Pending";

    const newSale = new Sale({
      items: enrichedItems,
      totalPrice: totalAmount,
      paymentMethod,
      paymentStatus,
      amountPaid: paid,
      balance,
      date: date || new Date(),
      businessId,
      soldBy: userId,
    });

    await newSale.save({ session });

    processedSalesIds.push(newSale._id);

    if (paymentMethod === "Credit") {
      await Credit.create({
        saleId: newSale._id,
        customerName,
        customerPhone,
        totalAmount,
        amountPaid: paid,
        balance,
        status: paymentStatus.toUpperCase(),
        paymentHistory: paid > 0 ? [{
          amount: paid,
          method: paymentMethod,
          date: new Date(),
        }] : [],
      });
    }

    await session.commitTransaction();
    session.endSession();

    const newlyCreatedSales = await Sale.find({
      _id: { $in: processedSalesIds },
    })
      .populate("productId")
      .populate("soldBy", "fname")
      .lean()
      .sort({ createdAt: -1 });

    res.status(201).json({
      success: true,
      sales: newlyCreatedSales,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("CREATE SALE ERROR:", error);
    res.status(400).json({
      message: error.message,
    });
  }
};

exports.getSales = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    let startDate = getDateFilter(req.query.range);

    if (!(startDate instanceof Date)) {
      startDate = new Date(startDate);
    }

    const sales = await Sale.find({
      businessId,
      date: { $gte: startDate },
    })
      .populate("productId")
      .populate("soldBy", "fname")
      .lean()
      .sort({ date: -1 });

    res.json(sales);
  } catch (error) {
    console.error("GET SALES ERROR:", error);

    res.status(500).json({
      message: error.message,
    });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // VERIFY OWNERSHIP
    const sale = await Sale.findOne({
      _id: req.params.id,
      businessId,
    });

    if (!sale) {
      return res.status(404).json({
        message: "Sale not found",
      });
    }

    // RESTORE STOCK
    await Product.findOneAndUpdate(
      {
        _id: sale.productId,
        businessId,
      },
      {
        $inc: {
          quantity: sale.quantitySold,
        },
      }
    );

    // DELETE CREDIT RECORD IF EXISTS
    await Credit.findOneAndDelete({
      saleId: sale._id,
    });

    // DELETE SALE
    await Sale.findOneAndDelete({
      _id: req.params.id,
      businessId,
    });

    res.json({
      message: "Sale deleted and stock restored",
    });
  } catch (error) {
    console.error("DELETE SALE ERROR:", error);

    res.status(500).json({
      message: error.message,
    });
  }
};

exports.getSalesSummary = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({
        message: "Invalid Business ID",
      });
    }

    const startDate = getDateFilter(req.query.range);

    const salesStats = await Sale.aggregate([
      {
        $match: {
          businessId: new mongoose.Types.ObjectId(businessId),
          date: { $gte: startDate },
        },
      },

      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,

                totalRevenue: {
                  $sum: "$totalPrice",
                },

                totalItemsSold: {
                  $sum: "$quantitySold",
                },

                totalTransactions: {
                  $sum: 1,
                },
              },
            },
          ],

          breakdown: [
            {
              $group: {
                _id: "$paymentMethod",

                amount: {
                  $sum: "$totalPrice",
                },
              },
            },
          ],
        },
      },
    ]);

    const inventoryStats = await Product.aggregate([
      {
        $match: {
          businessId: new mongoose.Types.ObjectId(businessId),
        },
      },

      {
        $group: {
          _id: null,

          totalStockValue: {
            $sum: {
              $multiply: ["$price", "$quantity"],
            },
          },
        },
      },
    ]);

    const stats = salesStats[0]?.totals[0] || {
      totalRevenue: 0,
      totalItemsSold: 0,
      totalTransactions: 0,
    };

    const paymentBreakdown = {};

    salesStats[0]?.breakdown?.forEach((item) => {
      if (item._id) {
        paymentBreakdown[item._id] = item.amount;
      }
    });

    res.json({
      totalRevenue: stats.totalRevenue || 0,
      totalItemsSold: stats.totalItemsSold || 0,
      totalTransactions: stats.totalTransactions || 0,
      totalStockValue: inventoryStats[0]?.totalStockValue || 0,
      paymentBreakdown,
    });
  } catch (error) {
    console.error("DETAILED SUMMARY ERROR:", error);

    res.status(500).json({
      message: error.message,
    });
  }
};
