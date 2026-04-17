const yahooFinance = require('yahoo-finance2').default;

class YahooFinanceService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = 60000; // 1 minute cache
  }

  async getRealTimePrice(symbols) {
    try {
      // Check cache first
      const cached = this.getFromCache(symbols);
      if (cached) return cached;

      console.log('Fetching real-time data for symbols:', symbols);
      
      const results = await yahooFinance.quote(symbols);
      
      // Format the response
      const formattedResults = results.map(result => ({
        symbol: result.symbol,
        name: result.displayName || result.shortName || result.longName || symbol,
        price: result.regularMarketPrice || 0,
        change: result.regularMarketChange || 0,
        changePercent: result.regularMarketChangePercent || 0,
        high: result.regularMarketDayHigh || 0,
        low: result.regularMarketDayLow || 0,
        volume: result.regularMarketVolume || 0,
        marketCap: result.marketCap || 0,
        currency: result.currency || 'USD',
        exchange: result.fullExchangeName || result.exchange || 'N/A'
      }));

      // Cache the results
      this.setToCache(symbols, formattedResults);
      
      return formattedResults;
    } catch (error) {
      console.error('Error fetching Yahoo Finance data:', error);
      throw new Error('Failed to fetch real-time stock data');
    }
  }

  async getHistoricalData(symbol, period = '1mo') {
    try {
      const queryOptions = {
        period1: this.getStartDate(period),
        interval: this.getInterval(period)
      };

      const results = await yahooFinance.chart(symbol, queryOptions);
      
      if (!results.quotes || results.quotes.length === 0) {
        throw new Error('No historical data available');
      }

      return results.quotes.map(quote => ({
        timestamp: new Date(quote.date),
        open: quote.open || 0,
        high: quote.high || 0,
        low: quote.low || 0,
        close: quote.close || 0,
        volume: quote.volume || 0
      }));
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw new Error('Failed to fetch historical stock data');
    }
  }

  async searchStocks(query) {
    try {
      const results = await yahooFinance.search(query);
      
      return results.quotes.map(quote => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname || 'N/A',
        type: quote.quoteType || 'N/A',
        exchange: quote.exchange || 'N/A'
      }));
    } catch (error) {
      console.error('Error searching stocks:', error);
      throw new Error('Failed to search stocks');
    }
  }

  getStartDate(period) {
    const now = new Date();
    switch (period) {
      case '1d': return new Date(now.setDate(now.getDate() - 1));
      case '1w': return new Date(now.setDate(now.getDate() - 7));
      case '1m': return new Date(now.setMonth(now.getMonth() - 1));
      case '3m': return new Date(now.setMonth(now.getMonth() - 3));
      case '1y': return new Date(now.setFullYear(now.getFullYear() - 1));
      default: return new Date(now.setMonth(now.getMonth() - 1));
    }
  }

  getInterval(period) {
    switch (period) {
      case '1d': return '5m';
      case '1w': return '1h';
      case '1m': return '1d';
      case '3m': return '1d';
      case '1y': return '1wk';
      default: return '1d';
    }
  }

  getFromCache(symbols) {
    const key = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      console.log('Returning cached data for:', key);
      return cached.data;
    }
    
    return null;
  }

  setToCache(symbols, data) {
    const key = Array.isArray(symbols) ? symbols.join(',') : symbols;
    this.cache.set(key, {
      timestamp: Date.now(),
      data: data
    });
  }
}

module.exports = new YahooFinanceService();