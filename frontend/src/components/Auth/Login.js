import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';
import './Login.css';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [oauthProcessed, setOauthProcessed] = useState(false);
  
  const navigate = useNavigate();

  // Handle OAuth callback - fixed to run only once
  useEffect(() => {
    const token = searchParams.get('token');
    
    // Only process if we have a token and haven't processed it already
    if (token && !oauthProcessed) {
      setOauthProcessed(true);
      localStorage.setItem('authToken', token);
      
      // Fetch user data
      authAPI.getCurrentUser()
        .then(response => {
          const userData = response.data;
          localStorage.setItem('user', JSON.stringify(userData));
          window.dispatchEvent(new Event('userUpdated'));
          navigate('/dashboard');
        })
        .catch(error => {
          console.error('Error fetching user data:', error);
          setError('Failed to complete authentication. Please try again.');
        });
    }
  }, [searchParams, navigate, oauthProcessed]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.login({ 
        email: formData.email, 
        password: formData.password 
      });
      
      // Store token and user data
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      window.dispatchEvent(new Event('userUpdated'));
      
      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Login failed:', err);
      setError(
        err.response?.data?.message || 
        'Login failed. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/google`;
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <Link to="/" className="back-link">← Back to Home</Link>
        
        <div className="auth-header">
          <h1>StockZen</h1>
          <h2>Welcome Back</h2>
          <p>Sign in to your account to continue</p>
        </div>

        <div className="auth-form">
          <h3>Login to Your Account</h3>
          <p>Enter your credentials to access your dashboard</p>

          <button 
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            Continue with Google
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          <form onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-options">
              <label className="checkbox">
                <input type="checkbox" disabled={loading} />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
            </div>

            <button 
              type="submit" 
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Sign up</Link>
          </p>

          <p className="auth-terms">
            By signing in, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;