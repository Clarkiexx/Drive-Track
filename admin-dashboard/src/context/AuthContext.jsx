import React, { createContext, useContext, useEffect, useState } from 'react';
import { setAuthToken } from '../api/client';

const TOKEN_KEY = 'drivetrack_admin_token';
const ADMIN_KEY = 'drivetrack_admin_info';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedAdmin = localStorage.getItem(ADMIN_KEY);
    if (savedToken) {
      setToken(savedToken);
      setAuthToken(savedToken);
      setAdmin(savedAdmin ? JSON.parse(savedAdmin) : null);
    }
    setIsLoading(false);
  }, []);

  function signIn({ token: newToken, admin: adminInfo }) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(adminInfo));
    setAuthToken(newToken);
    setToken(newToken);
    setAdmin(adminInfo);
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
    setAuthToken(null);
    setToken(null);
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ token, admin, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
