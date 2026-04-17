import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

/* Animated counter hook */
const useCountUp = (end, duration = 2000, trigger = false) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration, trigger]);
  return count;
};

/* Intersection observer hook */
const useInView = (threshold = 0.2) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
};

const TICKER_STOCKS = [
  { symbol: 'RELIANCE', price: '₹2,847.30', change: '+1.24%', up: true },
  { symbol: 'TCS', price: '₹3,921.50', change: '+0.85%', up: true },
  { symbol: 'INFY', price: '₹1,654.10', change: '-0.32%', up: false },
  { symbol: 'HDFC BANK', price: '₹1,723.80', change: '+0.67%', up: true },
  { symbol: 'WIPRO', price: '₹425.60', change: '-0.54%', up: false },
  { symbol: 'TATA MOTORS', price: '₹987.40', change: '+2.15%', up: true },
  { symbol: 'ICICI BANK', price: '₹1,245.90', change: '+0.93%', up: true },
  { symbol: 'SBI', price: '₹834.20', change: '+0.41%', up: true },
  { symbol: 'ADANI ENT', price: '₹3,102.70', change: '-1.07%', up: false },
  { symbol: 'BHARTI AIRTEL', price: '₹1,567.30', change: '+0.78%', up: true },
];

const HomePage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [statsRef, statsInView] = useInView(0.3);
  const [featuresRef, featuresInView] = useInView(0.15);
  const [howRef, howInView] = useInView(0.15);
  const [trustRef, trustInView] = useInView(0.15);
  const [ctaRef, ctaInView] = useInView(0.15);

  const users = useCountUp(50000, 2200, statsInView);
  const predictions = useCountUp(1000000, 2500, statsInView);
  const accuracy = useCountUp(85, 1800, statsInView);
  const companies = useCountUp(10, 1200, statsInView);

  const checkAuth = useCallback(() => {
    setIsLoggedIn(!!localStorage.getItem('user'));
  }, []);

  useEffect(() => {
    checkAuth();
    window.addEventListener('storage', checkAuth);
    window.addEventListener('userUpdated', checkAuth);
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('userUpdated', checkAuth);
    };
  }, [checkAuth]);

  return (
    <div className="homepage">

      {/* Live Ticker */}
      <div className="ticker-bar">
        <div className="ticker-track">
          {[...TICKER_STOCKS, ...TICKER_STOCKS].map((s, i) => (
            <div key={i} className="ticker-item">
              <span className="ticker-symbol">{s.symbol}</span>
              <span className="ticker-price">{s.price}</span>
              <span className={`ticker-change ${s.up ? 'up' : 'down'}`}>{s.change}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Hero ─── */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-grid-overlay"></div>
          <div className="hero-gradient-orb hero-orb-1"></div>
          <div className="hero-gradient-orb hero-orb-2"></div>
        </div>
        <div className="hero-content container">
          <div className="hero-badge badge badge-brand">
            <span className="live-dot"></span> Live AI Predictions
          </div>
          <h1 className="hero-title">
            The Future of<br />
            <span className="text-gradient">Stock Analysis</span>
          </h1>
          <p className="hero-subtitle">
            Enterprise-grade AI predictions for BSE-listed companies. Powered by XGBoost models
            trained on 10 years of market data with 24 technical indicators.
          </p>
          <div className="hero-actions">
            {!isLoggedIn ? (
              <>
                <Link to="/register" className="btn-hero-primary">
                  Get Started Free
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <Link to="/dashboard" className="btn-hero-secondary">
                  View Live Demo
                </Link>
              </>
            ) : (
              <Link to="/dashboard" className="btn-hero-primary">
                Open Dashboard
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            )}
          </div>
          <div className="hero-trust-row">
            <div className="trust-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              256-bit SSL Encrypted
            </div>
            <div className="trust-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              SEBI Compliant
            </div>
            <div className="trust-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              Real-time Data
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="stats-section" ref={statsRef}>
        <div className="container">
          <div className="stats-grid">
            <div className={`stat-card ${statsInView ? 'visible' : ''}`}>
              <span className="stat-number">{users.toLocaleString()}+</span>
              <span className="stat-label">Active Users</span>
            </div>
            <div className={`stat-card ${statsInView ? 'visible' : ''}`} style={{ animationDelay: '0.1s' }}>
              <span className="stat-number">{predictions >= 1000000 ? '1M' : `${(predictions / 1000).toFixed(0)}K`}+</span>
              <span className="stat-label">Predictions Made</span>
            </div>
            <div className={`stat-card ${statsInView ? 'visible' : ''}`} style={{ animationDelay: '0.2s' }}>
              <span className="stat-number">{accuracy}%</span>
              <span className="stat-label">Model Accuracy</span>
            </div>
            <div className={`stat-card ${statsInView ? 'visible' : ''}`} style={{ animationDelay: '0.3s' }}>
              <span className="stat-number">{companies}+</span>
              <span className="stat-label">BSE Companies</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Bento Grid ─── */}
      <section className="features-section" ref={featuresRef}>
        <div className="container">
          <div className="section-header">
            <span className="section-label">Capabilities</span>
            <h2 className="section-title">Built for Serious Investors</h2>
            <p className="section-subtitle">Professional-grade tools that institutional traders rely on, now accessible to everyone.</p>
          </div>

          <div className={`bento-grid ${featuresInView ? 'visible' : ''}`}>
            <div className="bento-card bento-large">
              <div className="bento-icon-wrap">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
              </div>
              <h3>AI-Powered Predictions</h3>
              <p>Per-company XGBoost models trained on 10 years of BSE historical data. Each model uses 24 engineered technical features including RSI, MACD, Bollinger Bands, and volume analytics.</p>
              <div className="bento-tag">Machine Learning</div>
            </div>

            <div className="bento-card">
              <div className="bento-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <h3>Real-time Charts</h3>
              <p>Interactive price charts with multiple timeframes, volume analysis, and buy/sell activity tracking.</p>
            </div>

            <div className="bento-card">
              <div className="bento-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </div>
              <h3>Bank-grade Security</h3>
              <p>OAuth 2.0. JWT authentication. OTP verification. End-to-end encryption on all API endpoints.</p>
            </div>

            <div className="bento-card">
              <div className="bento-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </div>
              <h3>Live Market News</h3>
              <p>Real-time financial news powered by Finnhub API, filtered and tailored to your watched stocks.</p>
            </div>

            <div className="bento-card bento-wide">
              <div className="bento-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
              </div>
              <h3>Confidence Scoring & Factor Analysis</h3>
              <p>Every prediction comes with a confidence percentage, target prices, and a breakdown of contributing factors — technical signals, market sentiment, and volume patterns.</p>
              <div className="bento-tag">Advanced Analytics</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="how-section" ref={howRef}>
        <div className="container">
          <div className="section-header center">
            <span className="section-label">Process</span>
            <h2 className="section-title">Three Steps to Smarter Investing</h2>
          </div>

          <div className={`steps-grid ${howInView ? 'visible' : ''}`}>
            <div className="step-card">
              <div className="step-number">01</div>
              <h3>Create Account</h3>
              <p>Sign up with email or Google. OTP-verified for complete security. Takes under 60 seconds.</p>
              <div className="step-line"></div>
            </div>
            <div className="step-card" style={{ animationDelay: '0.15s' }}>
              <div className="step-number">02</div>
              <h3>Choose a Plan</h3>
              <p>Flexible subscriptions — weekly, monthly, or annual. Pay securely via UPI or card through Razorpay.</p>
              <div className="step-line"></div>
            </div>
            <div className="step-card" style={{ animationDelay: '0.3s' }}>
              <div className="step-number">03</div>
              <h3>Get Predictions</h3>
              <p>Access AI-powered predictions, recommendations, confidence scores, and factor analysis for BSE stocks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Proof ─── */}
      <section className="trust-section" ref={trustRef}>
        <div className="container">
          <div className="section-header center">
            <span className="section-label">Testimonials</span>
            <h2 className="section-title">Trusted by Professionals</h2>
          </div>

          <div className={`testimonials-grid ${trustInView ? 'visible' : ''}`}>
            <div className="testimonial-card">
              <div className="stars">★★★★★</div>
              <p className="quote">"The detailed analysis and AI predictions help me make informed decisions for my clients. The per-company models are impressively accurate."</p>
              <div className="testimonial-author">
                <div className="author-avatar">RP</div>
                <div>
                  <strong>Raj Patel</strong>
                  <span>Investment Advisor</span>
                </div>
              </div>
            </div>
            <div className="testimonial-card" style={{ animationDelay: '0.1s' }}>
              <div className="stars">★★★★★</div>
              <p className="quote">"StockZen's prediction platform is impressive! The BSE market insights and confidence scores give me an edge in portfolio management."</p>
              <div className="testimonial-author">
                <div className="author-avatar">PS</div>
                <div>
                  <strong>Priya Sharma</strong>
                  <span>Portfolio Manager</span>
                </div>
              </div>
            </div>
            <div className="testimonial-card" style={{ animationDelay: '0.2s' }}>
              <div className="stars">★★★★★</div>
              <p className="quote">"The real-time charts and factor analysis are game-changers. Finally a platform that combines ML with actual market intelligence."</p>
              <div className="testimonial-author">
                <div className="author-avatar">AK</div>
                <div>
                  <strong>Amit Kumar</strong>
                  <span>Day Trader</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="cta-section" ref={ctaRef}>
        <div className="container">
          <div className={`cta-card ${ctaInView ? 'visible' : ''}`}>
            <h2>Ready to Make Smarter Trades?</h2>
            <p>Join 50,000+ investors using AI to navigate the Indian stock market.</p>
            <div className="cta-actions">
              {!isLoggedIn ? (
                <Link to="/register" className="btn-cta">
                  Start Free Trial
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
              ) : (
                <Link to="/dashboard" className="btn-cta">
                  Go to Dashboard
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
              )}
            </div>
            <p className="cta-disclaimer">No credit card required • Cancel anytime</p>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HomePage;