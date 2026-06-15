const express = require("express");
const router = express.Router();
const db = require("../config/db");

// GET all registered profiles 
router.get("/", (req, res) => {
    const businessId = req.user?.businessId || 1; 
    db.all("SELECT * FROM customers WHERE businessId = ? ORDER BY name ASC", [businessId], (err, rows) => {
        if (err) {
            console.error("❌ GET /api/customers DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// POST register modal profiles inline
router.post("/", (req, res) => {
    const businessId = req.user?.businessId || 1;
    const { name, phone, email, creditLimit = 50000 } = req.body;

    if (!name) return res.status(400).json({ message: "Customer Profile name is mandatory." });

    const sql = `INSERT INTO customers (name, phone, email, creditLimit, currentDebt, businessId) VALUES (?, ?, ?, ?, 0, ?)`;
    
    db.run(sql, [name, phone || null, email || null, creditLimit, businessId], function (err) {
        if (err) {
            // 💡 THIS WILL PRINT THE EXACT SQLITE FAILURE REASON IN YOUR SERVER TERMINAL
            console.error("❌ POST /api/customers DB Insertion Error:", err.message);
            return res.status(500).json({ 
                message: "Database insertion failed. Verify foreign key records exist.", 
                error: err.message 
            });
        }
        
        res.status(201).json({
            id: this.lastID,
            name,
            phone,
            email,
            creditLimit,
            currentDebt: 0,
            businessId
        });
    });
});

module.exports = router;