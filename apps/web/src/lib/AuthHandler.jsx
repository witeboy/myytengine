import React from 'react';
import { AuthView } from '@neondatabase/auth-ui';

const AUTH_VIEWS = new Set([
  'callback',
  'email-otp',
  'email-verification',
  'forgot-password',
  'magic-link',
  'recover-account',
  'reset-password',
  'sign-in',
  'sign-out',
  'sign-up',
  'two-factor',
  'accept-invitation',
]);

function safeReturnTo() {
  const requested = new URLSearchParams(window.location.search).get('returnTo');
  if (!requested) return '/';

  try {
    const url = new URL(requested, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export default function AuthHandler() {
  const requestedView = window.location.pathname.split('/').filter(Boolean).at(-1);
  const path = AUTH_VIEWS.has(requestedView) ? requestedView : 'sign-in';

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <AuthView path={path} redirectTo={safeReturnTo()} />
    </main>
  );
}

