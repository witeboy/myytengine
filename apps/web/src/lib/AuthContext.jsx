// AuthContext — Managed Better Auth replacing Base44 auth.
//
// The exported context shape is unchanged. Base44's public-settings values remain
// inert so App.jsx and UserNotRegisteredError.jsx do not need behavior changes.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setAuthActions, setTokenProvider, setUnauthorizedHandler } from '@/api/client';
import { authClient } from '@/lib/neon-auth';

const AuthContext = createContext();

function buildLoginUrl(returnTo) {
  const loginUrl = new URL('/handler/sign-in', window.location.origin);
  loginUrl.searchParams.set('returnTo', returnTo || window.location.href);
  return loginUrl.toString();
}

export const AuthProvider = ({ children }) => {
  const session = authClient.useSession();
  const sessionUserId = session.data?.user?.id || null;

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const navigateToLogin = useCallback((returnTo) => {
    window.location.assign(buildLoginUrl(returnTo));
  }, []);

  const logout = useCallback(
    async (shouldRedirect = true) => {
      setUser(null);
      setIsAuthenticated(false);
      await authClient.signOut();

      if (shouldRedirect) {
        const returnTo = typeof shouldRedirect === 'string' ? shouldRedirect : window.location.href;
        navigateToLogin(returnTo);
      }
    },
    [navigateToLogin],
  );

  // The Worker is on a separate origin, so it receives a short-lived JWT instead
  // of Better Auth's HTTP-only browser session cookie. Resolve the token from the
  // live session at request time; tying this provider to React's session render
  // can leave the first authenticated request using the previous null session.
  useEffect(() => {
    setTokenProvider(async () => {
      try {
        // Neon's Better Auth adapter replaces session.token with the short-lived
        // JWT supplied in the get-session response's set-auth-jwt header.
        const result = await authClient.getSession();
        return result?.data?.session?.token || null;
      } catch {
        return null;
      }
    });
    setAuthActions({ logout, redirectToLogin: navigateToLogin });
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    });
  }, [logout, navigateToLogin]);

  const checkAppState = useCallback(async () => {
    if (session.isPending) return;

    if (!sessionUserId) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
      return;
    }

    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      // Prove the browser session, JWT, and Worker verifier as one end-to-end chain.
      const { api } = await import('@/api/client');
      const currentUser = await api.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(
        error?.status === 401 || error?.status === 403
          ? { type: 'auth_required', message: 'Authentication required' }
          : { type: 'unknown', message: error?.message || 'Failed to load app' },
      );
    } finally {
      setIsLoadingAuth(false);
    }
  }, [session.isPending, sessionUserId]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: null,
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
