import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getPopularStocks } from '../../services/stockData';
import './Dashboard.css';

// Indian BSE company name mapping
const COMPANY_NAMES = {
  'RELIANCE.BSE': 'Reliance Industries',
  'TCS.BSE': 'Tata Consultancy Services',
  'WIPRO.BSE': 'Wipro',
  'INFY.BSE': 'Infosys',
  'HDFCBANK.BSE': 'HDFC Bank',
  'ITC.BSE': 'ITC Limited',
  'ICICIBANK.BSE': 'ICICI Bank',
  'SBI.BSE': 'State Bank of India',
  'ADANIENT.BSE': 'Adani Enterprises',
  'BHARTIARTL.BSE': 'Bharti Airtel',
  'TATAMOTORS.BSE': 'Tata Motors'
};

const SECTOR_MAP = {
  'RELIANCE.BSE': 'Energy',
  'TCS.BSE': 'IT Services',
  'WIPRO.BSE': 'IT Services',
  'INFY.BSE': 'IT Services',
  'HDFCBANK.BSE': 'Banking',
  'ITC.BSE': 'FMCG',
  'ICICIBANK.BSE': 'Banking',
  'SBI.BSE': 'Banking',
  'ADANIENT.BSE': 'Conglomerate',
  'BHARTIARTL.BSE': 'Telecom',
  'TATAMOTORS.BSE': 'Auto'
};

/* Mini sparkline SVG */
const Sparkline = ({ positive }) => {
  const points = useMemo(() => {
    const pts = [];
    let y = 30;
    for (let i = 0; i < 20; i++) {
      y += (Math.random() - (positive ? 0.42 : 0.58)) * 8;
      y = Math.max(8, Math.min(52, y));
      pts.push(`${i * 5},${y}`);
    }
    return pts.join(' ');
  }, [positive]);

  return (
    <svg viewBox="0 0 95 60" className="sparkline-svg">
      <polyline
        fill="none"
        stroke={positive ? 'var(--green)' : 'var(--red)'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const Dashboard = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);

  // Live clock – cheap 1s tick, no API involvement
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Stable fetch function – wrapped in useCallback so interval gets the same ref
  const fetchPopularStocks = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError('');
      const popularStocks = await getPopularStocks();
      if (Array.isArray(popularStocks) && popularStocks.length > 0) {
        setStocks(popularStocks);
        setLastUpdated(new Date().toLocaleTimeString());
        retryCountRef.current = 0;
      } else {
        setError('No stock data available. Please try again later.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load real-time data. Please check your connection.';
      setError(msg);
      // Retry up to 3 times with 5-second gaps, but only if this is the initial load
      if (!isRefresh && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => fetchPopularStocks(false), 5000);
      }
    } finally {
      setLoading(false);
    }
  }, []); // no deps – stable reference throughout lifecycle

  // Run once on mount + set up a 60-second background refresh
  // 60 s matches the backend cache TTL so we never hit stale data on purpose
  useEffect(() => {
    fetchPopularStocks(false);
    const intervalId = setInterval(() => fetchPopularStocks(true), 60000);
    return () => {
      clearInterval(intervalId);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchPopularStocks]); // fetchPopularStocks is stable (useCallback with no deps)

  /* Compute market stats */
  const marketStats = useMemo(() => {
    if (!stocks.length) return null;
    const gainers = stocks.filter(s => s.change >= 0).length;
    const avgChange = stocks.reduce((a, s) => a + (s.changePercent || 0), 0) / stocks.length;
    const topGainer = [...stocks].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))[0];
    const topLoser = [...stocks].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))[0];
    const totalVol = stocks.reduce((a, s) => a + (s.volume || 0), 0);
    return { gainers, losers: stocks.length - gainers, avgChange, topGainer, topLoser, totalVol };
  }, [stocks]);

  const sortedStocks = useMemo(() => {
    const filtered = stocks.filter(s =>
      s?.symbol && (s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (COMPANY_NAMES[s.symbol] && COMPANY_NAMES[s.symbol].toLowerCase().includes(searchQuery.toLowerCase())))
    );
    if (sortBy === 'price-high') return [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sortBy === 'price-low') return [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sortBy === 'change-high') return [...filtered].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    if (sortBy === 'change-low') return [...filtered].sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0));
    return filtered;
  }, [stocks, searchQuery, sortBy]);

  // Check market open (BSE: 9:15 AM - 3:30 PM IST Mon-Fri)
  const isMarketOpen = useMemo(() => {
    const now = currentTime;
    const h = now.getHours(), m = now.getMinutes(), d = now.getDay();
    if (d === 0 || d === 6) return false;
    const minutes = h * 60 + m;
    return minutes >= 555 && minutes <= 930; // 9:15 to 15:30
  }, [currentTime]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dash-loading">
          <div className="spinner"></div>
          <h2>Loading Dashboard</h2>
          <p>Fetching real-time BSE stock data...</p>
          {retryCountRef.current > 0 && <p className="retry-text">Retry attempt: {retryCountRef.current}/3</p>}
        </div>
      </div>
    );
  }

  /* Watchlist Toggle */
  const toggleWatchlist = (e, symbol) => {
    e.preventDefault();
    e.stopPropagation();
    // In a real app, save to backend/local storage
    const btn = e.currentTarget;
    btn.classList.toggle('active');
  };

  return (
    <div className="dashboard">
      {/* ── Top Bar ── */}
      <div className="dash-top-bar">
        <div className="dash-top-left">
          <h1>Dashboard</h1>
          <div className="market-status-pill">
            <span className={`status-dot ${isMarketOpen ? 'open' : 'closed'}`}></span>
            <span>{isMarketOpen ? 'Market Open' : 'Market Closed'}</span>
          </div>
        </div>
        <div className="dash-top-right">
          <div className="live-clock">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          {lastUpdated && <span className="last-update-tag">Updated {lastUpdated}</span>}
        </div>
      </div>

      {error && (
        <div className="dash-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          <span>{error}</span>
          {retryCountRef.current < 3 && <span className="retry-text">Retrying ({retryCountRef.current + 1}/3)...</span>}
        </div>
      )}

      {/* ── Market Summary Cards ── */}
      {marketStats && (
        <div className="market-summary">
          <div className="summary-card">
            <div className="summary-icon green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            </div>
            <div>
              <span className="summary-value">{marketStats.gainers}</span>
              <span className="summary-label">Gainers</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon red">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
            </div>
            <div>
              <span className="summary-value">{marketStats.losers}</span>
              <span className="summary-label">Losers</span>
            </div>
          </div>
          <div className="summary-card">
            <div className={`summary-icon ${marketStats.avgChange >= 0 ? 'green' : 'red'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
            </div>
            <div>
              <span className="summary-value">{marketStats.avgChange >= 0 ? '+' : ''}{marketStats.avgChange.toFixed(2)}%</span>
              <span className="summary-label">Avg Change</span>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            </div>
            <div>
              <span className="summary-value">{(marketStats.totalVol / 1000000).toFixed(1)}M</span>
              <span className="summary-label">Total Volume</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Sort ── */}
      <div className="dash-controls">
        <div className="search-container" ref={searchRef}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="Search stocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
        <div className="sort-controls">
          <span className="sort-label">Sort:</span>
          {['default', 'change-high', 'change-low', 'price-high', 'price-low'].map(s => (
            <button key={s} className={`sort-btn ${sortBy === s ? 'active' : ''}`} onClick={() => setSortBy(s)}>
              {s === 'default' ? 'Default' : s === 'change-high' ? '↑ Change' : s === 'change-low' ? '↓ Change' : s === 'price-high' ? '↑ Price' : '↓ Price'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stock Grid ── */}
      <div className="stocks-section">
        <div className="section-row">
          <h2>BSE Stocks <span className="stock-count">{sortedStocks.length} results</span></h2>
        </div>

        <div className="stocks-grid">
          {sortedStocks.length > 0 ? (
            sortedStocks.map((stock, idx) => (
              <Link to={`/company/${stock.symbol}`} key={stock.symbol} className="stock-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="card-top-row">
                  <div className="stock-symbol-badge">{stock.symbol.split('.')[0]}</div>
                  <div className="top-right-group">
                    <span className={`change-pill ${stock.change >= 0 ? 'positive' : 'negative'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2) || '0.00'}%
                    </span>
                    <button className="watchlist-btn" onClick={(e) => toggleWatchlist(e, stock.symbol)} title="Add to Watchlist">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </button>
                  </div>
                </div>

                <p className="stock-company-name">{COMPANY_NAMES[stock.symbol] || stock.name || stock.symbol}</p>
                <span className="stock-sector">{SECTOR_MAP[stock.symbol] || 'BSE'}</span>

                <div className="stock-price-row">
                  <span className="stock-price-big">₹{stock.price?.toFixed(2) || '0.00'}</span>
                  <span className={`stock-change-abs ${stock.change >= 0 ? 'positive' : 'negative'}`}>
                    {stock.change >= 0 ? '+' : ''}₹{Math.abs(stock.change)?.toFixed(2) || '0.00'}
                  </span>
                </div>

                <div className="sparkline-container">
                  <Sparkline positive={stock.change >= 0} />
                </div>

                {(stock.open || stock.high || stock.low || stock.volume) && (
                  <div className="stock-metrics">
                    {stock.open && <div className="metric"><span className="metric-label">Open</span><span className="metric-value">₹{stock.open.toFixed(2)}</span></div>}
                    {stock.high && <div className="metric"><span className="metric-label">High</span><span className="metric-value increase">₹{stock.high.toFixed(2)}</span></div>}
                    {stock.low && <div className="metric"><span className="metric-label">Low</span><span className="metric-value decrease">₹{stock.low.toFixed(2)}</span></div>}
                    {stock.volume && <div className="metric"><span className="metric-label">Vol</span><span className="metric-value">{(stock.volume / 1000).toFixed(0)}K</span></div>}
                  </div>
                )}

                <div className="card-footer">
                  <span className="view-details">View Details →</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="no-results">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <p>No stocks match "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="quick-actions">
        <div className="qa-card qa-premium">
          <div className="qa-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </div>
          <div className="qa-content">
            <h3>Upgrade to Premium</h3>
            <p>Unlock AI predictions, confidence scores, and factor analysis</p>
          </div>
          <Link to="/subscription" className="qa-btn primary">Upgrade</Link>
        </div>

        <div className="qa-card qa-market">
          <div className="qa-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div className="qa-content">
            <h3>BSE Market Hours</h3>
            <p>Mon–Fri, 9:15 AM – 3:30 PM IST</p>
          </div>
          <div className={`market-badge ${isMarketOpen ? 'open' : 'closed'}`}>
            <span className={`status-dot ${isMarketOpen ? 'open' : 'closed'}`}></span>
            {isMarketOpen ? 'Open Now' : 'Closed'}
          </div>
        </div>

        {marketStats?.topGainer && (
          <div className="qa-card qa-top">
            <div className="qa-icon green-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            </div>
            <div className="qa-content">
              <h3>Top Gainer</h3>
              <p>{(COMPANY_NAMES[marketStats.topGainer.symbol] || marketStats.topGainer.symbol.split('.')[0])}</p>
            </div>
            <span className="change-pill positive">+{marketStats.topGainer.changePercent?.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;