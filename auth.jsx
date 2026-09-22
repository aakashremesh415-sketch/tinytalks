import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAuthToken, getStoredToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Only a genuine 401 (bad/expired/banned-account token) should actually
  // log someone out. Anything else — a 500 from a transient deploy-time
  // hiccup, a cold-start timeout, a network blip — doesn't tell us the
  // token is bad, so wiping it would force a real logout for no reason;
  // that used to happen on every page refresh that landed during/right
  // after a deployment, which is exactly when a transient failure is most
  // likely (serverless cold starts, brief DB connection churn). Retry a
  // couple of times with backoff first, and only give up (leaving the
  // stored token untouched) if every attempt fails with something other
  // than a 401.
  const refreshMe = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
        return;
      } catch (err) {
        if (err?.response?.status === 401) {
          setAuthToken(null);
          setUser(null);
          return;
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setAuthToken(token);
      refreshMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshMe]);

  const login = useCallback((token, userData) => {
    setAuthToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
