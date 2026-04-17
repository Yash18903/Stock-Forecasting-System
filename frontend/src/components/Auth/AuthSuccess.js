import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';
import './AuthSuccess.css';

const AuthSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  useEffect(() => {
    const handleAuthSuccess = async () => {
      if (token) {
        try {
          // Store the token
          localStorage.setItem('authToken', token);
          
          // Fetch user data
          const response = await authAPI.getCurrentUser();
          const userData = response.data;
          
          // Store user data
          localStorage.setItem('user', JSON.stringify(userData));
          
          // Redirect to dashboard
          navigate('/dashboard');
        } catch (error) {
          console.error('Error fetching user data:', error);
          navigate('/login', { state: { error: 'Failed to complete authentication' } });
        }
      } else {
        navigate('/login', { state: { error: 'Authentication failed' } });
      }
    };

    handleAuthSuccess();
  }, [token, navigate]);

  return (
    <div className="auth-success-container">
      <div className="auth-success-card">
        <h2>Completing Authentication</h2>
        <p>Please wait while we complete your authentication...</p>
        <div className="loading-spinner"></div>
      </div>
    </div>
  );
};

export default AuthSuccess;