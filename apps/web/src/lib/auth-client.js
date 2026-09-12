// Auth client for the self-hosted session endpoints in the Worker.
//
// Replaces the Neon Managed Better Auth SDK. There is no token to hold: the
// session lives in an httpOnly cookie the browser sends on its own, which is
// why every call here passes `credentials: 'include'` and nothing is cached in
// JavaScript. Same model as the other rcinc.app apps.

const AUTH_BASE = '/api/auth';

async function call(path, options = {}) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload?.data ?? null;
}

/** The signed-in user, or null. Never throws for anonymous callers. */
export async function getSession() {
  try {
    return await call('/me');
  } catch {
    return null;
  }
}

export async function signOut() {
  try {
    await call('/logout', { method: 'POST' });
  } catch {
    // A failed revoke must not trap someone on a page they cannot leave.
  }
}

/** Full-page redirect: OAuth cannot run inside fetch. */
export function signInWithGoogle(returnTo) {
  const url = new URL(`${AUTH_BASE}/login`, window.location.origin);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect', returnTo || '/');
  window.location.assign(url.toString());
}

/** Sends a one-time sign-in code. Answers the same whether or not the address
 *  has an account, so this cannot be used to enumerate users. */
export const sendEmailCode = (email) =>
  call('/otp', { method: 'POST', body: JSON.stringify({ email }) });

export const verifyEmailCode = (email, code) =>
  call('/otp', { method: 'POST', body: JSON.stringify({ email, code }) });
