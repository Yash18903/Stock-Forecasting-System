import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, amount, endDate, transactionId } = location.state || {};

  const handleTryPremium = () => {
    // Redirect to a popular stock's prediction page, or to the dashboard
    // You can change 'AAPL' to any default stock symbol you prefer
    navigate('/prediction/AAPL');
  };

  return (
    <div className="payment-success">
      <div className="container">
        <div className="success-card">
          <div className="success-icon">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="#4CAF50" />
              <path d="M30,50 L45,65 L70,35" fill="none" stroke="white" strokeWidth="5" />
            </svg>
          </div>
          <h1>Payment Successful!</h1>
          <p>Thank you for your purchase. Your subscription is now active.</p>
          
          {plan && (
            <div className="payment-details">
              <h2>Order Details</h2>
              <div className="detail-row">
                <span>Plan:</span>
                <span>{plan}</span>
              </div>
              <div className="detail-row">
                <span>Amount Paid:</span>
                <span>₹{amount}</span>
              </div>
              <div className="detail-row">
                <span>Valid Until:</span>
                <span>{new Date(endDate).toLocaleDateString()}</span>
              </div>
              {transactionId && (
                <div className="detail-row">
                  <span>Transaction ID:</span>
                  <span>{transactionId}</span>
                </div>
              )}
            </div>
          )}
          
          <div className="action-buttons">
            <Link to="/dashboard" className="btn-primary">
              Go to Dashboard
            </Link>
            <button onClick={handleTryPremium} className="btn-secondary">
              Try Premium Features
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;