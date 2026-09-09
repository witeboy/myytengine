// LLM routing. One file decides where every text and vision call goes.
//
// TWO MODES, set by AI_PROVIDER_MODE in wrangler.toml:
//
//   'aggregator'  (default) — everything through CheaperInference.
//        Claude  -> its Anthropic-compatible surface   (base-URL swap, no translation)
//        GPT     -> its OpenAI-compatible surface      (base-URL swap, no translation)
//        Gemini  -> its OpenAI-compatible surface, with native<->OpenAI translation in
//                   lib/gemini-compat.ts so callers still see Gemini-shaped JSON
//        One key: CHEAPER_INFERENCE_API_KEY.
//
//   'gateway' — Cloudflare AI Gateway, per-provider passthrough, per-provider BYOK keys
//        (GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY). Nothing is translated.
//        Keep this as the escape hatch: it is the only mode that supports Gemini video
//        understanding and Gemini-only parameters such as safetySettings and topK.
//
// THE POINT: none of the ~60 ported functions know which mode is active. They call
// geminiFetch/anthropicFetch/openaiFetch, then read `res.ok`, `await res.json()` and
// `data.candidates[0].content.parts[0].text` exactly as they always did.
//
// CODEX: do NOT change prompts, model ids, temperature, response schemas or retry logic
// while porting. Change the call, never the content.

import { HttpError, fetchJson } from './http';
import { geminiShapedResponse, modelFromPath, toOpenAIRequest } from './gemini-compat';
import { mapModel, remapBodyModel, remapSerializedModel } from './models';
import type { Ctx, Env } from '../types';

export type GwProvider = 'google-ai-studio' | 'anthropic' | 'openai' | 'workers-ai';

const mode = (env: Env) => (env.AI_PROVIDER_MODE || 'aggregator') as 'aggregator' | 'gateway';

// ── Cloudflare AI Gateway (mode: 'gateway') ───────────────────────────────────

export const gatewayBase = (env: Env) =>
  `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}`;

/** `path` is the provider path exactly as it appeared in the original code. */
export const gwUrl = (env: Env, provider: GwProvider, path: string) =>
  `${gatewayBase(env)}/${provider}${path.startsWith('/') ? path : `/${path}`}`;

// ── CheaperInference (mode: 'aggregator') ─────────────────────────────────────

const aggBase = (env: Env) =>
  (env.AI_AGGREGATOR_BASE_URL || 'https://api.cheaperinference.com').replace(/\/$/, '');

const aggKey = (ctx: Ctx) => ctx.keys.require('CHEAPER_INFERENCE_API_KEY');

// ── Raw-Response passthroughs (what the codemod targets) ──────────────────────
//
// Ported code is full of hand-written `fetch(...)` blocks that then do `if (!res.ok)`,
// `await res.json()`, custom retry and custom error parsing. These return the RAW
// Response so all of that survives the port untouched.

export async function geminiFetch(ctx: Ctx, path: string, init: RequestInit = {}) {
  if (mode(ctx.env) === 'gateway') {
    const key = await ctx.keys.require('GEMINI_API_KEY');
    const headers = new Headers(init.headers as HeadersInit);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    headers.set('x-goog-api-key', key);
    return fetch(gwUrl(ctx.env, 'google-ai-studio', path), { ...init, headers });
  }

  // Aggregator: translate native Gemini -> OpenAI chat, then translate the reply back.
  const model = modelFromPath(path);
  let nativeBody: any = {};
  try {
    nativeBody = init.body ? JSON.parse(String(init.body)) : {};
  } catch {
    throw new HttpError(500, 'geminiFetch expects a JSON body');
  }

  const res = await fetch(`${aggBase(ctx.env)}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await aggKey(ctx)}`,
    },
    body: JSON.stringify(toOpenAIRequest(model, nativeBody)),
    signal: (init as any).signal,
  });

  // Errors pass through untranslated: OpenAI's `{ error: { message } }` is the same
  // shape the ported code already reads out of Gemini failures.
  if (!res.ok) return res;

  return geminiShapedResponse(await res.json());
}

export async function anthropicFetch(ctx: Ctx, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers as HeadersInit);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01');

  if (mode(ctx.env) === 'gateway') {
    headers.set('x-api-key', await ctx.keys.require('ANTHROPIC_API_KEY'));
    return fetch(gwUrl(ctx.env, 'anthropic', path), { ...init, headers });
  }

  // CheaperInference is Anthropic-compatible, so the body passes through untouched —
  // except the model id, which the catalogue spells differently (claude-sonnet-4.6, not
  // claude-sonnet-4-6). Unmapped ids would 404.
  const key = await aggKey(ctx);
  headers.set('x-api-key', key);
  headers.set('Authorization', `Bearer ${key}`);
  return fetch(`${aggBase(ctx.env)}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    body: remapSerializedModel(init.body),
  });
}

export async function openaiFetch(ctx: Ctx, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers as HeadersInit);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (mode(ctx.env) === 'gateway') {
    headers.set('Authorization', `Bearer ${await ctx.keys.require('OPENAI_API_KEY')}`);
    return fetch(gwUrl(ctx.env, 'openai', path), { ...init, headers });
  }

  headers.set('Authorization', `Bearer ${await aggKey(ctx)}`);
  return fetch(`${aggBase(ctx.env)}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
    body: remapSerializedModel(init.body),
  });
}

// ── JSON convenience wrappers ─────────────────────────────────────────────────

export async function gemini(ctx: Ctx, path: string, body: unknown, opts: { timeoutMs?: number } = {}) {
  const res = await geminiFetch(ctx, path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.error || String(parsed).slice(0, 300);
    throw new HttpError(res.status, `Gemini error ${res.status}: ${detail}`);
  }
  return parsed;
}

export async function geminiGenerate(ctx: Ctx, model: string, payload: unknown, opts?: { timeoutMs?: number }) {
  return gemini(ctx, `/v1beta/models/${model}:generateContent`, payload, opts);
}

/** Pull the concatenated text out of a Gemini response, as the originals all did. */
export function geminiText(res: any): string {
  const parts = res?.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => p?.text || '').join('');
}

export async function anthropic(ctx: Ctx, body: unknown, opts: { timeoutMs?: number } = {}) {
  const res = await anthropicFetch(ctx, '/v1/messages', {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.error || String(parsed).slice(0, 300);
    throw new HttpError(res.status, `Anthropic error ${res.status}: ${detail}`);
  }
  return parsed;
}

export function anthropicText(res: any): string {
  return (res?.content || [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

export async function openai(ctx: Ctx, path: string, body: unknown, opts: { timeoutMs?: number } = {}) {
  const providerMode = mode(ctx.env);
  return fetchJson(
    providerMode === 'gateway'
      ? gwUrl(ctx.env, 'openai', path)
      : `${aggBase(ctx.env)}${path.startsWith('/') ? path : `/${path}`}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${
          providerMode === 'gateway'
            ? await ctx.keys.require('OPENAI_API_KEY')
            : await aggKey(ctx)
        }`,
      },
      body: JSON.stringify(providerMode === 'gateway' ? body : remapBodyModel(body)),
      timeoutMs: opts.timeoutMs ?? 120_000,
      retries: 1,
    },
  );
}

// ── Core.InvokeLLM replacement ────────────────────────────────────────────────
//
// Reproduces Base44's `integrations.Core.InvokeLLM` contract used at 23 backend and 18
// frontend sites: plain prompt -> string; prompt + response_json_schema -> object.

export interface InvokeLLMArgs {
  prompt: string;
  system?: string;
  response_json_schema?: unknown;
  max_tokens?: number;
  model?: string;
}

export async function invokeLLM(ctx: Ctx, args: InvokeLLMArgs): Promise<any> {
  const hasSchema = !!args.response_json_schema;
  const maxTokens = args.max_tokens || (hasSchema ? 2000 : 4000);
  const system =
    args.system ??
    (hasSchema
      ? 'You are a helpful assistant. Respond ONLY with valid JSON — no preamble, no markdown fences, no explanation. Just the raw JSON object.'
      : undefined);

  let text: string;

  // Matches `src/lib/invokeLLM.js`, which already proxied to Anthropic. Falls back to
  // Gemini so the app still works on a key set without Claude.
  const useClaude =
    mode(ctx.env) === 'aggregator' || (await ctx.keys.has('ANTHROPIC_API_KEY'));

  if (useClaude) {
    const body: Record<string, unknown> = {
      model: args.model || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: args.prompt }],
    };
    if (system) body.system = system;
    text = anthropicText(await anthropic(ctx, body));
  } else {
    const payload: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    text = geminiText(await geminiGenerate(ctx, mapModel(args.model || 'gemini-2.5-flash'), payload));
  }

  if (!text) throw new HttpError(502, 'LLM returned no text content');
  if (!hasSchema) return text.trim();

  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e: any) {
    throw new HttpError(502, `LLM returned invalid JSON: ${e.message}`);
  }
}
