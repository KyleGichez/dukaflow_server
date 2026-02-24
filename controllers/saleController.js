const Sale = require("../models/Sale");
const Product = require("../models/Product");

// Create sale and update stock
exports.createSale = async (req, res) => {
  try {
    const { productId, quantitySold, paymentMethod, date } = req.body;

    // 1. Find the product to get its price
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // 2. Check if enough stock exists
    if (product.quantity < quantitySold) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // 3. CALCULATE TOTAL PRICE
    const totalPrice = product.price * quantitySold;

    // 4. Create the sale with the calculated total
    const newSale = new Sale({
      productId,
      quantitySold,
      unitPrice: product.price,
      totalPrice, // Save it here
      paymentMethod,
      date
    });

    await newSale.save();

    // 5. Deduct stock from product
    product.quantity -= quantitySold;
    await product.save();

    // 6. Return populated sale so frontend sees product name/units immediately
    const populatedSale = await Sale.findById(newSale._id).populate("productId");
    res.status(201).json(populatedSale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSales = async (req, res) => {
  try {
    const startDate = getDateFilter(req.query.range);
    const sales = await Sale.find({ date: { $gte: startDate } })
                            .populate("productId")
                            .sort({ date: -1 }); // Newest first
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    // 1. Restore the stock to the product
    await Product.findByIdAndUpdate(sale.productId, {
      $inc: { quantity: sale.quantitySold }
    });

    // 2. Delete the sale record
    await Sale.findByIdAndDelete(req.params.id);

    res.json({ message: "Sale deleted and stock restored" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper to get date ranges
const getDateFilter = (range) => {
  const now = new Date();
  let startDate = new Date(0); // Default: All time

  if (range === 'today') {
    startDate = new Date(now.setHours(0, 0, 0, 0));
  } else if (range === 'this-week') {
    const first = now.getDate() - now.getDay();
    startDate = new Date(now.setDate(first));
    startDate.setHours(0,0,0,0);
  } else if (range === 'this-month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return startDate;
};

exports.getSalesSummary = async (req, res) => {
  try {
    const startDate = getDateFilter(req.query.range);

    const salesStats = await Sale.aggregate([
      // 1. Filter by date
      { $match: { date: { $gte: startDate } } }, 
      {
        $facet: {
          "totals": [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$totalPrice" },
                totalItemsSold: { $sum: "$quantitySold" },
                totalTransactions: { $sum: 1 } // Use $sum: 1 instead of $count
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

    // 2. Safely extract totals (handling empty array if no sales exist)
    const stats = salesStats[0]?.totals[0] || { 
      totalRevenue: 0, 
      totalItemsSold: 0, 
      totalTransactions: 0 
    };

    // 3. Process breakdown into an object: { "Cash": 500 }
    const paymentBreakdown = {};
    if (salesStats[0]?.breakdown) {
      salesStats[0].breakdown.forEach(item => {
        if (item._id) {
          paymentBreakdown[item._id] = item.amount;
        }
      });
    }

    // 4. Inventory stats
    const inventoryStats = await Product.aggregate([
      { 
        $group: { 
          _id: null, 
          totalStockValue: { $sum: { $multiply: ["$price", "$quantity"] } } 
        } 
      }
    ]);

    // 5. Final Response
    res.json({
      totalRevenue: stats.totalRevenue || 0,
      totalItemsSold: stats.totalItemsSold || 0,
      totalTransactions: stats.totalTransactions || 0,
      totalStockValue: inventoryStats[0]?.totalStockValue || 0,
      paymentBreakdown: paymentBreakdown
    });

  } catch (error) {
    // Log the actual error to your terminal so you can see it!
    console.error("DETAILED SUMMARY ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};  