// Ported from the original hosted callClaudeProxy function — HAND-WRITTEN.
//
// Two unrelated jobs behind one name, both preserved:
//   1. default        { system, prompt, max_tokens, model } -> { text }
//                     Called by src/lib/invokeLLM.js. Existed because the browser
//                     cannot reach api.anthropic.com directly (CORS).
//   2. proxyAsset     { action: 'proxyAsset', url } -> { success, data, content_type }
//                     A narrower twin of proxyFetchAsset with its own allowlist.
//
// The Anthropic call now goes through lib/ai.ts (AI Gateway + BYOK) rather than a raw
// fetch with an env-var key. The response shape is unchanged, so no caller moves.
//
// The original defaulted to model 'claude-sonnet-4-6' — preserved verbatim. Do not
// "update" it; invokeLLM in lib/ai.ts uses the same default for the same reason.

import { anthropic, anthropicText } from '../lib/ai';
import { HttpError, badRequest } from '../lib/http';
import { ownMediaHosts } from '../lib/storage';
import type { FnHandler } from '../types';

// Kept exactly as the original had it — a deliberately tighter list than
// proxyFetchAsset's, matched by substring against the hostname.
const ALLOWED_DOMAINS = [
  'file.aiquickdraw.com',
  'tempfile.aiquickdraw.com',
  'storage.googleapis.com',
  'r2.dev',
  'r2.cloudflarestorage.com',
  'cdn.aiquickdraw.com',
  'api.kie.ai',
  'ideogram.ai',
  'oaidalleapiprodscus.blob.core.windows.net',
  'replicate.delivery',
  'pbxt.replicate.delivery',
];

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    let s = '';
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    binary += s;
  }
  return btoa(binary);
}

const handler: FnHandler = async (body, ctx) => {
  // ── proxyAsset ──────────────────────────────────────────────────────────────
  if (body?.action === 'proxyAsset') {
    const { url } = body;
    if (!url || !String(url).startsWith('http')) {
      return { success: false, error: 'Invalid URL' };
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return { success: false, error: 'Malformed URL' };
    }
    // Plus our own storage host (R2 custom domain / Bunny CDN) — see lib/storage.ts.
    if (![...ALLOWED_DOMAINS, ...ownMediaHosts(ctx.env)].some((d) => hostname.includes(d))) {
      throw new HttpError(403, 'Domain not in allowlist: ' + hostname);
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new HttpError(502, 'Upstream returned ' + response.status);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      success: true,
      data: toBase64(bytes),
      content_type: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  // ── Claude passthrough ──────────────────────────────────────────────────────
  const { system, prompt, max_tokens = 2000, model = 'claude-sonnet-4-6' } = body || {};
  if (!prompt) throw badRequest('prompt is required');

  const payload: Record<string, unknown> = {
    model,
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) payload.system = system;

  const text = anthropicText(await anthropic(ctx, payload));
  if (!text) throw new HttpError(500, 'No text content in Claude response');

  return { text };
};

export default handler;
