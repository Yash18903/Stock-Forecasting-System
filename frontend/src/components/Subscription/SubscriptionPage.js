import React, { useState } from 'react';
import './SubscriptionPage.css';

const SubscriptionPage = () => {
  const [selectedPlan, setSelectedPlan] = useState('monthly');

  const plans = [
    {
      id: 'weekly',
      name: 'Weekly Trial',
      price: 9,
      duration: '1 week',
      features: [
        'AI-powered predictions',
        'Real-time recommendations',
        'Basic charts & analysis',
        'Email support',
        'Up to 10 stock searches'
      ],
      popular: false
    },
    {
      id: 'monthly',
      name: 'Monthly Pro',
      price: 35,
      duration: '1 month',
      features: [
        'Everything in Weekly',
        'Advanced technical analysis',
        'Profit estimation calculator',
        'Priority support',
        'Unlimited stock searches',
        'News impact analysis'
      ],
      popular: true
    },
    {
      id: 'yearly',
      name: 'Yearly Premium',
      price: 399,
      duration: '1 year',
      features: [
        'Everything in Monthly Pro',
        'Custom watchlists',
        'Portfolio tracking',
        'Advanced alerts',
        'Dedicated account manager',
        'Early access to new features',
        'Mobile app access'
      ],
      popular: false
    }
  ];

  const handlePlanSelect = (planId) => {
    setSelectedPlan(planId);
  };

  const handleSubscribe = () => {
    // Redirect to payment page with selected plan
    window.location.href = `/payment?plan=${selectedPlan}`;
  };

  return (
    <div className="subscription-page">
      <div className="container">
        <h1>Choose Your Plan</h1>
        <p className="subtitle">Unlock the power of AI-driven stock predictions and take your trading to the next level</p>

        <div className="plans-container">
          {plans.map(plan => (
            <div 
              key={plan.id} 
              className={`plan-card ${plan.popular ? 'popular' : ''} ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => handlePlanSelect(plan.id)}
            >
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              <h3>{plan.name}</h3>
              <div className="price">₹{plan.price} <span>per {plan.duration}</span></div>
              <ul className="features">
                {plan.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
              <button 
                className={`select-btn ${selectedPlan === plan.id ? 'selected' : ''}`}
                onClick={() => handlePlanSelect(plan.id)}
              >
                {selectedPlan === plan.id ? 'Selected' : 'Choose Plan'}
              </button>
            </div>
          ))}
        </div>

        <div className="subscribe-btn-container">
          <button className="subscribe-btn" onClick={handleSubscribe}>
            Get Started
          </button>
        </div>

        <div className="faq-section">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-item">
            <h3>How accurate are the predictions?</h3>
            <p>Our AI model has an 85% accuracy rate based on historical data analysis and real-time market conditions.</p>
          </div>
          <div className="faq-item">
            <h3>Can I cancel my subscription anytime?</h3>
            <p>Yes, you can cancel your subscription at any time. You will continue to have access until the end of your billing period.</p>
          </div>
          <div className="faq-item">
            <h3>What payment methods do you accept?</h3>
            <p>We accept all major credit/debit cards, UPI payments, PhonePe, Google Pay, and bank transfers.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;