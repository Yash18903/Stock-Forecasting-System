import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './PaymentPage.css';
import myImage from "../../assets/QR.jpg"; 


const PaymentPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateSubscription } = useAuth();
  const plan = searchParams.get('plan') || 'monthly';
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    upiId: ''
  });

  const plans = {
    weekly: { name: 'Weekly Trial', price: 9, days: 7 },
    monthly: { name: 'Monthly Pro', price: 35, days: 30 },
    yearly: { name: 'Yearly Premium', price: 399, days: 365 }
  };

  const selectedPlan = plans[plan] || plans.monthly;

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    setError('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (paymentMethod === 'card') {
      if (!formData.cardNumber || !formData.expiryDate || !formData.cvv || !formData.cardholderName) {
        setError('Please fill all card details');
        return false;
      }
      if (formData.cardNumber.replace(/\s/g, '').length !== 16) {
        setError('Please enter a valid 16-digit card number');
        return false;
      }
      if (formData.cvv.length !== 3) {
        setError('Please enter a valid 3-digit CVV');
        return false;
      }
    } else if (paymentMethod === 'upi') {
      if (!formData.upiId || !formData.upiId.includes('@')) {
        setError('Please enter a valid UPI ID');
        return false;
      }
    }
    return true;
  };

  const handlePayment = async () => {
    if (!validateForm()) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      const token = localStorage.getItem('authToken');
      
      // FIXED: Correct API URL construction
      const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const apiUrl = `${baseUrl}/payments/process`;
      
      console.log('Making payment request to:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: plan,
          paymentMethod: paymentMethod,
          amount: selectedPlan.price,
          paymentDetails: formData
        })
      });

      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Payment failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Update user subscription in context
      if (updateSubscription) {
        updateSubscription(data.subscription);
      }
      
      // Redirect to success page
      navigate('/payment-success', { 
        state: { 
          plan: selectedPlan.name, 
          amount: selectedPlan.price,
          endDate: data.subscription.endDate,
          transactionId: data.transactionId
        } 
      });
    } catch (error) {
      setError(error.message || 'An error occurred during payment processing. Please try again.');
      console.error('Payment error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="payment-page">
      <div className="container">
        <h1>Complete Your Purchase</h1>
        
        {error && <div className="error-message">{error}</div>}

        <div className="payment-content">
          <div className="order-summary">
            <h2>Order Summary</h2>
            <div className="plan-details">
              <h3>{selectedPlan.name}</h3>
              <p>StockZen Premium Access</p>
              <ul>
                <li>AI-powered predictions</li>
                <li>Real-time recommendations</li>
                <li>Advanced charts & analysis</li>
                <li>Priority support</li>
              </ul>
            </div>
            <div className="total">
              <span>Total</span>
              <span>₹{selectedPlan.price}</span>
            </div>
          </div>

          <div className="payment-methods">
            <h2>Payment Method</h2>
            <p>Choose your preferred payment option</p>

            <div className="method-options">
              <div 
                className={`method-option ${paymentMethod === 'card' ? 'selected' : ''}`}
                onClick={() => handlePaymentMethodChange('card')}
              >
                <div className="method-header">
                  <input 
                    type="radio" 
                    checked={paymentMethod === 'card'} 
                    onChange={() => handlePaymentMethodChange('card')}
                  />
                  <span>Credit/Debit Card</span>
                </div>
                <p>Visa, Mastercard, RuPay</p>
              </div>

              <div 
                className={`method-option ${paymentMethod === 'upi' ? 'selected' : ''}`}
                onClick={() => handlePaymentMethodChange('upi')}
              >
                <div className="method-header">
                  <input 
                    type="radio" 
                    checked={paymentMethod === 'upi'} 
                    onChange={() => handlePaymentMethodChange('upi')}
                  />
                  <span>UPI</span>
                </div>
                <p>PhonePe, Google Pay, Paytm</p>
              </div>

              <div 
                className={`method-option ${paymentMethod === 'qr' ? 'selected' : ''}`}
                onClick={() => handlePaymentMethodChange('qr')}
              >
                <div className="method-header">
                  <input 
                    type="radio" 
                    checked={paymentMethod === 'qr'} 
                    onChange={() => handlePaymentMethodChange('qr')}
                  />
                  <span>QR Code</span>
                </div>
                <p>Scan to pay with any UPI app</p>
              </div>
            </div>

            {paymentMethod === 'card' && (
              <div className="card-form">
                <div className="form-group">
                  <label>Card Number</label>
                  <input 
                    type="text" 
                    name="cardNumber"
                    placeholder="1234 5678 9012 3456" 
                    value={formData.cardNumber}
                    onChange={handleInputChange}
                    maxLength="19"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Expiry Date</label>
                    <input 
                      type="text" 
                      name="expiryDate"
                      placeholder="MM/YY" 
                      value={formData.expiryDate}
                      onChange={handleInputChange}
                      maxLength="5"
                    />
                  </div>
                  <div className="form-group">
                    <label>CVV</label>
                    <input 
                      type="text" 
                      name="cvv"
                      placeholder="123" 
                      value={formData.cvv}
                      onChange={handleInputChange}
                      maxLength="3"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Cardholder Name</label>
                  <input 
                    type="text" 
                    name="cardholderName"
                    placeholder="John Doe" 
                    value={formData.cardholderName}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'upi' && (
              <div className="upi-form">
                <div className="form-group">
                  <label>UPI ID</label>
                  <input 
                    type="text" 
                    name="upiId"
                    placeholder="yourname@upi" 
                    value={formData.upiId}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="upi-apps">
                  <p>Pay using your preferred UPI app</p>
                  <div className="apps-list">
                    <div className="app-icon">PhonePe</div>
                    <div className="app-icon">Google Pay</div>
                    <div className="app-icon">Paytm</div>
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'qr' && (
              <div className="qr-section">
                <div className="qr-code">
                  <div className="qr-placeholder">
                    <span>QR Code</span>
                     <img src={myImage} alt="My Local" />
                    <p>Scan with any UPI app</p>
                  </div>
                </div>
                <div className="amount-display">
                  <span>Amount: ₹{selectedPlan.price}</span>
                </div>
              </div>
            )}

            <div className="secure-payment">
              <p>Secure Payment</p>
              <span>Your payment information is encrypted and secure</span>
            </div>

            <button 
              className={`pay-btn ${isProcessing ? 'processing' : ''}`} 
              onClick={handlePayment}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : `Pay ₹${selectedPlan.price}`}
            </button>

            <div className="encryption-notice">
              <p>Protected by 256-bit SSL encryption</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;