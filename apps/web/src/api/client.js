// API client — the SPA's only backend client, talking to the Cloudflare Worker.
//
// It deliberately mirrors the original hosted SDK's surface exactly:
//     api.entities.Projects.filter({ id })   -> Row[]        (array, not { data })
//     api.functions.invoke(name, payload)    -> { data }
//     api.auth.me() / logout() / redirectToLogin()
//     api.integrations.Core.InvokeLLM / UploadFile / GenerateImage
//
// Because the shape matches, call sites import it as `{ api as base44 }` and NOT ONE
// of the ~250 existing usage lines changes.
//
// There is exactly one path per function now; no retry or path-shape fallback.

import { ENTITY_NAMES } from './entities';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

if (!API_BASE && import.meta.env.DEV) {
  console.warn('[api] VITE_API_BASE is not set — requests will hit the current origin.');
}

// ── auth token plumbing ───────────────────────────────────────────────────────
// AuthContext calls setTokenProvider() once so this module never imports the auth
// SDK directly (keeps the client testable and swappable).

let tokenProvider = async () => null;
export const setTokenProvider = (fn) => {
  tokenProvider = fn;
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

// ── errors ────────────────────────────────────────────────────────────────────
// Existing code reads `err?.response?.status || err?.status`, so we populate both.

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.response = { status, data: body };
  }
}

async function request(path, { method = 'POST', body, isForm = false, timeoutMs = 300_000 } = {}) {
  const token = await tokenProvider();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      // The session is an httpOnly cookie. With API_BASE empty these calls are
      // same-origin through the Vercel rewrite, so the cookie travels with them.
      credentials: 'include',
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new ApiError(504, `Request timed out: ${path}`);
    throw new ApiError(0, `Network error calling ${path}: ${e.message}`);
  }
  clearTimeout(timer);

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    const message =
      (parsed && typeof parsed === 'object' && parsed.error) ||
      (typeof parsed === 'string' ? parsed.slice(0, 300) : '') ||
      res.statusText ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed;
}

// ── entities ──────────────────────────────────────────────────────────────────
// Signatures observed in the repo and reproduced exactly:
//   .filter({ project_id }, 'scene_number', PAGE, offset)
//   .filter({ status: 'active' }, '-created_date')
//   .list('-created_date', 500)   .list()

function makeEntity(name) {
  const call = async (op, payload) => {
    const res = await request(`/api/db/${name}/${op}`, { body: payload });
    return res?.data;
  };
  return {
    filter: (where = {}, sort, limit, offset) => call('filter', { where, sort, limit, offset }),
    list: (sort, limit, offset) => call('list', { sort, limit, offset }),
    get: (id) => call('get', { id }),
    create: (values) => call('create', { values }),
    bulkCreate: (values) => call('bulkCreate', { values }),
    update: (id, values) => call('update', { id, values }),
    delete: (id) => call('delete', { id }),
  };
}

const entities = {};
for (const name of ENTITY_NAMES) entities[name] = makeEntity(name);

// ── functions ─────────────────────────────────────────────────────────────────

const functions = {
  /** Returns the same `{ data }` envelope the original SDK returned. */
  invoke: (name, payload = {}, opts = {}) =>
    request(`/api/fn/${String(name)}`, { body: payload, timeoutMs: opts.timeoutMs }),
};

// ── auth ──────────────────────────────────────────────────────────────────────

let logoutImpl = async () => {};
let loginImpl = () => {};
export const setAuthActions = ({ logout, redirectToLogin }) => {
  if (logout) logoutImpl = logout;
  if (redirectToLogin) loginImpl = redirectToLogin;
};

const auth = {
  me: async () => {
    const res = await request('/api/auth/me', { method: 'GET' });
    return res?.data;
  },
  logout: (returnTo) => logoutImpl(returnTo),
  redirectToLogin: (returnTo) => loginImpl(returnTo),
};

// ── integrations (Core.*) ─────────────────────────────────────────────────────

const integrations = {
  Core: {
    /** Same contract as before: schema present -> object, absent -> string. */
    InvokeLLM: async ({ prompt, system, response_json_schema, max_tokens, model } = {}) => {
      const res = await request('/api/fn/invokeLLM', {
        body: { prompt, system, response_json_schema, max_tokens, model },
      });
      return res?.data;
    },

    /** Returns `{ file_url }`, which is what directApi.js already reads. */
    UploadFile: async ({ file }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await request('/api/upload', { body: form, isForm: true });
      return res?.data;
    },

    GenerateImage: async (args) => {
      const res = await request('/api/fn/generateImage', { body: args });
      return res?.data;
    },
  },
};

// ── BYOK settings (used by the Settings page) ─────────────────────────────────

const keys = {
  list: async () => (await request('/api/keys', { method: 'GET' }))?.data,
  set: async (provider, value) => (await request('/api/keys/set', { body: { provider, value } }))?.data,
  test: async (provider, value) => (await request('/api/keys/test', { body: { provider, value } }))?.data,
  testAll: async () => (await request('/api/keys/testAll', { body: {} }))?.data,
  remove: async (provider) => (await request('/api/keys/delete', { body: { provider } }))?.data,
  saveSettings: async (patch) => (await request('/api/keys/settings', { body: { patch } }))?.data,
};

export const api = { entities, functions, auth, integrations, keys };

/** Alias kept so existing imports (`import { api as base44 } from '@/api/client'`) work. */
export const base44 = api;

export default api;
