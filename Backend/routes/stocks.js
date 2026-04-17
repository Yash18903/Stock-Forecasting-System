const express = require('express');
const router = express.Router();
const axios = require('axios');
const { auth } = require('../middleware/auth');
const finnhubService = require('../services/finnhubService');

// ─── Unified In-Memory Cache ─────────────────────────────────────────────────
// Single cache shared by BOTH /popular and /:symbol so prices are always
// identical regardless of which page the user visits.

const stockCache = new Map();   // symbol → { data, timestamp }
const CACHE_DURATION = 60000;   // 60 s – matches frontend refresh interval

const getCached = (symbol) => {
  const entry = stockCache.get(symbol);
  if (entry && (Date.now() - entry.timestamp) < CACHE_DURATION) {
    return entry.data;
  }
  return null;
};

const setCache = (symbol, data) => {
  stockCache.set(symbol, { data, timestamp: Date.now() });
};

// ─── BSE → Yahoo Finance .BO ticker map ─────────────────────────────────────
const BSE_TO_YF = {
  'RELIANCE.BSE': 'RELIANCE.BO',
  'TCS.BSE': 'TCS.BO',
  'WIPRO.BSE': 'WIPRO.BO',
  'INFY.BSE': 'INFY.BO',
  'HDFCBANK.BSE': 'HDFCBANK.BO',
  'ITC.BSE': 'ITC.BO',
  'ICICIBANK.BSE': 'ICICIBANK.BO',
  'SBI.BSE': 'SBIN.BO',
  'ADANIENT.BSE': 'ADANIENT.BO',
  'BHARTIARTL.BSE': 'BHARTIARTL.BO',
  'TATAMOTORS.BSE': 'TMPV.BO',
};

const toYFTicker = (symbol) => {
  if (BSE_TO_YF[symbol]) return BSE_TO_YF[symbol];
  if (symbol.endsWith('.BSE')) return symbol.replace('.BSE', '.BO');
  return symbol;
};

// ─── Yahoo Finance v8 chart API (no crumb needed, reliable, free) ────────────
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

const fetchFromYahoo = async (symbol) => {
  const yfTicker = toYFTicker(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfTicker}?interval=1d&range=5d`;

  const response = await axios.get(url, {
    headers: YF_HEADERS,
    timeout: 10000,
  });

  const chart = response.data?.chart;
  if (!chart || chart.error) {
    throw new Error(chart?.error?.description || `No chart data for ${yfTicker}`);
  }

  const result = chart.result?.[0];
  if (!result) throw new Error(`Empty result for ${yfTicker}`);

  const meta = result.meta;
  const currentPrice = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
  const change = currentPrice - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  // Day high/low from the latest OHLC quote
  const quotes = result.indicators?.quote?.[0];
  const lastIdx = (quotes?.close?.length || 0) - 1;
  const dayHigh = (lastIdx >= 0 ? quotes?.high?.[lastIdx] : null) || meta.regularMarketDayHigh || currentPrice;
  const dayLow = (lastIdx >= 0 ? quotes?.low?.[lastIdx] : null) || meta.regularMarketDayLow || currentPrice;
  const dayOpen = (lastIdx >= 0 ? quotes?.open?.[lastIdx] : null) || meta.regularMarketOpen || currentPrice;
  const volume = (lastIdx >= 0 ? quotes?.volume?.[lastIdx] : null) || meta.regularMarketVolume || 0;

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol.split('.')[0],
    price: currentPrice,
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    high: dayHigh,
    low: dayLow,
    open: dayOpen,
    previousClose: prevClose,
    volume,
    currency: meta.currency || 'INR',
    exchange: 'BSE',
  };
};

// ─── Python API fetch (preferred when server is running) ─────────────────────
const fetchFromPython = async (symbol, pythonApiUrl) => {
  const response = await axios.get(`${pythonApiUrl}/quote/${symbol}`, { timeout: 6000 });
  const data = response.data;
  if (data.error) throw new Error(data.error);
  if (!data.price || data.price === 0) throw new Error('Python API returned zero/null price');
  return {
    symbol,
    name: symbol.split('.')[0],
    price: data.price,
    change: data.change ?? 0,
    changePercent: data.changePercent ?? 0,
    high: data.high ?? 0,
    low: data.low ?? 0,
    open: data.open ?? 0,
    previousClose: data.previousClose ?? 0,
    volume: data.volume ?? 0,
    currency: 'INR',
    exchange: 'BSE',
  };
};

// ─── In-flight deduplication ─────────────────────────────────────────────────
// Prevents 2 concurrent requests for the same symbol from both hitting
// the external API at the same time. The second caller gets the same promise.
const inFlight = new Map(); // symbol → Promise

// ─── Master fetch with dedup: Python → Yahoo Finance v8 → Finnhub ────────────
const fetchSymbol = async (symbol) => {
  if (inFlight.has(symbol)) {
    console.log(`[fetch] Dedup hit for ${symbol}`);
    return inFlight.get(symbol);
  }

  const fetchPromise = (async () => {
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:5001';

    // 1. Yahoo Finance v8 chart API (no auth needed, per-symbol correct data)
    try {
      const data = await fetchFromYahoo(symbol);
      console.log(`[fetch] ✓ Yahoo: ${symbol} → ₹${data.price}`);
      return data;
    } catch (e) {
      console.log(`[fetch] ✗ Yahoo ${symbol}: ${e.message}`);
    }

    // 3. Finnhub last resort
    if (process.env.FINNHUB_API_KEY) {
      try {
        const data = await finnhubService.getRealTimePrice(symbol);
        const result = { ...data, currency: 'INR', exchange: 'BSE' };
        console.log(`[fetch] ✓ Finnhub: ${symbol} → ₹${result.price}`);
        return result;
      } catch (e) {
        console.log(`[fetch] ✗ Finnhub ${symbol}: ${e.message}`);
      }
    }

    return null;
  })();

  inFlight.set(symbol, fetchPromise);
  try {
    const result = await fetchPromise;
    return result;
  } finally {
    // Remove from in-flight after settled so next call re-fetches (cache handles reuse)
    inFlight.delete(symbol);
  }
};

// ─── GET /api/stocks/popular ─────────────────────────────────────────────────
router.get('/popular', async (req, res) => {
  try {
    const indianSymbols = [
      'RELIANCE.BSE', 'TCS.BSE', 'WIPRO.BSE', 'INFY.BSE',
      'HDFCBANK.BSE', 'ITC.BSE', 'ICICIBANK.BSE',
      'SBI.BSE', 'ADANIENT.BSE', 'BHARTIARTL.BSE', 'TATAMOTORS.BSE',
    ];

    // Return all from cache if still fresh
    const allCached = indianSymbols.map(s => getCached(s));
    if (allCached.every(Boolean)) {
      console.log('[popular] All 10 from cache');
      return res.json(allCached);
    }

    // Fetch all stale symbols IN PARALLEL — dramatically faster than sequential
    const staleSymbols = indianSymbols.filter(s => !getCached(s));
    console.log(`[popular] Parallel fetching ${staleSymbols.length} stale: ${staleSymbols.join(', ')}`);

    const results = await Promise.allSettled(staleSymbols.map(symbol => fetchSymbol(symbol)));

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        setCache(staleSymbols[idx], result.value);
      } else {
        console.warn(`[popular] Failed for ${staleSymbols[idx]}:`, result.reason?.message || 'null result');
      }
    });

    // Build response from unified cache
    const popularStocks = indianSymbols.map(s => getCached(s)).filter(Boolean);

    if (popularStocks.length === 0) {
      return res.status(503).json({
        message: 'Stock data temporarily unavailable. Please try again in a moment.',
      });
    }

    console.log(`[popular] Returning ${popularStocks.length}/10 stocks`);
    return res.json(popularStocks);
  } catch (error) {
    console.error('[popular] Unexpected error:', error);
    return res.status(500).json({ message: 'Failed to fetch popular stocks', error: error.message });
  }
});

// ─── GET /api/stocks/search/:query ───────────────────────────────────────────
// Searches among known BSE symbols and returns matches.
// Without this route, /search/:query would fall through to /:symbol
// and attempt to fetch "search" as a real stock ticker.
router.get('/search/:query', auth, (req, res) => {
  const KNOWN_SYMBOLS = [
    'RELIANCE.BSE', 'TCS.BSE', 'WIPRO.BSE', 'INFY.BSE',
    'HDFCBANK.BSE', 'ITC.BSE', 'ICICIBANK.BSE',
    'SBI.BSE', 'ADANIENT.BSE', 'BHARTIARTL.BSE', 'TATAMOTORS.BSE',
  ];
  const NAMES = {
    'RELIANCE.BSE': 'Reliance Industries', 'TCS.BSE': 'Tata Consultancy Services',
    'WIPRO.BSE': 'Wipro', 'INFY.BSE': 'Infosys', 'HDFCBANK.BSE': 'HDFC Bank',
    'ITC.BSE': 'ITC Limited', 'ICICIBANK.BSE': 'ICICI Bank',
    'SBI.BSE': 'State Bank of India', 'ADANIENT.BSE': 'Adani Enterprises',
    'BHARTIARTL.BSE': 'Bharti Airtel', 'TATAMOTORS.BSE': 'Tata Motors',
  };
  const q = req.params.query.toLowerCase();
  const matches = KNOWN_SYMBOLS
    .filter(s => s.toLowerCase().includes(q) || (NAMES[s] || '').toLowerCase().includes(q))
    .map(s => ({ symbol: s, name: NAMES[s] || s.split('.')[0] }));
  return res.json(matches);
});

// ─── GET /api/stocks/:symbol ─────────────────────────────────────────────────
router.get('/:symbol', auth, async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`[symbol] Request for: ${symbol}`);

    // Shared cache — guarantees same price as /popular
    const cached = getCached(symbol);
    if (cached) {
      console.log(`[symbol] Cache hit: ${symbol} → ₹${cached.price}`);
      return res.json(cached);
    }

    // Fetch fresh data
    const data = await fetchSymbol(symbol);
    if (!data) {
      return res.status(503).json({
        message: `Stock data for ${symbol} is temporarily unavailable.`,
      });
    }

    setCache(symbol, data);
    return res.json(data);
  } catch (error) {
    console.error(`[symbol] Error for ${req.params.symbol}:`, error);
    return res.status(500).json({ message: 'Failed to fetch stock details', error: error.message });
  }
});

module.exports = router;