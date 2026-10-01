import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setAuthToken, registerUnauthorizedHandler } from '../api/client';

const TOKEN_KEY = 'drivetrack_enforcer_token';
const ENFORCER_KEY = 'drivetrack_enforcer_info';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [enforcer, setEnforcer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // The enforcer profile is restored alongside the token so Home/Profile
  // screens don't render blank after a restart.
  useEffect(() => {
    (async () => {
      const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (savedToken) {
        setToken(savedToken);
        setAuthToken(savedToken);
        try {
          const savedEnforcer = await SecureStore.getItemAsync(ENFORCER_KEY);
          if (savedEnforcer) setEnforcer(JSON.parse(savedEnforcer));
        } catch {
          // Corrupt profile cache — token still works.
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function signIn({ token: newToken, enforcer: enforcerInfo }) {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    if (enforcerInfo) {
      await SecureStore.setItemAsync(ENFORCER_KEY, JSON.stringify(enforcerInfo));
    }
    setAuthToken(newToken);
    setToken(newToken);
    setEnforcer(enforcerInfo);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ENFORCER_KEY);
    setAuthToken(null);
    setToken(null);
    setEnforcer(null);
  }

  // Whenever any API call comes back 401, sign out automatically instead
  // of leaving the app stuck showing a logged-in screen with a dead token.
  useEffect(() => {
    registerUnauthorizedHandler(signOut);
  }, []);

  return (
    <AuthContext.Provider value={{ token, enforcer, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
