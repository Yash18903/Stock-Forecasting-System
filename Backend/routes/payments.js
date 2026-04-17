const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// Process payment
router.post('/process', auth, async (req, res) => {
  try {
    const { plan, paymentMethod, amount, paymentDetails } = req.body;
    const userId = req.userId;

    console.log('Processing payment for user:', userId, 'plan:', plan, 'amount:', amount);

    // In a real application, you would integrate with a payment gateway
    // This is mock payment processing for demonstration

    // Generate a mock transaction ID
    const transactionId = 'txn_' + Math.random().toString(36).substr(2, 9);

    // Calculate subscription end date based on plan
    const startDate = new Date();
    let endDate = new Date();

    if (plan === 'weekly') {
      endDate.setDate(startDate.getDate() + 7);
    } else if (plan === 'monthly') {
      endDate.setMonth(startDate.getMonth() + 1);
    } else if (plan === 'yearly') {
      endDate.setFullYear(startDate.getFullYear() + 1);
    }

    // Update user's subscription in database
    const user = await User.findByIdAndUpdate(
      userId,
      {
        subscription: {
          plan,
          startDate,
          endDate,
          isActive: true,
          amountPaid: amount
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create subscription record
    const subscription = new Subscription({
      user: userId,
      plan,
      amount,
      startDate,
      endDate,
      status: 'active',
      paymentMethod,
      transactionId
    });

    await subscription.save();

    console.log('Payment processed successfully for user:', userId, 'transaction:', transactionId);

    res.json({
      success: true,
      message: 'Payment processed successfully',
      subscription: {
        plan,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isActive: true,
        amountPaid: amount
      },
      transactionId
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ message: 'Payment processing failed', error: error.message });
  }
});

// Verify payment status
router.get('/verify/:paymentId', auth, async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    
    // In a real app, verify with your payment gateway
    // For now, we'll check our subscription records
    const subscription = await Subscription.findOne({ transactionId: paymentId });
    
    if (!subscription) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    res.json({ 
      status: subscription.status,
      verified: subscription.status === 'active',
      subscription
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
});

// Get user's payment history
router.get('/history', auth, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ user: req.userId })
      .sort({ createdAt: -1 });
    
    res.json(subscriptions);
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ message: 'Failed to fetch payment history', error: error.message });
  }
});

module.exports = router;