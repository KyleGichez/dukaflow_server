const express = require('express');
const router = express.Router();
const { signup, login, updateSettings } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');

// POST http://localhost:5000/api/auth/signup
router.post('/signup', signup);

// POST http://localhost:5000/api/auth/login
router.post('/login', login);

router.put("/settings", auth, updateSettings);

module.exports = router;