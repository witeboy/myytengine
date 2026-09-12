// AuthContext — self-hosted session auth, the same model jobmatch.ai, hihealth
// and snapsync use.
//
// The exported context shape is unchanged, so App.jsx and
// UserNotRegisteredError.jsx need no edits. There is no token to manage: the
// session is an httpOnly cookie, and `/api/auth/me` is the single source of
// truth for who is signed in.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setAuthActions, setUnauthorizedHandler } from '@/api/client';
import { getSession, signOut } from '@/lib/auth-client';

const AuthContext = createContext();

function buildLoginUrl(returnTo) {
  const loginUrl = new URL('/handler/sign-in', window.location.origin);
  loginUrl.searchParams.set('returnTo', returnTo || window.location.href);
  return loginUrl.toString();
}

export const AuthProvider = ({ children }) => {
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
      await signOut();

      if (shouldRedirect) {
        const returnTo = typeof shouldRedirect === 'string' ? shouldRedirect : window.location.href;
        navigateToLogin(returnTo);
      }
    },
    [navigateToLogin],
  );

  useEffect(() => {
    setAuthActions({ logout, redirectToLogin: navigateToLogin });
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    });
  }, [logout, navigateToLogin]);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await getSession();
      if (!currentUser) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        return;
      }
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
  }, []);

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
