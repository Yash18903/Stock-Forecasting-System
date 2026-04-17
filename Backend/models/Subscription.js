const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  paymentMethod: {
    type: String,
    required: true
  },
  transactionId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
SubscriptionSchema.index({ user: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1 });

// Static method to check if user has active subscription
SubscriptionSchema.statics.hasActiveSubscription = async function(userId) {
  const now = new Date();
  const subscription = await this.findOne({
    user: userId,
    status: 'active',
    endDate: { $gt: now }
  });
  
  return !!subscription;
};

module.exports = mongoose.model('Subscription', SubscriptionSchema);