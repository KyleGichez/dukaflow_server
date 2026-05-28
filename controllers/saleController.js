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

// Create sale (Handles multi-item customer shopping baskets) and updates stock
exports.createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, paymentMethod, date } = req.body;
    const businessId = req.user.businessId; 
    const userId = req.user?.id || req.user?._id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your customer shopping basket is empty" });
    }

    const processedSalesIds = [];

    for (const item of items) {
      const { productId, quantitySold } = item;

      // 1. Find product ensuring it belongs to this specific business workspace
      const product = await Product.findOne({ _id: productId, businessId }).session(session);
      if (!product) {
        throw new Error(`Product with ID ${productId} was not found in your workspace.`);
      }

      // 2. Check stock levels
      if (product.quantity < Number(quantitySold)) {
        throw new Error(`Insufficient stock for ${product.name}. Only ${product.quantity} items remaining.`);
      }

      // 3. Calculate Item Total Price
      const totalPrice = product.price * Number(quantitySold);

      // 4. Instantiate separate item sale record line
      const newSale = new Sale({
        productId,
        quantitySold: Number(quantitySold),
        unitPrice: product.price,
        totalPrice,
        paymentMethod,
        date: date || new Date(),
        businessId,
        soldBy: userId // Track who recorded the receipt
      });

      await newSale.save({ session });

      if (paymentMethod === "Credit") {
        await Credit.create({
          saleId: sale._id,
          customerName,
          customerPhone,
          totalAmount,
          amountPaid: 0,
          status: "PENDING",
          paymentHistory: [],
        });
      }

      // 5. Deduct inventory item stock 
      product.quantity -= Number(quantitySold);
      await product.save({ session });

      processedSalesIds.push(newSale._id);
    }

    await session.commitTransaction();
    session.endSession();

    const newlyCreatedSales = await Sale.find({ _id: { $in: processedSalesIds } })
      .populate("productId")
      .populate("soldBy", "fname").lean()
      .sort({ createdAt: -1 });

    res.status(201).json({ success: true, sales: newlyCreatedSales });

  } catch (error) {

    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }

  
};

exports.getSales = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    let startDate = getDateFilter(req.query.range);
    
    if (!(startDate instanceof Date)) startDate = new Date(startDate);

    const sales = await Sale.find({ 
        businessId, 
        date: { $gte: startDate } 
      })
      .populate("productId")
      .populate("soldBy", "fname").lean() // Populate the user who sold the item
      .sort({ date: -1 });
      
    res.json(sales);
  } catch (error) {
    console.error("GET SALES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // 1. Verify ownership
    const sale = await Sale.findOne({ _id: req.params.id, businessId });
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // 2. Restore stock only to the owner's product
    await Product.findOneAndUpdate(
      { _id: sale.productId, businessId }, 
      { $inc: { quantity: sale.quantitySold } }
    );

    // 3. Delete sale record
    await Sale.findOneAndDelete({ _id: req.params.id, businessId });

    res.json({ message: "Sale deleted and stock restored" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesSummary = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    
    // Validate businessId early
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
       return res.status(400).json({ message: "Invalid Business ID" });
    }

    const startDate = getDateFilter(req.query.range);

    const salesStats = await Sale.aggregate([
      { 
        $match: { 
          businessId: new mongoose.Types.ObjectId(businessId), 
          date: { $gte: startDate } 
        } 
      }, 
      {
        $facet: {
          "totals": [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalPrice" },
                totalItemsSold: { $sum: "$quantitySold" },
                totalTransactions: { $sum: 1 }
              }
            }
          ],
          "breakdown": [
            {
              $group: {
                _id: "$paymentMethod",
                amount: { $sum: "$totalPrice" }
              }
            }
          ]
        }
      }
    ]);

    const inventoryStats = await Product.aggregate([
      { $match: { businessId: new mongoose.Types.ObjectId(businessId) } }, 
      { 
        $group: { 
          _id: null, 
          totalStockValue: { $sum: { $multiply: ["$price", "$quantity"] } } 
        } 
      }
    ]);

    // Safely extract stats
    const stats = salesStats[0]?.totals[0] || { totalRevenue: 0, totalItemsSold: 0, totalTransactions: 0 };
    
    const paymentBreakdown = {};
    salesStats[0]?.breakdown?.forEach(item => {
      if (item._id) paymentBreakdown[item._id] = item.amount;
    });

    res.json({
      totalRevenue: stats.totalRevenue || 0,
      totalItemsSold: stats.totalItemsSold || 0,
      totalTransactions: stats.totalTransactions || 0,
      totalStockValue: inventoryStats[0]?.totalStockValue || 0,
      paymentBreakdown
    });

  } catch (error) {
    console.error("DETAILED SUMMARY ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};