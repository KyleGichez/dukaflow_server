const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middleware/authMiddleware"); 

// 2. Apply it to all routes in this router file
router.use(auth);

// GET all registered profiles for the active business strictly
router.get("/", (req, res) => {
    const businessId = req.user?.businessId; 

    // 🔒 GUARD 1: If there's no business ID on the session/token, reject instantly
    if (!businessId) {
        return res.status(401).json({ 
            message: "Unauthorized: Missing valid tenant business context." 
        });
    }

    db.all("SELECT * FROM customers WHERE businessId = ? ORDER BY name ASC", [businessId], (err, rows) => {
        if (err) {
            console.error("❌ GET /api/customers DB Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// POST register modal profiles inline scoped to active business
router.post("/", (req, res) => {
    const businessId = req.user?.businessId;

    // 🔒 GUARD 2: Reject immediately if tenant profile is absent
    if (!businessId) {
        return res.status(401).json({ 
            message: "Unauthorized: Cannot create a customer profile without a valid business context." 
        });
    }

    const { name, phone, email, creditLimit = 50000 } = req.body;

    if (!name) {
        return res.status(400).json({ message: "Customer Profile name is mandatory." });
    }

    const sql = `INSERT INTO customers (name, phone, email, creditLimit, currentDebt, businessId) VALUES (?, ?, ?, ?, 0, ?)`;
    
    db.run(sql, [name, phone || null, email || null, creditLimit, businessId], function (err) {
        if (err) {
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