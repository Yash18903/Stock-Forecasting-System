const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const twilio = require('twilio');

const router = express.Router();

// Initialize Twilio client (if credentials are available)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Function to send OTP via SMS
const sendOTPSMS = async (phoneNumber, otp) => {
  try {
    // If Twilio is not configured, just log the OTP
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
      console.log(`OTP for ${phoneNumber}: ${otp}`);
      return true;
    }
    
    // Format phone number to E.164 format
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+91${phoneNumber}`; // Default to Indian numbers
    
    const message = await twilioClient.messages.create({
      body: `Your StockZen verification code is: ${otp}. This code will expire in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    console.log(`OTP sent to ${formattedPhone}: ${message.sid}`);
    return true;
  } catch (error) {
    console.error('Error sending OTP via SMS:', error);
    // Fallback to console log
    console.log(`OTP for ${phoneNumber}: ${otp}`);
    return true;
  }
};

// Google OAuth routes
router.get('/google', (req, res, next) => {
  // Store the redirect URL in the session or state parameter
  const redirectUrl = req.query.redirect || '/dashboard';
  
  console.log('Initiating Google OAuth with redirect:', redirectUrl);
  
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Google OAuth not configured. Missing client ID or secret.');
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_not_configured`);
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: redirectUrl // Pass the redirect URL as state
  })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { 
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_auth_failed`,
      session: false 
    })(req, res, next);
  },
  (req, res) => {
    try {
      console.log('Google OAuth callback received');
      
      // Check if authentication was successful
      if (!req.user) {
        throw new Error('User not found after Google authentication');
      }
      
      // Successful authentication
      const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
      });
      
      // Get redirect URL from state parameter
      const redirectUrl = req.query.state || '/dashboard';
      
      console.log('OAuth successful, redirecting to frontend');
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?token=${token}&redirect=${encodeURIComponent(redirectUrl)}`);
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=authentication_failed`);
    }
  }
);

// Add this endpoint to handle frontend token validation
router.get('/verify-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json({ valid: true, user });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({ message: 'User with this phone number already exists' });
      }
    }

    // Create user
    const user = new User({ name, email, phone, password });
    
    // Generate OTP and set expiration (10 minutes)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    await user.save();

    // Send OTP via SMS
    await sendOTPSMS(phone, otp);

    res.status(201).json({
      message: 'User registered successfully. OTP sent to phone.',
      userId: user._id
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    // Find user with OTP fields explicitly selected
    const user = await User.findById(userId).select('+otp +otpExpires');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if OTP exists and matches
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    // Check if OTP has expired
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: 'OTP has expired' });
    }
    
    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    
    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE
    });
    
    res.json({ 
      message: 'Phone number verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: true,
        subscription: user.subscription
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();
    
    // Send OTP via SMS
    await sendOTPSMS(user.phone, otp);
    
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.correctPassword(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if subscription is still active
    if (user.subscription && user.subscription.isActive) {
      const now = new Date();
      const endDate = new Date(user.subscription.endDate);
      
      if (endDate < now) {
        // Subscription has expired
        user.subscription.isActive = false;
        await user.save();
      }
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        subscription: user.subscription
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    // Check if subscription is still active
    if (user.subscription && user.subscription.isActive) {
      const now = new Date();
      const endDate = new Date(user.subscription.endDate);
      
      if (endDate < now) {
        // Subscription has expired
        user.subscription.isActive = false;
        await user.save();
      }
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;