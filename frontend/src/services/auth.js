import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create a custom axios instance for auth
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const registerUser = async (userData) => {
  try {
    const response = await authAxios.post('/auth/register', userData);
    return response.data;
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
};

export const verifyOTP = async (userId, otp) => {
  try {
    const response = await authAxios.post('/auth/verify-otp', { userId, otp });
    return response.data;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    throw error;
  }
};

export const loginUser = async (credentials) => {
  try {
    const response = await authAxios.post('/auth/login', credentials);
    return response.data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

export const getCurrentUser = async (token) => {
  try {
    const response = await authAxios.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching current user:', error);
    throw error;
  }
};

// Test backend connection
export const testBackendConnection = async () => {
  try {
    const response = await authAxios.get('/health');
    return response.data;
  } catch (error) {
    console.error('Backend connection test failed:', error);
    throw error;
  }
};