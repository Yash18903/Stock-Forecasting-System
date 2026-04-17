const express = require('express');
const router = express.Router();
const axios = require('axios');
const { auth } = require('../middleware/auth');

// ─── Tradient API Config ─────────────────────────────────────────────────────
const TRADIENT_API_URL = 'https://api.tradient.org/v1/api/market/news';

// Exact mapping: our BSE symbols → every possible Tradient identifier for that company
// Each entry has multiple search terms to catch all variations
const COMPANY_SEARCH_MAP = {
    'RELIANCE': { keywords: ['RELIANCE'], stockNames: ['RELIANCE INDUSTRIES'] },
    'TCS': { keywords: ['TCS'], stockNames: ['TATA CONSULTANCY'] },
    'WIPRO': { keywords: ['WIPRO'], stockNames: ['WIPRO'] },
    'INFY': { keywords: ['INFY', 'INFOSYS'], stockNames: ['INFOSYS'] },
    'HDFCBANK': { keywords: ['HDFCBANK', 'HDFC BANK'], stockNames: ['HDFC BANK'] },
    'ITC': { keywords: ['ITC'], stockNames: ['ITC LIMITED'] },
    'ICICIBANK': { keywords: ['ICICIBANK', 'ICICI BANK'], stockNames: ['ICICI BANK'] },
    'SBI': { keywords: ['SBIN', 'SBI'], stockNames: ['STATE BANK OF INDIA', 'SBI LIFE'] },
    'ADANIENT': { keywords: ['ADANIENT', 'ADANI'], stockNames: ['ADANI ENTERPRISES', 'ADANI PORTS'] },
    'BHARTIARTL': { keywords: ['BHARTIARTL', 'BHARTI'], stockNames: ['BHARTI AIRTEL'] },
};

// ─── News cache ──────────────────────────────────────────────────────────────
let newsCache = { data: null, timestamp: 0 };
const NEWS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const fetchAllNews = async () => {
    const now = Date.now();
    if (newsCache.data && (now - newsCache.timestamp) < NEWS_CACHE_DURATION) {
        return newsCache.data;
    }

    console.log('[news] Fetching from Tradient API');
    const response = await axios.get(TRADIENT_API_URL, { timeout: 10000 });

    if (response.data?.status === 200 && response.data?.data?.latest_news) {
        newsCache = { data: response.data.data.latest_news, timestamp: now };
        console.log(`[news] Cached ${newsCache.data.length} articles`);
        return newsCache.data;
    }

    throw new Error('Invalid response from Tradient API');
};

// Shape a Tradient news item into our frontend format
const shapeNewsItem = (item) => ({
    id: item.article_id,
    headline: item.news_object?.title || '',
    summary: item.news_object?.text || '',
    sentiment: item.news_object?.overall_sentiment || 'neutral',
    source: item.display_symbol || item.stock_name || 'Market',
    datetime: item.publish_date ? Math.floor(item.publish_date / 1000) : 0,
    url: item.article_slug
        ? `https://tradient.org/news/${item.article_slug}`
        : '#',
    category: item.category || '',
    subCategory: item.sub_category || '',
    symbol: item.sm_symbol || '',
    sector: item.metadata?.sector_name || '',
    marketCap: item.metadata?.marketcap || '',
});

// Strict company match — returns true only if the news item belongs to this company
const isMatchForCompany = (item, cleanSymbol) => {
    const searchConfig = COMPANY_SEARCH_MAP[cleanSymbol];

    const smSym = (item.sm_symbol || '').toUpperCase();
    const stockName = (item.stock_name || '').toUpperCase();
    const displaySym = (item.display_symbol || '').toUpperCase();

    if (searchConfig) {
        // Check against all known keywords for this company
        for (const kw of searchConfig.keywords) {
            if (smSym === kw.toUpperCase()) return true;
        }
        // Check against known stock name fragments
        for (const sn of searchConfig.stockNames) {
            if (stockName.includes(sn.toUpperCase())) return true;
            if (displaySym.includes(sn.toUpperCase())) return true;
        }
        return false;
    }

    // Fallback for unknown symbols — exact sm_symbol match only
    return smSym === cleanSymbol;
};

// ─── GET /api/news/market — General market news ──────────────────────────────
router.get('/market', auth, async (req, res) => {
    try {
        const allNews = await fetchAllNews();
        const shaped = allNews.slice(0, 30).map(shapeNewsItem);
        return res.json(shaped);
    } catch (error) {
        console.error('[news] Error fetching market news:', error.message);
        return res.status(500).json({ message: 'Failed to fetch market news' });
    }
});

// ─── GET /api/news/:symbol — News ONLY for this specific company ─────────────
// Returns ONLY news that belongs to the requested company.
// If no news exists for the company, returns an empty array.
router.get('/:symbol', auth, async (req, res) => {
    try {
        const { symbol } = req.params;
        const cleanSymbol = symbol.split('.')[0].toUpperCase();
        console.log(`[news] Filtering for company: ${cleanSymbol}`);

        const allNews = await fetchAllNews();

        // Strict filter — only news that actually belongs to this company
        const companyNews = allNews.filter(item => isMatchForCompany(item, cleanSymbol));

        console.log(`[news] ${cleanSymbol}: ${companyNews.length} matching articles out of ${allNews.length}`);

        // Return only matched news — empty array if none found
        return res.json(companyNews.slice(0, 15).map(shapeNewsItem));
    } catch (error) {
        console.error(`[news] Error for ${req.params.symbol}:`, error.message);
        return res.status(500).json({ message: 'Failed to fetch news', error: error.message });
    }
});

module.exports = router;
