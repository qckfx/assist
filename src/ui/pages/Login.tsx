/**
 * Login page component
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterval } from '../hooks/useInterval';

// Auth API endpoints
const API_ENDPOINTS = {
  LOGIN: '/api/auth/login',
  STATUS: '/api/auth/status',
};

// Authentication response from the API
interface AuthResponse {
  verificationUri: string;
  verification_uri_complete: string;
  userCode: string;
  expiresIn: number;
  interval: number;
  deviceCode: string;
}

// Authentication status response
interface StatusResponse {
  authenticated: boolean;
  authRequired: boolean;
}

/**
 * Login page component
 */
export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.STATUS);
        const data = await response.json() as StatusResponse;
        
        if (!data.authRequired) {
          // Auth not required, redirect to main app
          navigate('/');
          return;
        }
        
        if (data.authenticated) {
          // Already authenticated, redirect to main app
          navigate('/');
        }
      } catch (err) {
        setError('Failed to check authentication status');
        console.error('Auth status check error:', err);
      }
    };
    
    checkAuthStatus();
  }, [navigate]);

  // Start the authentication flow
  const startAuth = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Authentication failed (${response.status})`);
      }
      
      const data = await response.json();
      
      // If auth is not required, redirect to main app
      if (data.authRequired === false) {
        navigate('/');
        return;
      }
      
      // Proceed with auth flow if it's a device code response
      if (data.deviceCode) {
        setAuthInfo(data as AuthResponse);
        setPolling(true);
      } else {
        throw new Error('Invalid authentication response');
      }
    } catch (err) {
      setError(`Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Auth error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for authentication status
  useInterval(
    async () => {
      if (!polling || !authInfo?.deviceCode) return;
      
      try {
        // Include device code as query parameter for middleware to use
        const response = await fetch(`${API_ENDPOINTS.STATUS}?device_code=${authInfo.deviceCode}`);
        const data = await response.json() as StatusResponse;
        
        if (data.authenticated) {
          // Authentication successful, redirect to main app
          setPolling(false);
          navigate('/');
        }
      } catch (err) {
        console.error('Auth status check error:', err);
        // Don't stop polling on error, just continue
      }
    },
    polling ? (authInfo?.interval || 5) * 1000 : null
  );

  // Component rendering based on state
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Sign in to qckfx</h1>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {!authInfo ? (
          // Initial state - show login button
          <button 
            onClick={startAuth} 
            disabled={isLoading}
            className="login-button"
          >
            {isLoading ? 'Please wait...' : 'Sign in with Q-Auth'}
          </button>
        ) : (
          // Authentication in progress - show instructions
          <div className="auth-in-progress">
            <p>Please visit the following URL to authenticate:</p>
            
            <div className="verification-link">
              <a 
                href={authInfo.verification_uri_complete} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                {authInfo.verificationUri}
              </a>
            </div>
            
            <div className="user-code">
              <p>Or enter this code:</p>
              <div className="code-display">
                {authInfo.userCode}
              </div>
            </div>
            
            <div className="auth-status">
              <div className="spinner"></div>
              <p>Waiting for authentication...</p>
              <p className="expires-in">
                Expires in {Math.floor(authInfo.expiresIn / 60)} minutes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;