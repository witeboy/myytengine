// Backend for `the hosted InvokeLLM integration`, which the client shim routes to
// POST /api/fn/invokeLLM. Used at 18 frontend sites (ViralTrendsPanel, PostProduction,
// and others) plus `src/lib/invokeLLM.js`.
//
// All the behaviour lives in lib/ai.ts so the backend and frontend paths cannot drift.
// Contract, unchanged from the original platform: no schema -> string, schema -> parsed object.

import { invokeLLM as run } from '../lib/ai';
import { badRequest } from '../lib/http';
import type { FnHandler } from '../types';

const handler: FnHandler = async (body, ctx) => {
  const { prompt, system, response_json_schema, max_tokens, model } = body || {};
  if (!prompt) throw badRequest('prompt is required');
  return run(ctx, { prompt, system, response_json_schema, max_tokens, model });
};

export default handler;
