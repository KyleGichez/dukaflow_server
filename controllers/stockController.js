const Stock = require("../models/Stock");
const Product = require("../models/Product");

// Create Stock
exports.createStock = async (req, res) => {
  try {
    const { date, category, name, quantityAdded, units, price } = req.body;
    const ownerId = req.user.ownerId; // Extract from Auth Middleware

    // 1. Create the Stock Entry linked to the owner
    const stockItem = await Stock.create({
      date,
      category,
      name: name.trim(),
      quantityAdded: Number(quantityAdded),
      units,
      price: Number(price),
      ownerId // Link to workspace
    });

    // 2. Sync to Product Table within the same workspace
    await Product.findOneAndUpdate(
      { name: name.trim(), ownerId }, // Search for name AND ownerId
      {
        $inc: { quantity: Number(quantityAdded) },
        $set: { 
          category: category,
          units: units,
          price: Number(price) 
        },
        $setOnInsert: { ownerId } // Ensure ownerId is set if product is newly created
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json(stockItem);
  } catch (error) {
    console.error("Sync Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

// Get all stock items for the workspace
exports.getStockItems = async (req, res) => {
  try {
    const stockItems = await Stock.find({ ownerId: req.user.ownerId });
    res.json(stockItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update stock
exports.updateStock = async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const newQuantity = Number(req.body.quantityAdded);
    const newPrice = Number(req.body.price);

    // 1. Fetch record ensuring it belongs to this owner
    const oldStock = await Stock.findOne({ _id: req.params.id, ownerId });
    if (!oldStock) return res.status(404).json({ message: "Stock not found in your workspace" });

    // 2. Calculate Difference
    const quantityDifference = newQuantity - oldStock.quantityAdded;

    // 3. Update the Stock record
    const updatedStock = await Stock.findOneAndUpdate(
      { _id: req.params.id, ownerId },
      { 
        ...req.body, 
        quantityAdded: newQuantity, 
        price: newPrice 
      },
      { new: true, runValidators: true }
    );

    // 4. Update the Product Table within the same workspace
    await Product.findOneAndUpdate(
      { name: oldStock.name, ownerId }, 
      { 
        $inc: { quantity: quantityDifference },
        $set: { 
          price: newPrice,
          category: req.body.category,
          units: req.body.units
        }
      }
    );

    res.json(updatedStock);
  } catch (error) {
    console.error("Update Error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Delete Stock
exports.deleteStock = async (req, res) => {
  try {
    const ownerId = req.user.ownerId;

    // 1. Find the stock within the workspace
    const stockToDelete = await Stock.findOne({ _id: req.params.id, ownerId });
    if (!stockToDelete) return res.status(404).json({ message: "Stock not found" });

    // 2. Subtract quantity from Product within the same workspace
    await Product.findOneAndUpdate(
      { name: stockToDelete.name, ownerId },
      { $inc: { quantity: -stockToDelete.quantityAdded } }
    );

    // 3. Delete the stock record
    await Stock.findOneAndDelete({ _id: req.params.id, ownerId });

    res.json({ message: "Stock deleted and Product quantity updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};