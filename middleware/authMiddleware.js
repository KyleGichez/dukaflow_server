const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. Get token from the header (Format: Bearer <token>)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // 2. Verify the token using your JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Add the user data to the request object
    req.user = decoded;
    
    // 4. Move to the next function (the actual route)
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid or has expired" });
  }
};

module.exports = authMiddleware;