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

// Patch functions.invoke to auto-append /entry/entry for nested functions
// The youtubeAuth function is flat (no entry/entry), all others use nested paths
const FLAT_FUNCTIONS = new Set(['youtubeAuth']);
const _originalInvoke = base44.functions.invoke.bind(base44.functions);
base44.functions.invoke = (name, ...args) => {
  const resolvedName = FLAT_FUNCTIONS.has(name) ? name : `${name}/entry/entry`;
  return _originalInvoke(resolvedName, ...args);
};