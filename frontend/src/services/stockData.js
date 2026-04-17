import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create a custom axios instance for stock data
const stockAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// Add auth token to requests
stockAxios.interceptors.request.use(
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

// Add response interceptor to handle errors
stockAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const getStockData = async (symbol) => {
  try {
    const response = await stockAxios.get(`/stocks/${symbol}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
};

// NOTE: No /history endpoint exists on the backend.
// getStockHistory falls back to the regular quote endpoint so chart components
// still receive a valid stock object instead of a 404/wildcard mismatch.
export const getStockHistory = async (symbol, period = '1m') => {
  try {
    const response = await stockAxios.get(`/stocks/${symbol}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching stock history:', error);
    throw error;
  }
};

export const getPopularStocks = async () => {
  try {
    const response = await stockAxios.get('/stocks/popular');
    return response.data;
  } catch (error) {
    console.error('Error fetching popular stocks:', error);
    throw error;
  }
};