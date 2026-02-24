const Product = require("../models/Product");
const Stock = require("../models/Stock");

exports.createProduct = async (req, res) => {
  try {
    const { name, category, price, quantity, units } = req.body;

    // 1. Create the Product
    const newProduct = await Product.create({
      name: name.trim(),
      category,
      price,
      quantity,
      units,
    });

    // 2. Automatically create an initial Stock entry
    // This ensures the Stock table shows this "opening stock"
    await Stock.create({
      name: newProduct.name,
      category: newProduct.category,
      quantityAdded: newProduct.quantity,
      units: newProduct.units,
      price: newProduct.price,
      date: new Date(), // Use current date for opening stock
      product: newProduct._id, // Link them via ID
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get All Products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { name, category, price, quantity, units } = req.body;
    const newTotal = Number(quantity);

    const oldProduct = await Product.findById(req.params.id);
    if (!oldProduct) return res.status(404).json({ message: "Product not found" });

    // 1. Update the Product balance
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { name, category, price, quantity: newTotal, units },
      { returnDocument: 'after', runValidators: true }
    );

    // 2. Update OR Create the Stock record
    // We search for a stock entry with the OLD name and update it to the NEW details
    await Stock.findOneAndUpdate(
      { name: oldProduct.name }, // Find the existing entry
      { 
        $set: { 
          name: name.trim(), 
          category, 
          price, 
          units, 
          quantityAdded: newTotal // Overwrite the quantity to the new total
        } 
      },
      { upsert: true } // If for some reason no stock record exists, create one
    );

    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const productToDelete = await Product.findById(req.params.id);
    if (!productToDelete) return res.status(404).json({ message: "Product not found" });

    // 1. Delete all Stock history for this product
    await Stock.deleteMany({ name: productToDelete.name });

    // 2. Delete the Product itself
    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: "Product and all related stock history deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
