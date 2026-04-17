const axios = require('axios');

// Create a shared axios instance with custom config
const axiosInstance = axios.create({
  timeout: 10000,
  // Keep alive to reuse connections
  httpAgent: new require('http').Agent({ keepAlive: true }),
  httpsAgent: new require('https').Agent({ keepAlive: true })
});

class FinnhubService {
  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.baseUrl = 'https://finnhub.io/api/v1';

    if (!this.apiKey) {
      console.warn('WARNING: FINNHUB_API_KEY is not set - news features will not work');
    }
  }

  async getRealTimePrice(symbol) {
    try {
      console.log(`Fetching real-time price for ${symbol} with API key: ${this.apiKey ? 'Set' : 'Not set'}`);

      // Validate symbol
      if (!symbol || typeof symbol !== 'string') {
        throw new Error('Invalid stock symbol');
      }

      const response = await axiosInstance.get(`${this.baseUrl}/quote`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: this.apiKey
        }
      });

      console.log(`Finnhub response for ${symbol}:`, response.data);

      if (response.data && response.data.c !== null && response.data.c !== undefined) {
        const quote = response.data;
        return {
          symbol: symbol,
          price: quote.c, // current price
          change: quote.d, // change
          changePercent: quote.dp, // change percent
          high: quote.h, // high price of the day
          low: quote.l, // low price of the day
          open: quote.o, // open price of the day
          previousClose: quote.pc, // previous close price
          timestamp: quote.t // timestamp
        };
      } else {
        console.error('Invalid or empty response from Finnhub for symbol:', symbol);
        throw new Error('Invalid response from Finnhub API');
      }
    } catch (error) {
      console.error(`Error fetching real-time price for ${symbol}:`, error.message);
      if (error.response) {
        console.error('API response error:', error.response.status, error.response.data);
      }
      throw error;
    }
  }

  async getCompanyProfile(symbol) {
    try {
      const response = await axiosInstance.get(`${this.baseUrl}/stock/profile2`, {
        params: {
          symbol: symbol.toUpperCase(),
          token: this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching company profile for ${symbol}:`, error.message);
      // Return null instead of throwing, as profile is optional
      return null;
    }
  }

  async getCompanyNews(symbol, from, to) {
    try {
      // Default dates if not provided (last 7 days)
      if (!from || !to) {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);

        to = today.toISOString().split('T')[0];
        from = lastWeek.toISOString().split('T')[0];
      }

      console.log(`Fetching news for ${symbol} from ${from} to ${to}`);

      const response = await axiosInstance.get(`${this.baseUrl}/company-news`, {
        params: {
          symbol: symbol.toUpperCase(),
          from: from,
          to: to,
          token: this.apiKey
        }
      });

      return response.data;
    } catch (error) {
      console.error(`Error fetching news for ${symbol}:`, error.message);
      // Return empty array instead of failing
      return [];
    }
  }

}

module.exports = new FinnhubService();