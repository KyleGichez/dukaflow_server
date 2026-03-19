const authorize = (roles = []) => {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ 
          message: `Access Denied: ${req.user.role}s cannot perform this action.` 
        });
      }
      next();
    };
  };
  
  module.exports = authorize;