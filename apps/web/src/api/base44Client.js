// Compatibility shim.
//
// The entire app imports `{ base44 } from '@/api/base44Client'`. Keeping this file
// as a re-export means the Base44 -> Cloudflare swap touches ZERO call sites.
//
// Once everything is green, an optional codemod can rewrite the imports to
// `{ api } from '@/api/client'` and delete this file. Nothing depends on doing so.

export { base44, api, ApiError, setTokenProvider, setUnauthorizedHandler, setAuthActions } from './client';
export { base44 as default } from './client';
