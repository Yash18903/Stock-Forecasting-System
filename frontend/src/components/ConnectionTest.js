import React, { useState, useEffect } from 'react';
import { testConnection } from '../services/api';
import { testBackendConnection } from '../services/auth';

const ConnectionTest = () => {
  const [apiStatus, setApiStatus] = useState('Testing...');
  const [backendStatus, setBackendStatus] = useState('Testing...');

  useEffect(() => {
    // Test API connection
    testConnection()
      .then(data => setApiStatus(`Connected: ${data.message}`))
      .catch(err => setApiStatus(`Error: ${err.message}`));

    // Test backend connection
    testBackendConnection()
      .then(data => setBackendStatus(`Connected: ${data.message}`))
      .catch(err => setBackendStatus(`Error: ${err.message}`));
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Connection Status</h2>
      <div>
        <strong>Frontend to Backend API:</strong> {apiStatus}
      </div>
      <div>
        <strong>Backend Health:</strong> {backendStatus}
      </div>
      <div>
        <strong>API URL:</strong> {process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}
      </div>
    </div>
  );
};

export default ConnectionTest;