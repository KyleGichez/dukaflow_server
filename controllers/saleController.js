const Sale = require("../models/Sale");
const Product = require("../models/Product");
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

// Create sale and update stock
exports.createSale = async (req, res) => {
  try {
    const { productId, quantitySold, paymentMethod, date } = req.body;
    const ownerId = req.user.ownerId; // Extract from Auth Middleware

    // 1. Find product ensuring it belongs to this workspace
    const product = await Product.findOne({ _id: productId, ownerId });
    if (!product) return res.status(404).json({ message: "Product not found in your workspace" });

    // 2. Check stock
    if (product.quantity < quantitySold) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // 3. Calculate Total
    const totalPrice = product.price * quantitySold;

    // 4. Create sale with ownerId
    const newSale = new Sale({
      productId,
      quantitySold,
      unitPrice: product.price,
      totalPrice,
      paymentMethod,
      date,
      ownerId // Link to workspace
    });

    await newSale.save();

    // 5. Deduct stock (specifically for this product and owner)
    product.quantity -= quantitySold;
    await product.save();

    const populatedSale = await Sale.findById(newSale._id).populate("productId");
    res.status(201).json(populatedSale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSales = async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    let startDate = getDateFilter(req.query.range);
    
    // Ensure startDate is a Date object for MongoDB
    if (!(startDate instanceof Date)) startDate = new Date(startDate);

    const sales = await Sale.find({ 
        ownerId, 
        date: { $gte: startDate } 
      })
      .populate("productId")
      .sort({ date: -1 });
      
    res.json(sales);
  } catch (error) {
    console.error("GET SALES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const ownerId = req.user.ownerId;

    // 1. Verify ownership
    const sale = await Sale.findOne({ _id: req.params.id, ownerId });
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // 2. Restore stock only to the owner's product
    await Product.findOneAndUpdate(
      { _id: sale.productId, ownerId }, 
      { $inc: { quantity: sale.quantitySold } }
    );

    // 3. Delete sale record
    await Sale.findOneAndDelete({ _id: req.params.id, ownerId });

    res.json({ message: "Sale deleted and stock restored" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesSummary = async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    
    // Validate OwnerId early
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
       return res.status(400).json({ message: "Invalid Owner ID" });
    }

    const startDate = getDateFilter(req.query.range);

    const salesStats = await Sale.aggregate([
      { 
        $match: { 
          ownerId: new mongoose.Types.ObjectId(ownerId), 
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
      { $match: { ownerId: new mongoose.Types.ObjectId(ownerId) } }, 
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