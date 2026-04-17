const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    // Make phone optional for Google OAuth users
    required: function() {
      return !this.googleId; // Only required for non-Google users
    }
  },
  password: {
    type: String,
    minlength: 6,
    // Make password optional for Google OAuth users
    required: function() {
      return !this.googleId; // Only required for non-Google users
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  googleId: {
    type: String,
    sparse: true
  },
  // Add OTP fields for phone verification
  otp: {
    type: String,
    select: false
  },
  otpExpires: {
    type: Date,
    select: false
  },
  subscription: {
    plan: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly']
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: false
    },
    amountPaid: Number
  }
}, {
  timestamps: true
});

// Hash password before saving (only if password is modified)
UserSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new) and not empty
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method (only for local authentication)
UserSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  // If user signed up with Google, they don't have a password
  if (!userPassword) return false;
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Check if user has active subscription
UserSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription || !this.subscription.isActive) return false;
  
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  return endDate > now;
};

module.exports = mongoose.model('User', UserSchema);