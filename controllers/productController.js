const Product = require("../models/Product");
const Stock = require("../models/Stock");

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const { name, category, price, quantity, units } = req.body;
    const businessId = req.user.businessId; // Extracted from JWT middleware

    // 1. Create the Product with ownerId
    const newProduct = await Product.create({
      name: name.trim(),
      category,
      price,
      quantity,
      units,
      businessId, // Link to the workspace
    });

    // 2. Create initial Stock entry with ownerId
    await Stock.create({
      name: newProduct.name,
      category: newProduct.category,
      quantityAdded: newProduct.quantity,
      units: newProduct.units,
      price: newProduct.price,
      date: new Date(),
      product: newProduct._id,
      businessId, // Link to the workspace
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get All Products (Scoped to ownerId)
exports.getProducts = async (req, res) => {
  try {
    // Only fetch products belonging to this workspace
    const products = await Product.find({ businessId: req.user.businessId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const { name, category, price, quantity, units } = req.body;
    const ownerId = req.user.ownerId;
    const productId = req.params.id;

    // 1. Find the product and ensure it belongs to this owner
    const oldProduct = await Product.findOne({ _id: productId, businessId });
    if (!oldProduct) return res.status(404).json({ message: "Product not found in your workspace" });

    const newTotal = Number(quantity);

    // 2. Update the Product balance
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, businessId }, // Safety check: must match businessId
      { name: name.trim(), category, price, quantity: newTotal, units },
      { new: true, runValidators: true }
    );

    // 3. Update the Stock record (Scope by product ID and businessId)
    await Stock.findOneAndUpdate(
      { product: productId, businessId }, 
      { 
        $set: { 
          name: name.trim(), 
          category, 
          price, 
          units, 
          quantityAdded: newTotal 
        } 
      },
      { upsert: true }
    );

    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const productId = req.params.id;

    // 1. Verify ownership before deleting
    const productToDelete = await Product.findOne({ _id: productId, businessId });
    if (!productToDelete) return res.status(404).json({ message: "Product not found" });

    // 2. Delete all Stock history for this product within this workspace
    await Stock.deleteMany({ product: productId, businessId });

    // 3. Delete the Product itself
    await Product.findOneAndDelete({ _id: productId, businessId });

    res.json({ message: "Product and all related stock history deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};