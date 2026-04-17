import axios from 'axios';

// Base API URL - use environment variable or default to local development
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,  // 120s — ML predictions fetch live yfinance data and can take 20-40s
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true // Important for sessions with Google OAuth
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication API calls
export const authAPI = {
  // Register new user
  register: (userData) => api.post('/auth/register', userData),

  // Verify OTP
  verifyOTP: (userId, otp) => api.post('/auth/verify-otp', { userId, otp }),

  // Resend OTP
  resendOTP: (userId) => api.post('/auth/resend-otp', { userId }),

  // Login user
  login: (credentials) => api.post('/auth/login', credentials),

  // Get current user
  getCurrentUser: () => api.get('/auth/me'),

  // Verify token
  verifyToken: () => {
    const token = localStorage.getItem('authToken');
    return api.get('/auth/verify-token', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },
};

// Stocks API calls
export const stocksAPI = {
  // Get stock data by symbol
  getStock: (symbol) => api.get(`/stocks/${symbol}`),

  // Get popular stocks
  getPopularStocks: () => api.get('/stocks/popular'),
};

// Predictions API calls
export const predictionsAPI = {
  // Get prediction for a stock
  getPrediction: (symbol) => api.get(`/predictions/${symbol}`),
};

// Subscription API calls
export const subscriptionAPI = {
  // Get current subscription
  getSubscription: () => api.get('/subscription'),

  // Create new subscription
  createSubscription: (plan) => api.post('/subscription', { plan }),

  // Cancel subscription — backend route is POST /subscription/cancel
  cancelSubscription: () => api.post('/subscription/cancel'),
};

// Payment API calls
export const paymentAPI = {
  // Process payment
  processPayment: (paymentData) => api.post('/payments/process', paymentData),

  // Get payment history
  getPaymentHistory: () => api.get('/payments/history'),
};

// User API calls
export const userAPI = {
  // Update user profile
  updateProfile: (userData) => api.put('/user/profile', userData),

  // Change password
  changePassword: (currentPassword, newPassword) =>
    api.put('/user/password', { currentPassword, newPassword }),
};

// News API calls
export const newsAPI = {
  // Get news for a stock
  getStockNews: (symbol) => api.get(`/news/${symbol}`),

  // Get market news
  getMarketNews: () => api.get('/news/market'),
};

// Test API connection
export const testConnection = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('API connection test failed:', error);
    throw error;
  }
};

export default api;