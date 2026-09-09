import { createAuthClient } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const configuredAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;

if (!configuredAuthUrl) {
  throw new Error('VITE_NEON_AUTH_URL is required');
}

const authUrl = new URL(configuredAuthUrl, window.location.origin).toString().replace(/\/$/, '');

// Production uses the SPA's same-origin /api/auth relay. Keeping credentials
// explicit also preserves local development against the proxied auth service.
export const authClient = createAuthClient(authUrl, {
  adapter: BetterAuthReactAdapter({
    fetchOptions: { credentials: 'include' },
  }),
});
