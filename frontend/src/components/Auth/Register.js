import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const handleOtpChange = (e) => {
    // Only allow numbers and limit to 6 digits
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
    if (error) setError('');
  };

  const handleGoogleSignUp = () => {
    window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/google`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('Please enter a valid 10-digit phone number');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.register(formData);
      
      // Store user ID for OTP verification
      setUserId(response.data.userId);
      
      // Move to OTP step
      setStep(2);
    } catch (err) {
      console.error('Registration failed:', err);
      setError(
        err.response?.data?.message || 
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setResendLoading(true);
    setError('');

    try {
      await authAPI.resendOTP(userId);
      setError('OTP sent successfully. Please check your phone.');
    } catch (err) {
      console.error('Resend OTP failed:', err);
      setError(
        err.response?.data?.message || 
        'Failed to resend OTP. Please try again.'
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate OTP format
    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.verifyOTP(userId, otp);
      
      // Store token and user data
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      window.dispatchEvent(new Event('userUpdated'));
      
      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('OTP verification failed:', err);
      setError(
        err.response?.data?.message || 
        'Invalid OTP. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <Link to="/" className="back-link">← Back to Home</Link>
        
        <div className="auth-header">
          <h1>StockZen</h1>
          <h2>Create Account</h2>
          <p>Join thousands of successful traders</p>
        </div>

        {step === 1 ? (
          <div className="auth-form">
            <h3>Create Your Account</h3>
            <p>Enter your details to get started</p>

            <button 
              className="google-btn"
              onClick={handleGoogleSignUp}
              disabled={loading}
              type="button"
            >
              Continue with Google
            </button>

            <div className="divider">
              <span>OR</span>
            </div>

            <form onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

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
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  placeholder="Enter your 10-digit phone number"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  pattern="[0-9]{10}"
                  title="Please enter a 10-digit phone number"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Create a password (min. 6 characters)"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  minLength="6"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

              <button 
                type="submit" 
                className="submit-btn"
                disabled={loading}
              >
                {loading ? 'Registering...' : 'Continue'}
              </button>
            </form>

            <p className="auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </div>
        ) : (
          <div className="auth-form">
            <h3>Verify Your Phone</h3>
            <p>Enter the 6-digit OTP sent to {formData.phone}</p>

            <form onSubmit={handleOtpSubmit}>
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-group">
                <label htmlFor="otp">OTP Code</label>
                <input
                  type="text"
                  id="otp"
                  name="otp"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={handleOtpChange}
                  required
                  disabled={loading}
                  maxLength="6"
                  pattern="[0-9]{6}"
                  title="Please enter a 6-digit OTP"
                />
              </div>

              <button 
                type="submit" 
                className="submit-btn"
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify & Create Account'}
              </button>
            </form>

            <p className="resend-otp">
              Didn't receive the code? 
              <button 
                type="button" 
                onClick={handleResendOtp}
                disabled={resendLoading}
                className="resend-btn"
              >
                {resendLoading ? 'Sending...' : 'Resend OTP'}
              </button>
            </p>
          </div>
        )}

        <p className="auth-terms">
          By creating an account, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;