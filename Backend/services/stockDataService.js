const axios = require('axios');

class StockDataService {
  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.baseUrl = 'https://www.alphavantage.co/query';
  }

  async getRealTimePrice(symbol) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol,
          apikey: this.apiKey
        }
      });
      
      console.log('Alpha Vantage Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data['Global Quote'] && Object.keys(response.data['Global Quote']).length > 0) {
        const quote = response.data['Global Quote'];
        return {
          symbol: symbol,
          price: parseFloat(quote['05. price']) || 0,
          change: parseFloat(quote['09. change']) || 0,
          changePercent: parseFloat((quote['10. change percent'] || '0%').replace('%', '')) || 0,
          high: parseFloat(quote['03. high']) || 0,
          low: parseFloat(quote['04. low']) || 0,
          volume: parseInt(quote['06. volume']) || 0
        };
      } else if (response.data['Note']) {
        // API rate limit message
        console.warn('Alpha Vantage API rate limit:', response.data['Note']);
        throw new Error('API rate limit exceeded. Please try again later.');
      } else if (response.data['Error Message']) {
        // API error message
        console.error('Alpha Vantage API error:', response.data['Error Message']);
        throw new Error(response.data['Error Message']);
      } else {
        console.error('Unexpected Alpha Vantage response:', response.data);
        throw new Error('Invalid response from stock data provider');
      }
    } catch (error) {
      console.error('Error fetching real-time price:', error.message);
      
      // Fallback to mock data if API fails
      return this.getMockData(symbol);
    }
  }

  // Fallback mock data generator
  getMockData(symbol) {
    console.log('Using mock data for:', symbol);
    
    const mockPrices = {
      'AAPL': { price: 175.43, change: 2.34, changePercent: 1.35 },
      'GOOGL': { price: 2750.82, change: 45.67, changePercent: 1.69 },
      'MSFT': { price: 414.67, change: 8.23, changePercent: 2.02 },
      'AMZN': { price: 145.86, change: 3.21, changePercent: 2.25 },
      'TSLA': { price: 238.59, change: -5.32, changePercent: -2.18 },
      'NVDA': { price: 875.28, change: 32.45, changePercent: 3.85 },
      'META': { price: 485.39, change: 12.67, changePercent: 2.68 },
      'JPM': { price: 195.76, change: 3.45, changePercent: 1.79 },
      'JNJ': { price: 162.34, change: 1.23, changePercent: 0.76 },
      'V': { price: 275.89, change: 4.56, changePercent: 1.68 }
    };
    
    const defaultData = { price: 100.00, change: 1.00, changePercent: 1.00 };
    const data = mockPrices[symbol] || defaultData;
    
    return {
      symbol: symbol,
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      high: data.price * 1.05,
      low: data.price * 0.95,
      volume: Math.floor(Math.random() * 10000000) + 1000000
    };
  }

  async getHistoricalData(symbol, period = '1m') {
    try {
      let functionName;
      let outputSize;
      
      switch (period) {
        case '1d':
          functionName = 'TIME_SERIES_INTRADAY';
          outputSize = 'compact';
          break;
        case '1w':
        case '1m':
        case '3m':
          functionName = 'TIME_SERIES_DAILY';
          outputSize = 'compact';
          break;
        case '1y':
          functionName = 'TIME_SERIES_DAILY';
          outputSize = 'full';
          break;
        default:
          functionName = 'TIME_SERIES_DAILY';
          outputSize = 'compact';
      }
      
      const response = await axios.get(this.baseUrl, {
        params: {
          function: functionName,
          symbol: symbol,
          interval: period === '1d' ? '5min' : undefined,
          outputsize: outputSize,
          apikey: this.apiKey
        }
      });
      
      console.log('Historical Data Response:', JSON.stringify(response.data, null, 2));
      
      let timeSeries;
      if (functionName === 'TIME_SERIES_INTRADAY') {
        timeSeries = response.data['Time Series (5min)'];
      } else {
        timeSeries = response.data['Time Series (Daily)'];
      }
      
      if (!timeSeries) {
        if (response.data['Note']) {
          console.warn('Alpha Vantage API rate limit:', response.data['Note']);
          throw new Error('API rate limit exceeded. Please try again later.');
        } else if (response.data['Error Message']) {
          console.error('Alpha Vantage API error:', response.data['Error Message']);
          throw new Error(response.data['Error Message']);
        } else {
          console.error('Unexpected Alpha Vantage response:', response.data);
          throw new Error('Invalid response from stock data provider');
        }
      }
      
      const historicalData = [];
      for (const [timestamp, data] of Object.entries(timeSeries)) {
        historicalData.push({
          timestamp: new Date(timestamp),
          open: parseFloat(data['1. open']) || 0,
          high: parseFloat(data['2. high']) || 0,
          low: parseFloat(data['3. low']) || 0,
          close: parseFloat(data['4. close']) || 0,
          volume: parseInt(data['5. volume']) || 0
        });
      }
      
      return historicalData.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error fetching historical data:', error.message);
      
      // Fallback to mock historical data
      return this.getMockHistoricalData(symbol, period);
    }
  }

  // Fallback mock historical data generator
  getMockHistoricalData(symbol, period) {
    console.log('Using mock historical data for:', symbol, period);
    
    const dataPoints = period === '1d' ? 24 : 
                      period === '1w' ? 7 :
                      period === '1m' ? 30 :
                      period === '3m' ? 90 : 365;
    
    const basePrice = this.getMockData(symbol).price;
    const historicalData = [];
    const now = new Date();
    
    for (let i = dataPoints; i >= 0; i--) {
      const date = new Date(now);
      
      if (period === '1d') {
        date.setHours(now.getHours() - i);
      } else {
        date.setDate(now.getDate() - i);
      }
      
      // Random price fluctuation
      const fluctuation = (Math.random() * 0.1) - 0.05; // -5% to +5%
      const price = basePrice * (1 + fluctuation);
      
      historicalData.push({
        timestamp: date,
        open: price * (1 + (Math.random() * 0.02 - 0.01)), // ±1% from close
        high: price * (1 + Math.random() * 0.03), // up to 3% higher than close
        low: price * (1 - Math.random() * 0.03), // up to 3% lower than close
        close: price,
        volume: Math.floor(Math.random() * 10000000) + 1000000
      });
    }
    
    return historicalData;
  }

  async searchStocks(query) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          function: 'SYMBOL_SEARCH',
          keywords: query,
          apikey: this.apiKey
        }
      });
      
      console.log('Search Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data.bestMatches) {
        return response.data.bestMatches.map(match => ({
          symbol: match['1. symbol'] || '',
          name: match['2. name'] || '',
          type: match['3. type'] || '',
          region: match['4. region'] || '',
          currency: match['8. currency'] || ''
        }));
      } else if (response.data['Note']) {
        console.warn('Alpha Vantage API rate limit:', response.data['Note']);
        throw new Error('API rate limit exceeded. Please try again later.');
      } else if (response.data['Error Message']) {
        console.error('Alpha Vantage API error:', response.data['Error Message']);
        throw new Error(response.data['Error Message']);
      }
      
      return [];
    } catch (error) {
      console.error('Error searching stocks:', error.message);
      
      // Fallback to mock search results
      return this.getMockSearchResults(query);
    }
  }

  // Fallback mock search results generator
  getMockSearchResults(query) {
    console.log('Using mock search results for:', query);
    
    const popularStocks = [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'TSLA', name: 'Tesla Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'META', name: 'Meta Platforms Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'Equity', region: 'United States', currency: 'USD' },
      { symbol: 'V', name: 'Visa Inc.', type: 'Equity', region: 'United States', currency: 'USD' }
    ];
    
    return popularStocks.filter(stock => 
      stock.symbol.toLowerCase().includes(query.toLowerCase()) || 
      stock.name.toLowerCase().includes(query.toLowerCase())
    );
  }
}

module.exports = new StockDataService();