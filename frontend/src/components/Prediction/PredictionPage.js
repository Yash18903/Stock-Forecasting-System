import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { predictionsAPI, newsAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import './PredictionPage.css';

const COMPANY_NAMES = {
  'RELIANCE.BSE': 'Reliance Industries Ltd',
  'TCS.BSE': 'Tata Consultancy Services',
  'WIPRO.BSE': 'Wipro Ltd',
  'INFY.BSE': 'Infosys Ltd',
  'HDFCBANK.BSE': 'HDFC Bank Ltd',
  'ITC.BSE': 'ITC Limited',
  'ICICIBANK.BSE': 'ICICI Bank Ltd',
  'SBI.BSE': 'State Bank of India',
  'ADANIENT.BSE': 'Adani Enterprises Ltd',
  'BHARTIARTL.BSE': 'Bharti Airtel Ltd'
};

/* Custom chart tooltip */
const ChartTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label">{label}</span>
      <span className="chart-tooltip-value">₹{payload[0].value.toFixed(2)}</span>
    </div>
  ) : null;

/* Circular progress ring */
const ConfidenceRing = ({ value, size = 120 }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div className="confidence-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-4)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
        />
      </svg>
      <div className="ring-value">
        <span className="ring-number">{value}%</span>
        <span className="ring-label">Confidence</span>
      </div>
    </div>
  );
};

const PredictionPage = () => {
  const { symbol } = useParams();
  const { theme } = useTheme();
  const [prediction, setPrediction] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [news, setNews] = useState([]);
  const [investAmount, setInvestAmount] = useState(10000);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [predictionResponse, newsResponse] = await Promise.all([
        predictionsAPI.getPrediction(symbol),
        newsAPI.getStockNews(symbol).catch(() => ({ data: [] }))
      ]);
      const data = predictionResponse.data;
      setCompany({ symbol: data.symbol, name: COMPANY_NAMES[data.symbol] || data.symbol.split('.')[0], price: data.currentPrice });
      setPrediction(data);
      setNews(newsResponse.data || []);
    } catch (err) {
      console.error("Failed to fetch prediction:", err);
      setError("Failed to load prediction data. Please try again.");
    } finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Chart data with intermediate points */
  const chartData = useMemo(() => {
    if (!prediction) return [];
    const curr = prediction.currentPrice;
    const target = prediction.targetPrice;
    const diff = target - curr;
    return [
      { time: 'Current', price: curr },
      { time: 'Phase 1', price: +(curr + diff * 0.3).toFixed(2) },
      { time: 'Phase 2', price: +(curr + diff * 0.55).toFixed(2) },
      { time: 'Phase 3', price: +(curr + diff * 0.78).toFixed(2) },
      { time: 'Target', price: target },
    ];
  }, [prediction]);

  /* Profit calc */
  const profitData = useMemo(() => {
    if (!prediction) return null;
    const expectedValue = investAmount * (1 + prediction.expectedReturn / 100);
    return { investment: investAmount, expectedValue, profit: expectedValue - investAmount, returnPct: prediction.expectedReturn };
  }, [prediction, investAmount]);

  if (loading) {
    return (
      <div className="pred-page">
        <div className="pred-loading">
          <div className="pred-loader">
            <div className="loader-ring"></div>
            <div className="loader-ring delay"></div>
          </div>
          <h2>Generating AI Prediction</h2>
          <p>Our XGBoost model is analyzing 24 technical indicators + news sentiment...</p>
          <div className="loading-steps">
            <span className="load-step active">Fetching Data</span>
            <span className="load-step active">Analyzing News</span>
            <span className="load-step active">Running Model</span>
            <span className="load-step">Generating Report</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pred-page">
        <div className="pred-error-view">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          <h2>{error}</h2>
          <button onClick={fetchData} className="retry-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!prediction || !company) return null;

  const isPositive = prediction.expectedReturn >= 0;
  const recommendation = prediction.expectedReturn >= 3 ? 'Strong Buy' :
    prediction.expectedReturn >= 1 ? 'Buy' :
      prediction.expectedReturn >= -1 ? 'Hold' :
        prediction.expectedReturn >= -3 ? 'Sell' : 'Strong Sell';
  const recColor = recommendation.includes('Buy') ? 'green' : recommendation === 'Hold' ? 'yellow' : 'red';

  /* Real Report Download — opens styled HTML report matching current theme */
  const downloadReport = () => {
    setIsGenerating(true);
    const isLight = theme === 'light';

    // ── Palette ──────────────────────────────────────────────────────────────
    const T = isLight ? {
      bg: '#f0f2ff',
      surface: '#ffffff',
      surface2: '#eef0fc',
      surface3: '#e4e7f8',
      heroBg: 'linear-gradient(135deg,#eef0fc 0%,#e4e7f8 100%)',
      heroBorder: '#c7ccf0',
      bodyText: '#0f1020',
      subText: '#3a4060',
      mutedText: '#7b85aa',
      border: '#c7ccf0',
      borderLight: '#d8dcf5',
      statBg: '#f0f2ff',
      calcItem: '#eef0fc',
      footerBg: '#fffbeb',
      footerBorder: 'rgba(245,158,11,0.25)',
      footerText: '#92400e',
      printBarBg: '#ffffff',
      printBarBorder: '#d8dcf5',
      sectionBg: '#ffffff',
      watermark: '#c7ccf0',
      newsBg: '#eef0fc',
      newsBorder: '#d8dcf5',
    } : {
      bg: '#0d1117',
      surface: '#131b2e',
      surface2: '#1a2540',
      surface3: '#1e2433',
      heroBg: 'linear-gradient(135deg,#131b2e 0%,#1a2540 100%)',
      heroBorder: '#1e3a5f',
      bodyText: '#e2e8f0',
      subText: '#94a3b8',
      mutedText: '#64748b',
      border: '#1e2a3a',
      borderLight: '#2d3748',
      statBg: '#0d1523',
      calcItem: '#1e2433',
      footerBg: '#1a1200',
      footerBorder: 'rgba(245,158,11,0.15)',
      footerText: '#92400e',
      printBarBg: '#131b2e',
      printBarBorder: '#1e2a3a',
      sectionBg: '#131b2e',
      watermark: '#1e2a3a',
      newsBg: '#1e2433',
      newsBorder: '#2d3748',
    };

    const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const reportTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const isPos = prediction.expectedReturn >= 0;
    const recLabel = prediction.expectedReturn >= 3 ? 'Strong Buy' :
      prediction.expectedReturn >= 1 ? 'Buy' :
        prediction.expectedReturn >= -1 ? 'Hold' :
          prediction.expectedReturn >= -3 ? 'Sell' : 'Strong Sell';
    const recColor = recLabel.includes('Buy') ? '#10b981' : recLabel === 'Hold' ? '#f59e0b' : '#ef4444';
    const confColor = prediction.confidence >= 70 ? '#10b981' : prediction.confidence >= 50 ? '#f59e0b' : '#ef4444';
    const riskColor = prediction.risk.toLowerCase() === 'high' ? '#ef4444' : prediction.risk.toLowerCase() === 'medium' ? '#f59e0b' : '#10b981';
    const profitValue = investAmount * (prediction.expectedReturn / 100);
    const expectedValue = investAmount + profitValue;

    const factorsHTML = prediction.factors.map(f => {
      const fc = f.status.toLowerCase() === 'positive' ? '#10b981' : f.status.toLowerCase() === 'neutral' ? '#f59e0b' : '#ef4444';
      return `
        <div style="padding:14px 18px;background:${T.calcItem};border-radius:10px;border-left:3px solid ${fc};margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:14px;font-weight:700;color:${T.bodyText};">${f.name}</span>
            <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;background:${fc}22;color:${fc};">${f.status.toUpperCase()}</span>
          </div>
          <p style="font-size:12px;color:${T.subText};margin:0 0 10px;line-height:1.5;">${f.description}</p>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;height:5px;background:${T.borderLight};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${f.score}%;background:${fc};border-radius:3px;"></div>
            </div>
            <span style="font-size:12px;color:${T.mutedText};font-weight:600;min-width:36px;text-align:right;">${f.score}%</span>
          </div>
        </div>`;
    }).join('');

    const newsHTML = news.length > 0
      ? news.slice(0, 5).map(item => `
        <div style="padding:12px 16px;background:${T.newsBg};border-radius:8px;border:1px solid ${T.newsBorder};margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:700;color:#818cf8;text-transform:uppercase;">${item.source || 'News'}</span>
            <span style="font-size:11px;color:${T.mutedText};">${item.datetime ? new Date(item.datetime * 1000).toLocaleDateString() : ''}</span>
          </div>
          <p style="font-size:13px;font-weight:600;color:${T.bodyText};margin:0;line-height:1.4;">${item.headline.length > 110 ? item.headline.substring(0, 110) + '…' : item.headline}</p>
        </div>`).join('')
      : `<p style="color:${T.mutedText};font-size:13px;text-align:center;padding:20px;">No recent news available for this company.</p>`;

    const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Report — ${company.name} (${company.symbol})</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: ${T.bg}; color: ${T.bodyText}; line-height: 1.6; }
    @page { size: A4; margin: 12mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: ${T.bg} !important; color: ${T.bodyText} !important; }
      .no-print { display: none !important; }
      .page-break { break-inside: avoid; }
    }
    .container { max-width: 860px; margin: 0 auto; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid ${T.border}; }
    .header-left h1 { font-size: 26px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; margin-bottom: 4px; }
    .header-left p { font-size: 13px; color: ${T.subText}; }
    .logo-area { text-align: right; }
    .logo-area .brand { font-size: 20px; font-weight: 800; background: linear-gradient(135deg, #6366f1, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.5px; }
    .logo-area .sub { font-size: 11px; color: ${T.mutedText}; margin-top: 2px; }
    .report-meta { font-size: 11px; color: ${T.mutedText}; margin-top: 6px; }
    /* Hero Card */
    .hero-card { background: ${T.heroBg}; border: 1px solid ${T.heroBorder}; border-radius: 16px; padding: 28px; margin-bottom: 20px; position: relative; overflow: hidden; }
    .hero-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #818cf8, #a78bfa); }
    .hero-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
    .company-title { font-size: 22px; font-weight: 800; color: ${T.bodyText}; letter-spacing: -0.5px; margin-bottom: 8px; }
    .meta-row { display: flex; gap: 10px; align-items: center; }
    .symbol-tag { background: ${T.surface2}; color: ${T.subText}; font-family: monospace; font-size: 12px; padding: 3px 10px; border-radius: 6px; font-weight: 600; border: 1px solid ${T.borderLight}; }
    .rec-tag { font-size: 11px; font-weight: 800; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .confidence-box { text-align: center; }
    .conf-num { font-size: 36px; font-weight: 800; color: ${confColor}; display: block; line-height: 1; }
    .conf-label { font-size: 11px; color: ${T.mutedText}; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-top: 4px; display: block; }
    .price-row { display: flex; align-items: baseline; gap: 14px; margin-bottom: 20px; }
    .current-price { font-size: 38px; font-weight: 800; color: ${T.bodyText}; letter-spacing: -1px; }
    .return-badge { font-size: 16px; font-weight: 700; color: ${isPos ? '#10b981' : '#ef4444'}; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .stat-box { background: ${T.statBg}; border-radius: 10px; padding: 14px; text-align: center; border: 1px solid ${T.border}; }
    .stat-label { font-size: 10px; color: ${T.mutedText}; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; display: block; }
    .stat-val { font-size: 17px; font-weight: 800; color: ${T.bodyText}; }
    /* Sections */
    .section { background: ${T.sectionBg}; border: 1px solid ${T.border}; border-radius: 14px; padding: 22px; margin-bottom: 16px; }
    .section-title { font-size: 14px; font-weight: 700; color: ${T.bodyText}; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid ${T.border}; display: flex; justify-content: space-between; align-items: center; }
    .section-badge { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 20px; background: rgba(99,102,241,0.15); color: #818cf8; }
    /* Calculator */
    .calc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .calc-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: ${T.calcItem}; border-radius: 8px; border: 1px solid ${T.borderLight}; }
    .calc-item.highlight { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); }
    .calc-label { font-size: 12px; color: ${T.mutedText}; font-weight: 500; }
    .calc-value { font-size: 15px; font-weight: 800; color: ${T.bodyText}; }
    /* Footer */
    .footer { margin-top: 28px; padding: 18px 22px; background: ${T.footerBg}; border: 1px solid ${T.footerBorder}; border-radius: 10px; font-size: 11.5px; color: ${T.footerText}; line-height: 1.6; }
    .footer strong { color: #f59e0b; font-size: 12px; }
    /* Print bar */
    .print-bar { position: fixed; top: 0; left: 0; right: 0; background: ${T.printBarBg}; border-bottom: 1px solid ${T.printBarBorder}; padding: 12px 32px; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
    .print-bar span { font-size: 14px; color: ${T.subText}; font-weight: 500; }
    .btn-dl { background: linear-gradient(135deg, #6366f1, #818cf8); border: none; color: white; font-size: 14px; font-weight: 700; padding: 10px 24px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: 'Inter', sans-serif; transition: opacity 0.2s; }
    .btn-dl:hover { opacity: 0.85; }
    .btn-close { background: ${T.calcItem}; border: 1px solid ${T.borderLight}; color: ${T.subText}; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; }
    .print-spacer { height: 64px; }
    .watermark { position: fixed; bottom: 20px; right: 24px; font-size: 11px; color: ${T.watermark}; font-weight: 600; pointer-events: none; }
    /* Theme label badge */
    .theme-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: rgba(99,102,241,0.15); color: #818cf8; text-transform: uppercase; letter-spacing: 1px; vertical-align: middle; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span>📊 AI Prediction Report — ${company.name}</span>
    <div style="display:flex;gap:10px;">
      <button class="btn-close" onclick="window.close()">✕ Close</button>
      <button class="btn-dl" onclick="window.print()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Save as PDF
      </button>
    </div>
  </div>
  <div class="print-spacer no-print"></div>

  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <h1>AI Prediction Report <span class="theme-badge">${isLight ? '☀️ Light' : '🌙 Dark'}</span></h1>
        <p>Generated by Stockzen AI · XGBoost + News Sentiment Model</p>
        <div class="report-meta">Report Date: <strong style="color:#818cf8">${reportDate}</strong> at ${reportTime}</div>
      </div>
      <div class="logo-area">
        <div class="brand">Stockzen AI</div>
        <div class="sub">Powered by ML + Sentiment Analysis</div>
      </div>
    </div>

    <!-- Hero Card -->
    <div class="hero-card page-break">
      <div class="hero-top">
        <div>
          <div class="company-title">${company.name}</div>
          <div class="meta-row">
            <span class="symbol-tag">${company.symbol}</span>
            <span class="rec-tag" style="background:${recColor}22;color:${recColor};">${recLabel}</span>
          </div>
        </div>
        <div class="confidence-box">
          <span class="conf-num">${prediction.confidence}%</span>
          <span class="conf-label">AI Confidence</span>
        </div>
      </div>
      <div class="price-row">
        <span class="current-price">₹${prediction.currentPrice.toFixed(2)}</span>
        <span class="return-badge">${isPos ? '▲' : '▼'} ${Math.abs(prediction.expectedReturn).toFixed(2)}% Expected Return</span>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><span class="stat-label">Target Price</span><span class="stat-val" style="color:#818cf8;">₹${prediction.targetPrice.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Expected Return</span><span class="stat-val" style="color:${isPos ? '#10b981' : '#ef4444'};">${isPos ? '+' : ''}${prediction.expectedReturn.toFixed(2)}%</span></div>
        <div class="stat-box"><span class="stat-label">Risk Level</span><span class="stat-val" style="color:${riskColor};">${prediction.risk}</span></div>
        <div class="stat-box"><span class="stat-label">Confidence</span><span class="stat-val" style="color:${confColor};">${prediction.confidence}%</span></div>
      </div>
    </div>

    <!-- Profit Calculator Summary -->
    <div class="section page-break">
      <div class="section-title">Profit Calculator Summary <span class="section-badge">₹${investAmount.toLocaleString()} Investment</span></div>
      <div class="calc-grid">
        <div class="calc-item"><span class="calc-label">Investment Amount</span><span class="calc-value">₹${investAmount.toLocaleString()}</span></div>
        <div class="calc-item"><span class="calc-label">Expected Value</span><span class="calc-value">₹${expectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
        <div class="calc-item highlight"><span class="calc-label">Estimated Profit</span><span class="calc-value" style="color:${profitValue >= 0 ? '#10b981' : '#ef4444'}">${profitValue >= 0 ? '+' : '−'}₹${Math.abs(profitValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
        <div class="calc-item"><span class="calc-label">Return on Investment</span><span class="calc-value" style="color:${isPos ? '#10b981' : '#ef4444'}">${isPos ? '+' : ''}${prediction.expectedReturn.toFixed(2)}%</span></div>
      </div>
    </div>

    <!-- AI Factors -->
    <div class="section page-break">
      <div class="section-title">AI Analysis Factors <span class="section-badge">${prediction.factors.length} Signals</span></div>
      ${factorsHTML}
    </div>

    <!-- News -->
    <div class="section page-break">
      <div class="section-title">Market News  <span class="section-badge">${symbol.split('.')[0]}</span></div>
      ${newsHTML}
    </div>

    <!-- Disclaimer -->
    <div class="footer">
      <strong>⚠ Investment Disclaimer</strong><br/>
      This AI-generated report is for informational and educational purposes only. Past performance and model predictions do not guarantee future results. The predictions are based on historical technical indicators and news sentiment analysis. Always consult a SEBI-registered financial advisor before making investment decisions. Stockzen AI is not liable for any financial losses.
    </div>
  </div>

  <div class="watermark">Stockzen AI — Confidential</div>

  <script>
    window.onload = () => { setTimeout(() => window.print(), 600); };
  </script>
</body>
</html>`;

    const reportWindow = window.open('', '_blank', 'width=920,height=1100');
    if (reportWindow) {
      reportWindow.document.write(htmlContent);
      reportWindow.document.close();
    }

    setTimeout(() => setIsGenerating(false), 1500);
  };

  return (
    <div className="pred-page">
      <div className="pred-container">

        {/* ── Breadcrumb ── */}
        <div className="pred-breadcrumb">
          <Link to="/dashboard">Dashboard</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          <Link to={`/ company / ${symbol} `}>{symbol.split('.')[0]}</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          <span>AI Prediction</span>
        </div>

        {/* ── Hero Banner ── */}
        <div className="pred-hero">
          <div className="pred-hero-left">
            <div className="pred-company-info">
              <h1>{company.name}</h1>
              <div className="pred-meta">
                <span className="pred-symbol">{company.symbol}</span>
                <span className={`pred - rec - badge ${recColor} `}>{recommendation}</span>
              </div>
            </div>
            <div className="pred-price-block">
              <span className="pred-current-price">₹{company.price.toFixed(2)}</span>
              <span className={`pred -return -badge ${isPositive ? 'positive' : 'negative'} `}>
                {isPositive ? '↑' : '↓'} {Math.abs(prediction.expectedReturn).toFixed(2)}%
              </span>
            </div>
            <div className="pred-target-row">
              <div className="target-item">
                <span className="target-label">Target</span>
                <span className="target-value">₹{prediction.targetPrice.toFixed(2)}</span>
              </div>
              <div className="target-item">
                <span className="target-label">Risk</span>
                <span className={`target - value risk - ${prediction.risk.toLowerCase()} `}>{prediction.risk}</span>
              </div>
              <div className="target-item">
                <span className="target-label">Generated</span>
                <span className="target-value">{new Date().toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          </div>
          <div className="pred-hero-right">
            <ConfidenceRing value={prediction.confidence} />
            <button
              id="dl-btn"
              className={`download - report - btn ${isGenerating ? 'generating' : ''} `}
              onClick={downloadReport}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Download Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div className="pred-grid">

          {/* Chart */}
          <div className="pred-card pred-chart-card">
            <div className="card-header">
              <h3>Price Trajectory</h3>
              <span className="card-badge">AI Forecast</span>
            </div>
            <div className="pred-chart">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                  <XAxis dataKey="time" tick={{ fill: '#5b6b82', fontSize: 11, fontWeight: 500 }} stroke="none" />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fill: '#5b6b82', fontSize: 11 }} stroke="none" tickFormatter={v => `₹${v} `} width={65} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={prediction.currentPrice} stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4" label={{ value: 'Current', fill: '#6366f1', fontSize: 10, position: 'right' }} />
                  <Area type="monotone" dataKey="price" stroke={isPositive ? '#10b981' : '#ef4444'} strokeWidth={2.5} fill="url(#priceGradient)" dot={{ r: 4, fill: 'var(--surface-2)', stroke: isPositive ? '#10b981' : '#ef4444', strokeWidth: 2 }} activeDot={{ r: 6, fill: isPositive ? '#10b981' : '#ef4444', stroke: 'white', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Profit Calculator */}
          <div className="pred-card pred-calc-card">
            <div className="card-header">
              <h3>Profit Calculator</h3>
              <span className="card-badge">Interactive</span>
            </div>
            <div className="calc-input-group">
              <label>Investment Amount (₹)</label>
              <div className="calc-input-wrap">
                <span className="calc-currency">₹</span>
                <input type="number" value={investAmount} onChange={e => setInvestAmount(Math.max(0, Number(e.target.value)))} />
              </div>
              <div className="calc-presets">
                {[5000, 10000, 25000, 50000, 100000].map(v => (
                  <button key={v} className={`preset - btn ${investAmount === v ? 'active' : ''} `} onClick={() => setInvestAmount(v)}>
                    ₹{v >= 100000 ? `${v / 100000} L` : `${v / 1000} K`}
                  </button>
                ))}
              </div>
            </div>
            {profitData && (
              <div className="calc-results">
                <div className="calc-result-item">
                  <span className="calc-label">Investment</span>
                  <span className="calc-value">₹{profitData.investment.toLocaleString()}</span>
                </div>
                <div className="calc-result-item">
                  <span className="calc-label">Expected Value</span>
                  <span className="calc-value">₹{profitData.expectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="calc-result-divider"></div>
                <div className="calc-result-item highlight">
                  <span className="calc-label">Estimated Profit</span>
                  <span className={`calc - value ${profitData.profit >= 0 ? 'positive' : 'negative'} `}>
                    {profitData.profit >= 0 ? '+' : ''}₹{profitData.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="calc-result-item">
                  <span className="calc-label">Return</span>
                  <span className={`calc - value ${profitData.returnPct >= 0 ? 'positive' : 'negative'} `}>
                    {profitData.returnPct >= 0 ? '+' : ''}{profitData.returnPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Factors */}
          <div className="pred-card pred-factors-card">
            <div className="card-header">
              <h3>AI Analysis Factors</h3>
              <span className="card-badge">{prediction.factors.length} Signals</span>
            </div>
            <p className="factors-subtitle">Key indicators influencing the prediction model</p>
            <div className="factors-list">
              {prediction.factors.map((factor, index) => (
                <div key={index} className="factor-row">
                  <div className="factor-info">
                    <div className="factor-name-row">
                      <span className="factor-name">{factor.name}</span>
                      <span className={`factor - tag ${factor.status.toLowerCase()} `}>{factor.status}</span>
                    </div>
                    <p className="factor-desc">{factor.description}</p>
                  </div>
                  <div className="factor-bar-wrap">
                    <div className="factor-bar">
                      <div className="factor-bar-fill" style={{ width: `${factor.score}% `, background: factor.status.toLowerCase() === 'positive' ? 'var(--green)' : factor.status.toLowerCase() === 'neutral' ? 'var(--yellow)' : 'var(--red)' }}></div>
                    </div>
                    <span className="factor-score">{factor.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* News */}
          <div className="pred-card pred-news-card">
            <div className="card-header">
              <h3>Market News</h3>
              <span className="card-badge">{symbol.split('.')[0]}</span>
            </div>
            {news && news.length > 0 ? (
              <div className="news-feed">
                {news.slice(0, 6).map((item, index) => (
                  <a key={item.id || index} href={item.url} target="_blank" rel="noopener noreferrer" className="news-feed-item">
                    <div className="news-feed-top">
                      <span className="news-source-tag">{item.source}</span>
                      <span className="news-date-tag">{new Date(item.datetime * 1000).toLocaleDateString()}</span>
                    </div>
                    <h4>{item.headline.length > 90 ? item.headline.substring(0, 90) + '...' : item.headline}</h4>
                    {item.summary && <p>{item.summary.length > 100 ? item.summary.substring(0, 100) + '...' : item.summary}</p>}
                  </a>
                ))}
              </div>
            ) : (
              <div className="news-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <p>No recent news for this company</p>
              </div>
            )}
          </div>

        </div>

        {/* ── Actionable Insight ── */}
        <div className="pred-card pred-insight-card" style={{ marginTop: '20px', gridColumn: '1 / -1' }}>
          <div className="card-header">
            <h3>Actionable Insight</h3>
            <span className="card-badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>AI Strategy</span>
          </div>
          <div className="insight-content" style={{ padding: '20px', background: 'var(--surface-2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <p style={{ marginBottom: '16px', lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--text-primary)' }}>→ Outlook:</strong> The predicted price of ₹{prediction.targetPrice.toFixed(2)} sits {prediction.expectedReturn >= 0 ? 'modestly above' : 'below'} the recent intraday range. Combined with {recommendation === 'Buy' || recommendation === 'Strong Buy' ? 'upbeat AI and market news' : 'current market sentiment'}, the short-term bias leans {prediction.expectedReturn >= 0 ? 'bullish' : 'bearish'}.
            </p>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '250px', background: 'rgba(16,185,129,0.1)', borderLeft: '4px solid #10b981', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                <strong style={{ color: '#10b981', display: 'block', marginBottom: '8px' }}>DO:</strong>
                <p style={{ fontSize: '0.95em', margin: 0 }}>Consider a {prediction.expectedReturn >= 0 ? 'buy-on-dip' : 'short or accumulation'} if {company.symbol.split('.')[0]} trades ≤{(prediction.currentPrice * 0.99).toFixed(2)}, targeting the forecasted {prediction.targetPrice.toFixed(2)} as a near-term exit point.</p>
              </div>
              <div style={{ flex: 1, minWidth: '250px', background: 'rgba(239,68,68,0.1)', borderLeft: '4px solid #ef4444', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '8px' }}>DON'T:</strong>
                <p style={{ fontSize: '0.95em', margin: 0 }}>Initiate a fresh position above ₹{(prediction.currentPrice * 1.015).toFixed(2)} without additional confirmation, as the {prediction.expectedReturn >= 0 ? 'upside' : 'downside'} may be limited in the immediate session.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div className="pred-disclaimer" style={{ marginTop: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Disclaimer: I am an AI, not your stock broker.</strong>
            <p style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>This note is based solely on the provided prediction model and news items processed by artificial intelligence, which lacks human intuition regarding black-swan market events. It does not constitute investment advice. Investors should conduct their own robust due diligence, consult human financial advisors, and profoundly consider market risks before executing trades based on machine logic.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PredictionPage;