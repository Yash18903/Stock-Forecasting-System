const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');

dotenv.config();

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'stockzen_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const User = require('./models/User');
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const User = require('./models/User');

    // Check if user already exists
    let user = await User.findOne({ googleId: profile.id });

    if (user) {
      return done(null, user);
    }

    // Check if user exists with the same email
    user = await User.findOne({ email: profile.emails[0].value });

    if (user) {
      // Link Google account to existing user
      user.googleId = profile.id;
      await user.save();
      return done(null, user);
    }

    // Create new user
    user = await User.create({
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      isVerified: true // Google verified the email
    });

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Middleware


// Import routes
const authRoutes = require('./routes/auth');
const stockRoutes = require('./routes/stocks');
const predictionRoutes = require('./routes/predictions');
const paymentRoutes = require('./routes/payments');
const subscriptionRoutes = require('./routes/subscription');
const newsRoutes = require('./routes/news'); // Import news routes

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/news', newsRoutes); // Use news routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Add this to your server.js after the other routes
app.get('/api/debug/finnhub', async (req, res) => {
  try {
    // Test the Finnhub API connection
    const testSymbol = 'AAPL';
    console.log(`Testing Finnhub API with symbol: ${testSymbol}`);

    const response = await axios.get(`https://finnhub.io/api/v1/quote`, {
      params: {
        symbol: testSymbol,
        token: process.env.FINNHUB_API_KEY
      },
      timeout: 10000
    });

    res.json({
      status: 'success',
      message: 'Finnhub API is accessible',
      data: response.data
    });
  } catch (error) {
    console.error('Finnhub API test failed:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Finnhub API test failed',
      error: error.message,
      advice: 'Check your FINNHUB_API_KEY environment variable and network connection'
    });
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));