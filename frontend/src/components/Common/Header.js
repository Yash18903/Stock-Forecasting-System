import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import './Header.css';



const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }

    // Listen for user updates (from login)
    const handleUserUpdate = () => {
      const updatedUser = localStorage.getItem('user');
      if (updatedUser) {
        setUser(JSON.parse(updatedUser));
      } else {
        setUser(null);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdate);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdate);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleProfile = () => {
    setIsProfileOpen(!isProfileOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setIsProfileOpen(false);
    navigate('/');
    window.dispatchEvent(new Event('userUpdated'));
  };

  const handleProfileClick = () => {
    setIsProfileOpen(false);
    // Navigate to profile page (to be implemented)
    navigate('/profile');
  };

  const handleSettingsClick = () => {
    setIsProfileOpen(false);
    // Navigate to settings page (to be implemented)
    navigate('/settings');
  };

  return (
    <header className="header">
      <div className="container">
        <Link to="/" className="logo">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 26H26" stroke="url(#logo-gradient)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M10 21L14 15L18 19L24 9" stroke="url(#logo-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="9" r="3" fill="url(#logo-gradient)" />
              <defs>
                <linearGradient id="logo-gradient" x1="6" y1="26" x2="24" y2="9" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="logo-text">StockZen</span>
        </Link>

        <nav className={`nav ${isMenuOpen ? 'nav-open' : ''}`}>
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <Link to="/subscription" className="nav-link">Premium</Link>
        </nav>

        {/* Theme Toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <span className="theme-toggle-track">
            <span className="theme-toggle-thumb">
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
          </span>
          <span className="theme-toggle-label">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>

        <div className="auth-buttons">
          {user ? (
            <div className="user-profile" ref={profileRef}>
              <button
                className="profile-btn"
                onClick={toggleProfile}
                aria-expanded={isProfileOpen}
                aria-label="User profile"
              >
                <div className="profile-avatar">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="profile-name">{user.name}</span>
                <span className={`dropdown-arrow ${isProfileOpen ? 'open' : ''}`}>▼</span>
              </button>

              {isProfileOpen && (
                <div className="profile-dropdown">
                  <button
                    className="dropdown-item"
                    onClick={handleProfileClick}
                  >
                    <span className="dropdown-icon">👤</span>
                    Account
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={handleSettingsClick}
                  >
                    <span className="dropdown-icon">⚙️</span>
                    Settings
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={handleLogout}
                  >
                    <span className="dropdown-icon">🚪</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/login" className="btn outline">Login</Link>
              <Link to="/register" className="btn primary">Sign Up</Link>
            </>
          )}
        </div>

        <button className="menu-toggle" onClick={toggleMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  );
};

export default Header;