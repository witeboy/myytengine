// Sign-in page for the self-hosted session auth.
//
// Two ways in, matching the other rcinc.app apps: Google, and a one-time code
// emailed to the address. The code path is the way back in if Google is ever
// unavailable, so it is deliberately not hidden behind an "advanced" toggle.

import React, { useState } from 'react';
import { sendEmailCode, signInWithGoogle, verifyEmailCode } from '@/lib/auth-client';

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
  const isSignOut = window.location.pathname.endsWith('/sign-out');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('start'); // 'start' | 'code'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(window.location.search).get('error') || '',
  );

  const returnTo = safeReturnTo();

  React.useEffect(() => {
    if (isSignOut) {
      import('@/lib/auth-client').then(({ signOut }) =>
        signOut().finally(() => window.location.assign('/handler/sign-in')),
      );
    }
  }, [isSignOut]);

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sendEmailCode(email.trim());
      setStage('code');
    } catch (e) {
      setError(e.message || 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifyEmailCode(email.trim(), code.trim());
      window.location.assign(returnTo);
    } catch (e) {
      setError(e.message || 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (isSignOut) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-gray-500">Signing you out…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">to continue to MyYTEngine</p>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => signInWithGoogle(returnTo)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
          </svg>
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        {stage === 'start' ? (
          <form onSubmit={requestCode} className="space-y-3">
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-3">
            <p className="text-sm text-gray-600">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setStage('start'); setCode(''); setError(''); }}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-800"
            >
              Use a different address
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
