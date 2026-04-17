import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './components/HomePage/HomePage';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Dashboard from './components/Dashboard/Dashboard';
import CompanyPage from './components/CompanyPage/CompanyPage';
import SubscriptionPage from './components/Subscription/SubscriptionPage';
import PaymentPage from './components/Payment/PaymentPage';
import PredictionPage from './components/Prediction/PredictionPage';
import PaymentSuccess from './components/Payment/PaymentSuccess';
import Header from './components/Common/Header';
import Footer from './components/Common/Footer';
import AuthSuccess from './components/Auth/AuthSuccess';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user'));
  return user ? children : <Navigate to="/login" />;
};

// Subscription Required Route Component
// Checks auth first, then subscription — prevents unauthenticated users from
// landing on /subscription instead of /login.
const SubscriptionRequiredRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) return <Navigate to="/login" />;
  const hasSubscription = user.subscription && user.subscription.isActive;
  return hasSubscription ? children : <Navigate to="/subscription" />;
};

function App() {
  useEffect(() => {
    // Check if user is logged in on app load
    const userData = localStorage.getItem('user');
    if (userData) {
      // User data is available, but we don't need to set state for it
      // The ProtectedRoute components will handle authentication
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="App">
            <Header />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/auth-success" element={<AuthSuccess />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/company/:symbol"
                element={
                  <ProtectedRoute>
                    <CompanyPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/subscription"
                element={
                  <ProtectedRoute>
                    <SubscriptionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payment"
                element={
                  <ProtectedRoute>
                    <PaymentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payment-success"
                element={
                  <ProtectedRoute>
                    <PaymentSuccess />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/prediction/:symbol"
                element={
                  <SubscriptionRequiredRoute>
                    <PredictionPage />
                  </SubscriptionRequiredRoute>
                }
              />
            </Routes>
            <Footer />
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;