import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { getStockData, getStockHistory } from '../../services/stockData';
import { newsAPI } from '../../services/api';
import './CompanyPage.css';

// Indian BSE company metadata
const INDIAN_COMPANIES = {
  'RELIANCE.BSE': { name: 'Reliance Industries Ltd', sector: 'Energy & Petrochemicals', shares: 6766000000, high52: 3217.60, low52: 2220.30, desc: 'Reliance Industries Limited is an Indian multinational conglomerate, one of the most profitable companies in India. It is engaged in energy, petrochemicals, natural gas, retail, telecommunications, mass media, and textiles.' },
  'TCS.BSE': { name: 'Tata Consultancy Services Ltd', sector: 'Information Technology', shares: 3622000000, high52: 4592.25, low52: 3311.15, desc: 'Tata Consultancy Services (TCS) is an Indian multinational information technology services and consulting company. It is part of the Tata Group and operates in 150 locations across 46 countries.' },
  'WIPRO.BSE': { name: 'Wipro Ltd', sector: 'Information Technology', shares: 5236000000, high52: 576.80, low52: 381.75, desc: 'Wipro Limited is an Indian multinational corporation that provides information technology, consulting and business process services.' },
  'INFY.BSE': { name: 'Infosys Ltd', sector: 'Information Technology', shares: 4142000000, high52: 1953.90, low52: 1358.35, desc: 'Infosys Limited is an Indian multinational information technology company that provides business consulting, information technology and outsourcing services.' },
  'HDFCBANK.BSE': { name: 'HDFC Bank Ltd', sector: 'Banking & Finance', shares: 7600000000, high52: 1880.00, low52: 1363.55, desc: 'HDFC Bank Limited is an Indian banking and financial services company. It is India\'s largest private sector bank by assets and the world\'s 10th largest bank by market capitalisation.' },
  'ITC.BSE': { name: 'ITC Limited', sector: 'FMCG', shares: 12460000000, high52: 510.60, low52: 399.30, desc: 'ITC Limited is an Indian conglomerate with a diversified presence in FMCG, Hotels, Packaging, Paperboards & Specialty Papers and Agri-Business.' },
  'ICICIBANK.BSE': { name: 'ICICI Bank Ltd', sector: 'Banking & Finance', shares: 7013000000, high52: 1340.00, low52: 898.55, desc: 'ICICI Bank Limited is an Indian multinational bank and financial services company. It offers a range of banking products and financial services to corporate and retail customers.' },
  'SBI.BSE': { name: 'State Bank of India', sector: 'Banking & Finance', shares: 8925000000, high52: 912.10, low52: 555.15, desc: 'State Bank of India (SBI) is an Indian multinational public sector bank and financial services statutory body. It is the largest bank in India with a 23% market share by assets.' },
  'ADANIENT.BSE': { name: 'Adani Enterprises Ltd', sector: 'Diversified Conglomerate', shares: 1145000000, high52: 3743.90, low52: 2142.00, desc: 'Adani Enterprises Limited is the flagship company of the Adani Group. It operates across sectors including mining, solar manufacturing, airports, data centers, road development, water, and defence.' },
  'BHARTIARTL.BSE': { name: 'Bharti Airtel Ltd', sector: 'Telecommunications', shares: 5865000000, high52: 1779.00, low52: 905.55, desc: 'Bharti Airtel Limited is an Indian multinational telecommunications services company. It operates in 18 countries across South Asia and Africa, being India\'s largest integrated telecom provider.' }
};

const CompanyPage = () => {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [activeTab, setActiveTab] = useState('chart');
  const [user, setUser] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [buySellData, setBuySellData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const intervalRef = useRef(null);
  const retryCountRef = useRef(0);

  // Get user data from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Get Indian company metadata
  const getCompanyMeta = (s) => {
    return INDIAN_COMPANIES[s] || {
      name: s.split('.')[0] + ' Company',
      sector: 'General',
      shares: 1000000000,
      high52: 0,
      low52: 0,
      desc: 'Company information not available.'
    };
  };

  const timeframeRef = useRef(timeframe);
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  // Generate realistic mock chart data
  const generateMockData = useCallback((timeframeType, basePrice = 1000) => {
    const data = [];
    let price = basePrice;
    const volatility = 0.015;
    const points = timeframeType === '1D' ? 24 : timeframeType === '1W' ? 7 : timeframeType === '1M' ? 30 : 365;
    const now = new Date();

    for (let i = points - 1; i >= 0; i--) {
      const change = (Math.random() - 0.48) * volatility * price;
      price += change;
      const pointDate = new Date(now);

      if (timeframeType === '1D') {
        pointDate.setHours(now.getHours() - i);
        data.push({ time: pointDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: parseFloat(price.toFixed(2)), fullDate: pointDate });
      } else {
        pointDate.setDate(now.getDate() - i);
        data.push({ time: pointDate.toLocaleDateString(), price: parseFloat(price.toFixed(2)), fullDate: pointDate });
      }
    }
    return data;
  }, []);

  // Fetch stock data with retry mechanism
  const fetchStockData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      if (!isRefresh) setError('');

      console.log('Fetching stock data for:', symbol);
      const stockData = await getStockData(symbol);

      if (!stockData) {
        throw new Error('No data returned');
      }

      const meta = getCompanyMeta(symbol);
      const companyData = {
        symbol: stockData.symbol,
        name: stockData.name || meta.name,
        sector: meta.sector,
        price: stockData.price || 0,
        change: stockData.change || 0,
        changePercent: stockData.changePercent || 0,
        marketCap: formatMarketCap(meta.shares, stockData.price || 0),
        volume: formatVolume(stockData.volume || 0),
        avgVolume: formatVolume((stockData.volume * 0.95) || 0),
        high52: stockData.high || meta.high52,
        low52: stockData.low || meta.low52,
        previousClose: stockData.previousClose || 0,
        peRatio: (stockData.price / (meta.shares / 100000000)).toFixed(2),
        dividendYield: "1.2%",
        description: meta.desc,
        currency: stockData.currency || 'INR',
        exchange: stockData.exchange || 'BSE'
      };

      setCompany(companyData);
      setLastUpdated(new Date().toLocaleTimeString());
      retryCountRef.current = 0;

      // Stable graph rendering: Initial mock map or graceful live append
      setHistoricalData(prev => {
        const currentTf = timeframeRef.current;
        if (prev.length === 0) {
          return generateMockData(currentTf, companyData.price);
        }
        if (isRefresh && currentTf === '1D') {
          // Append the live tracking data point securely to the chart
          const now = new Date();
          const newPoint = {
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            price: companyData.price,
            fullDate: now
          };
          return [...prev.slice(1), newPoint]; // Keep points window stable
        }
        return prev;
      });

    } catch (err) {
      console.error('Error in fetchStockData:', err);
      if (!isRefresh && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        setError(`Failed to load real-time data. Retrying in 5 seconds... (Attempt ${retryCountRef.current}/3)`);
        setTimeout(() => fetchStockData(false), 5000);
        return;
      }
      setCompany(prev => {
        if (prev) return prev;
        const meta = getCompanyMeta(symbol);
        return {
          symbol, name: meta.name, sector: meta.sector, price: 0, change: 0, changePercent: 0,
          marketCap: 'N/A', volume: 'N/A', high52: meta.high52, low52: meta.low52,
          description: meta.desc, currency: 'INR', exchange: 'BSE'
        };
      });
      setError('Failed to load real-time data. Showing last known values.');
    } finally {
      setLoading(false);
    }
  }, [symbol, generateMockData]);

  // Fetch real news for the company
  const fetchNews = useCallback(async () => {
    try {
      setNewsLoading(true);
      const response = await newsAPI.getStockNews(symbol);
      setNews(response.data || []);
    } catch (err) {
      console.error('Error fetching news:', err);
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  }, [symbol]);


  // Process historical data
  const processHistoricalData = useCallback((data, period) => {
    if (!data || !Array.isArray(data) || data.length === 0) return [];

    // Sort array in chronological order
    const sortedData = [...data].sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));

    return sortedData.map(item => {
      const date = new Date(item.date || item.timestamp);
      // Determine the valid price (could be stored under price, close, or value depending on generic API fallbacks)
      const validPrice = item.close || item.price || item.value || 0;

      return period === '1d'
        ? { time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: validPrice, fullDate: date }
        : { time: date.toLocaleDateString(), price: validPrice, fullDate: date };
    });
  }, []);

  // Fetch historical data
  // This function is no longer directly called by a useEffect for timeframe changes
  // It's kept here for potential future use or if a full historical fetch is needed
  const fetchHistoricalData = useCallback(async () => {
    try {
      let period;
      switch (timeframe) {
        case '1D': period = '1d'; break;
        case '1W': period = '1w'; break;
        case '1M': period = '1m'; break;
        case '1Y': period = '1y'; break;
        default: period = '1d';
      }

      const data = await getStockHistory(symbol, period);
      const processedData = processHistoricalData(data, period);

      if (processedData.length > 0) {
        setHistoricalData(processedData);
      } else {
        setHistoricalData(generateMockData(timeframe, company?.price || 1000));
      }
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setHistoricalData(generateMockData(timeframe, company?.price || 1000));
    }
  }, [symbol, timeframe, processHistoricalData, company, generateMockData]);

  // Buy/sell activity mock data
  const generateBuySellData = useCallback(() => {
    const data = [];
    const baseVolume = 1000;
    for (let i = 0; i < 10; i++) {
      const hour = 9 + Math.floor(i / 2);
      const minute = i % 2 === 0 ? '00' : '30';
      const time = `${hour}:${minute}`;
      const buy = Math.floor(baseVolume * (0.5 + Math.random() * 0.5));
      const sell = Math.floor(baseVolume * (0.3 + Math.random() * 0.4));
      data.push({ time, buy, sell });
    }
    return data;
  }, []);

  // Market cap formatter for INR
  const formatMarketCap = (shares, price) => {
    const mc = price * shares;
    if (mc >= 1e12) return `₹${(mc / 1e12).toFixed(2)} Lakh Cr`;
    if (mc >= 1e10) return `₹${(mc / 1e10).toFixed(2)} Thousand Cr`;
    if (mc >= 1e7) return `₹${(mc / 1e7).toFixed(2)} Cr`;
    return `₹${mc.toFixed(2)}`;
  };

  const formatVolume = (v) => v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}K` : v.toString();

  const handleTimeframeChange = (t) => {
    setTimeframe(t);
    if (company) {
      setHistoricalData(generateMockData(t, company.price));
    }
  };

  // Set up polling for real-time data
  // Interval is 60s to match backend cache TTL – avoids hammering the server
  useEffect(() => {
    retryCountRef.current = 0; // reset retries when symbol changes
    fetchStockData(false);
    intervalRef.current = setInterval(() => fetchStockData(true), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStockData]);

  useEffect(() => {
    if (symbol) {
      setHistoricalData([]); // Flushes map so new symbol generates fresh line based on fetched price
      setBuySellData(generateBuySellData()); // Stays purely static for the symbol viewing period
      fetchNews();
    }
  }, [symbol, generateBuySellData, fetchNews]);

  const hasActiveSubscription = () => user?.subscription?.isActive;
  const handlePredictionClick = () => hasActiveSubscription() ? navigate(`/prediction/${symbol}`) : navigate('/subscription');

  const currencySymbol = company?.currency === 'INR' ? '₹' : '$';

  const CustomTooltip = ({ active, payload, label }) =>
    active && payload?.length ? (
      <div className="custom-tooltip">
        <p className="tooltip-label">{`Time: ${label}`}</p>
        <p className="tooltip-value">{`Price: ${currencySymbol}${payload[0].value.toFixed(2)}`}</p>
      </div>
    ) : null;

  if (loading) return <div className="company-page loading">Loading stock data...</div>;
  if (!company) return <div className="company-page">Company not found</div>;

  return (
    <div className="company-page">
      <div className="company-header">
        <h1>{company.name}</h1>
        <h2>{company.symbol} <span style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>({company.exchange})</span></h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9em', margin: '4px 0' }}>{company.sector}</p>
        <div className="price-info">
          <span className="price">{currencySymbol}{company.price.toFixed(2)}</span>
          <span className={`change ${company.change >= 0 ? 'positive' : 'negative'}`}>
            {company.change >= 0 ? '+' : ''}{company.change.toFixed(2)} ({company.change >= 0 ? '+' : ''}{company.changePercent.toFixed(2)}%)
          </span>
        </div>
        <p>{company.description}</p>
        {lastUpdated && <p className="last-updated">Last updated: {lastUpdated}</p>}
        {error && <p className="error-message">{error}</p>}
        {retryCountRef.current > 0 && retryCountRef.current < 3 && <p>Retry attempt: {retryCountRef.current}/3</p>}
      </div>

      <div className="company-details">
        <div className="detail-item">
          <span className="label">Previous Close</span>
          <span className="value">{currencySymbol}{company.previousClose.toFixed(2)}</span>
        </div>
        <div className="detail-item">
          <span className="label">Day Range</span>
          <span className="value">{currencySymbol}{company.low52.toFixed(2)} - {currencySymbol}{company.high52.toFixed(2)}</span>
        </div>
        <div className="detail-item">
          <span className="label">Year Range</span>
          <span className="value">{currencySymbol}{company.low52.toFixed(2)} - {currencySymbol}{company.high52.toFixed(2)}</span>
        </div>
        <div className="detail-item">
          <span className="label">Market Cap</span>
          <span className="value">{company.marketCap}</span>
        </div>
        <div className="detail-item">
          <span className="label">Avg Volume</span>
          <span className="value">{company.avgVolume}</span>
        </div>
        <div className="detail-item">
          <span className="label">P/E Ratio</span>
          <span className="value">{company.peRatio}</span>
        </div>
        <div className="detail-item">
          <span className="label">Dividend Yield</span>
          <span className="value">{company.dividendYield}</span>
        </div>
        <div className="detail-item">
          <span className="label">Primary Exchange</span>
          <span className="value">{company.exchange}</span>
        </div>
      </div>

      <div className="tabs">
        <button className={activeTab === 'chart' ? 'active' : ''} onClick={() => setActiveTab('chart')}>Price Chart</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History</button>
        <button className={activeTab === 'news' ? 'active' : ''} onClick={() => setActiveTab('news')}>News</button>
        <button className={activeTab === 'analysis' ? 'active' : ''} onClick={() => setActiveTab('analysis')}>Analysis</button>
      </div>

      <div className="tab-content">
        {activeTab === 'chart' && (
          <div className="chart-section">
            <div className="timeframe-selector">
              {['1D', '1W', '1M', '1Y'].map(t => (
                <button key={t} className={timeframe === t ? 'active' : ''} onClick={() => handleTimeframeChange(t)}>{t}</button>
              ))}
            </div>

            <div className="chart-container">
              <h3>Price Chart ({timeframe})</h3>
              {historicalData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="rgba(148,163,184,0.15)" />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="rgba(148,163,184,0.15)" tickFormatter={(value) => `${currencySymbol}${value}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: '#6366f1', stroke: '#818cf8', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-placeholder">Loading chart data...</div>
              )}
            </div>

            <div className="buy-sell-chart">
              <h3>Buy/Sell Activity</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={buySellData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="rgba(148,163,184,0.15)" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="rgba(148,163,184,0.15)" />
                  <Tooltip contentStyle={{ background: '#16213e', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', color: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ color: '#94a3b8' }} />
                  <Bar dataKey="buy" fill="#10b981" name="Buy Orders" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sell" fill="#ef4444" name="Sell Orders" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <h3>Stock Price History</h3>
            <div className="history-grid">
              <div className="history-item">
                <span className="period">1 Day</span>
                <span className={`change ${company.change >= 0 ? 'positive' : 'negative'}`}>
                  {company.change >= 0 ? '+' : ''}{company.change.toFixed(2)} ({company.change >= 0 ? '+' : ''}{company.changePercent.toFixed(2)}%)
                </span>
              </div>
              <div className="history-item">
                <span className="period">1 Week</span>
                <span className="change positive">+{(company.price * 0.025).toFixed(2)} (+2.50%)</span>
              </div>
              <div className="history-item">
                <span className="period">1 Month</span>
                <span className="change positive">+{(company.price * 0.05).toFixed(2)} (+5.00%)</span>
              </div>
              <div className="history-item">
                <span className="period">3 Months</span>
                <span className="change positive">+{(company.price * 0.12).toFixed(2)} (+12.00%)</span>
              </div>
              <div className="history-item">
                <span className="period">1 Year</span>
                <span className="change positive">+{(company.price * 0.22).toFixed(2)} (+22.00%)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'news' && (
          <div className="news-section">
            <h3>Latest News for {company.name}</h3>
            {newsLoading ? (
              <div className="chart-placeholder">Loading news...</div>
            ) : news && news.length > 0 ? (
              <div className="news-list">
                {news.slice(0, 15).map((item, index) => (
                  <div key={item.id || index} className="news-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.8em', textTransform: 'uppercase' }}>
                          {item.source || 'Market News'}
                        </span>
                        {item.sentiment && (
                          <span style={{
                            fontSize: '0.7em',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: '600',
                            textTransform: 'capitalize',
                            background: item.sentiment === 'positive' ? 'rgba(16,185,129,0.15)'
                              : item.sentiment === 'negative' ? 'rgba(239,68,68,0.15)'
                                : 'rgba(148,163,184,0.15)',
                            color: item.sentiment === 'positive' ? '#10b981'
                              : item.sentiment === 'negative' ? '#ef4444'
                                : '#94a3b8',
                          }}>
                            {item.sentiment}
                          </span>
                        )}
                        {item.sector && (
                          <span style={{
                            fontSize: '0.7em',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(99,102,241,0.12)',
                            color: '#818cf8',
                          }}>
                            {item.sector}
                          </span>
                        )}
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8em' }}>
                        {item.datetime ? (() => {
                          const publishDate = new Date(item.datetime * 1000);
                          const now = new Date();
                          const diffMs = now - publishDate;
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHrs = Math.floor(diffMs / 3600000);
                          const diffDays = Math.floor(diffMs / 86400000);
                          const relative = diffMins < 60 ? `${diffMins}m ago`
                            : diffHrs < 24 ? `${diffHrs}h ago`
                              : diffDays < 7 ? `${diffDays}d ago`
                                : '';
                          const dateStr = publishDate.toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          });
                          const timeStr = publishDate.toLocaleTimeString('en-IN', {
                            hour: '2-digit', minute: '2-digit'
                          });
                          return `${dateStr}, ${timeStr}${relative ? ` (${relative})` : ''}`;
                        })() : ''}
                      </span>
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--text-primary)' }}>
                      <h4 style={{ margin: '5px 0', fontSize: '1em' }}>{item.headline}</h4>
                    </a>
                    <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', margin: '5px 0', lineHeight: '1.5' }}>
                      {item.summary && item.summary.length > 200 ? item.summary.substring(0, 200) + '...' : item.summary}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chart-placeholder">No recent news found for this company.</div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="analysis-section">
            <h3>Technical Analysis</h3>
            <div className="analysis-grid">
              <div className="analysis-item">
                <span className="label">RSI (14)</span>
                <span className="value neutral">Calculated by AI Model</span>
              </div>
              <div className="analysis-item">
                <span className="label">MACD</span>
                <span className="value positive">Calculated by AI Model</span>
              </div>
              <div className="analysis-item">
                <span className="label">EMA (12)</span>
                <span className="value positive">Calculated by AI Model</span>
              </div>
              <div className="analysis-item">
                <span className="label">Model Type</span>
                <span className="value">XGBoost Regression</span>
              </div>
              <div className="analysis-item">
                <span className="label">Features Used</span>
                <span className="value">24 (OHLCV + Technical + Lag + Context)</span>
              </div>
              <div className="analysis-item">
                <span className="label">Training Data</span>
                <span className="value">10 Years Historical</span>
              </div>
            </div>

            <div className="prediction-cta">
              <h3>Get AI-Powered Predictions</h3>
              <p>Unlock detailed predictions, buy/sell recommendations, and profit estimates for {company.name}</p>
              <button onClick={handlePredictionClick} className="btn primary">
                {hasActiveSubscription() ? 'View Predictions' : 'Upgrade to Premium'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyPage;