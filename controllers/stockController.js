const Stock = require("../models/Stock");
const Product = require("../models/Product");

exports.createStock = async (req, res) => {
  try {
    // 1. Extract price from the body
    const { date, category, name, quantityAdded, units, price } = req.body;

    // 2. Create the Stock Entry
    const stockItem = await Stock.create({
      date,
      category,
      name,
      quantityAdded,
      units,
      price: Number(price) // Ensure it's a number
    });

    // 3. Sync to Product Table
    // If the product name exists, we increment quantity and update price/category.
    // If it doesn't exist, we create it using all the fields below.
    await Product.findOneAndUpdate(
      { name: name.trim() },
      {
        $inc: { quantity: Number(quantityAdded) },
        $set: { 
          category: category,
          units: units,
          price: Number(price) // This fixes the "required: true" error!
        }
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    res.status(201).json(stockItem);
  } catch (error) {
    console.error("Sync Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};
// Get all stock items
exports.getStockItems = async (req, res) => {
  try {
    const stockItems = await Stock.find();
    res.json(stockItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update stock
exports.updateStock = async (req, res) => {
  try {
    // 1. Force everything to be a Number
    const newQuantity = Number(req.body.quantityAdded);
    const newPrice = Number(req.body.price);

    // 2. Fetch the existing record from the database
    const oldStock = await Stock.findById(req.params.id);
    if (!oldStock) return res.status(404).json({ message: "Stock not found" });

    // 3. CALCULATE DIFFERENCE: (New - Old)
    // Example: Old was 10, New is 15. Difference = +5 (Adds 5 to Product)
    // Example: Old was 10, New is 4. Difference = -6 (Subtracts 6 from Product)
    const quantityDifference = newQuantity - oldStock.quantityAdded;

    // 4. Update the Stock record
    const updatedStock = await Stock.findByIdAndUpdate(
      req.params.id,
      { 
        ...req.body, 
        quantityAdded: newQuantity, 
        price: newPrice 
      },
      { returnDocument: 'after', runValidators: true }
    );

    // 5. Update the Product Table
    await Product.findOneAndUpdate(
      { name: oldStock.name }, 
      { 
        $inc: { quantity: quantityDifference }, // This handles both adding and subtracting
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
    // 1. Find the stock to know which product and how much quantity to remove
    const stockToDelete = await Stock.findById(req.params.id);
    if (!stockToDelete) return res.status(404).json({ message: "Stock not found" });

    // 2. Subtract the quantity from the Product table
    await Product.findOneAndUpdate(
      { name: stockToDelete.name },
      { $inc: { quantity: -stockToDelete.quantityAdded } }
    );

    // 3. Delete the stock record
    await Stock.findByIdAndDelete(req.params.id);

    res.json({ message: "Stock deleted and Product quantity updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 