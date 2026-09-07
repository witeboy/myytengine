// AuthContext — Neon Auth (Stack Auth) replacing Base44 auth.
//
// The exported context shape is UNCHANGED from the Base44 version, so App.jsx and
// UserNotRegisteredError.jsx need no edits:
//   { user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings,
//     authError, appPublicSettings, logout, navigateToLogin, checkAppState }
//
// `isLoadingPublicSettings` and `appPublicSettings` were Base44-specific (the
// /api/apps/public probe). They are kept as inert values rather than removed —
// deleting them would mean touching App.jsx, which the migration forbids.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useStackApp, useUser } from '@stackframe/react';
import { setAuthActions, setTokenProvider, setUnauthorizedHandler } from '@/api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const stackApp = useStackApp();
  const stackUser = useUser();          // null = signed out, undefined = still resolving

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const navigateToLogin = useCallback(
    (returnTo) => {
      stackApp.redirectToSignIn({ returnTo: returnTo || window.location.href });
    },
    [stackApp],
  );

  const logout = useCallback(
    async (shouldRedirect = true) => {
      setUser(null);
      setIsAuthenticated(false);
      await stackUser?.signOut();
      if (shouldRedirect) navigateToLogin();
    },
    [stackUser, navigateToLogin],
  );

  // Give the API client a way to fetch a fresh token and to react to a 401.
  useEffect(() => {
    setTokenProvider(async () => {
      if (!stackUser) return null;
      const { accessToken } = await stackUser.getAuthJson();
      return accessToken || null;
    });
    setAuthActions({ logout, redirectToLogin: navigateToLogin });
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    });
  }, [stackUser, logout, navigateToLogin]);

  const checkAppState = useCallback(async () => {
    if (stackUser === undefined) return;             // still resolving
    if (stackUser === null) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
      return;
    }

    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      // Round-trips the token through the Worker so the session is proven end to end,
      // exactly as base44.auth.me() used to.
      const { api } = await import('@/api/client');
      const me = await api.auth.me();
      setUser(me);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthError(
        err?.status === 401 || err?.status === 403
          ? { type: 'auth_required', message: 'Authentication required' }
          : { type: 'unknown', message: err?.message || 'Failed to load app' },
      );
    } finally {
      setIsLoadingAuth(false);
    }
  }, [stackUser]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Base44 leftovers kept so App.jsx is untouched.
        isLoadingPublicSettings: false,
        appPublicSettings: null,
        authError,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
