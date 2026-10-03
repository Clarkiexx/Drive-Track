import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setAuthToken, registerUnauthorizedHandler } from '../api/client';

const TOKEN_KEY = 'drivetrack_driver_token';
const DRIVER_KEY = 'drivetrack_driver_info';
const MUST_CHANGE_KEY = 'drivetrack_driver_must_change';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [driver, setDriver] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true while we check for a saved session

  // On app start, check if a token was already saved from a previous session.
  // The driver profile is restored too, so Profile screens don't render
  // blank after a restart (previously only the token was persisted).
  useEffect(() => {
    (async () => {
      const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (savedToken) {
        setToken(savedToken);
        setAuthToken(savedToken);
        try {
          const savedDriver = await SecureStore.getItemAsync(DRIVER_KEY);
          if (savedDriver) setDriver(JSON.parse(savedDriver));
        } catch {
          // Corrupt profile cache — token still works; profile refetches on use.
        }
        // Restore the forced-change flag too — otherwise a restart would
        // silently bypass ChangePasswordScreen (server still enforces it).
        try {
          const savedMustChange = await SecureStore.getItemAsync(MUST_CHANGE_KEY);
          setMustChangePassword(savedMustChange === '1');
        } catch {
          // Flag unreadable — server remains the authority and will 403.
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function signIn({ token: newToken, driver: driverInfo, mustChangePassword: mustChange }) {
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    if (driverInfo) {
      await SecureStore.setItemAsync(DRIVER_KEY, JSON.stringify(driverInfo));
    }
    await SecureStore.setItemAsync(MUST_CHANGE_KEY, mustChange ? '1' : '0');
    setAuthToken(newToken);
    setToken(newToken);
    setDriver(driverInfo);
    setMustChangePassword(mustChange);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(DRIVER_KEY);
    await SecureStore.deleteItemAsync(MUST_CHANGE_KEY);
    setAuthToken(null);
    setToken(null);
    setDriver(null);
    setMustChangePassword(false);
  }

  function clearMustChangePassword() {
    setMustChangePassword(false);
  }

  // Whenever any API call comes back 401, sign out automatically instead
  // of leaving the app stuck showing a logged-in screen with a dead token.
  useEffect(() => {
    registerUnauthorizedHandler(signOut);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, driver, mustChangePassword, isLoading, signIn, signOut, clearMustChangePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
