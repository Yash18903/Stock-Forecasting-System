const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if user has active subscription
const requireSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user.subscription || !user.subscription.isActive) {
      return res.status(403).json({ 
        message: 'Premium subscription required to access this feature' 
      });
    }
    
    // Check if subscription is still valid
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    
    if (endDate < now) {
      // Subscription has expired
      user.subscription.isActive = false;
      await user.save();
      
      return res.status(403).json({ 
        message: 'Your subscription has expired. Please renew to access premium features.' 
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { auth, requireSubscription };