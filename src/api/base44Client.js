import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Patch functions.invoke to be path-agnostic.
// Functions in this app are deployed either flat ("name") or nested ("name/entry").
// We try the most likely path first, and on a 404 automatically fall back to the
// other form — so a function never 404s just because of the path shape.
const _originalInvoke = base44.functions.invoke.bind(base44.functions);
const is404 = (err) => (err?.response?.status || err?.status) === 404;

base44.functions.invoke = async (name, ...args) => {
  // If caller already specified a path shape, honor it (no fallback needed).
  if (name.endsWith('/entry')) {
    return _originalInvoke(name, ...args);
  }
  // Try nested form first (most functions are deployed as name/entry).
  try {
    return await _originalInvoke(`${name}/entry`, ...args);
  } catch (err) {
    if (is404(err)) {
      // Nested path missing — function is deployed flat. Retry at root path.
      return await _originalInvoke(name, ...args);
    }
    throw err;
  }
};