const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth'); // Make sure this import is correct
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// Get user subscription
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user || !user.subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }
    
    // Check if subscription is still active
    const now = new Date();
    const endDate = new Date(user.subscription.endDate);
    
    if (endDate < now) {
      // Update subscription status if expired
      user.subscription.isActive = false;
      await user.save();
      
      // Update subscription record
      await Subscription.findOneAndUpdate(
        { user: req.userId, status: 'active' },
        { status: 'expired' }
      );
    }
    
    res.json(user.subscription);
  } catch (error) {
    console.error('Subscription fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create subscription
router.post('/', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findById(req.userId);
    
    // Calculate subscription dates
    const startDate = new Date();
    let endDate = new Date();
    
    if (plan === 'weekly') {
      endDate.setDate(startDate.getDate() + 7);
    } else if (plan === 'monthly') {
      endDate.setMonth(startDate.getMonth() + 1);
    } else if (plan === 'yearly') {
      endDate.setFullYear(startDate.getFullYear() + 1);
    }
    
    // Update user subscription
    user.subscription = {
      plan,
      startDate,
      endDate,
      isActive: true
    };
    
    await user.save();
    
    // Create subscription record
    const subscription = new Subscription({
      user: req.userId,
      plan,
      startDate,
      endDate,
      status: 'active'
    });
    
    await subscription.save();
    
    res.json(user.subscription);
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Cancel subscription
router.post('/cancel', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user.subscription || !user.subscription.isActive) {
      return res.status(400).json({ message: 'No active subscription to cancel' });
    }
    
    // Update user subscription
    user.subscription.isActive = false;
    await user.save();
    
    // Update subscription record
    await Subscription.findOneAndUpdate(
      { user: req.userId, status: 'active' },
      { status: 'cancelled' }
    );
    
    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;