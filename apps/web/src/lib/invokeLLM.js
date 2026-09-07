// ─────────────────────────────────────────────────────────────────────────────
// invokeLLM.js — Drop-in replacement for base44.integrations.Core.InvokeLLM
//
// Routes through callClaudeProxy Deno function which uses ANTHROPIC_API_KEY.
// Handles both plain-text and JSON-schema responses identically to Base44's
// built-in InvokeLLM so all existing call sites work without changes.
// ─────────────────────────────────────────────────────────────────────────────
import { base44 } from '@/api/base44Client';

export async function invokeLLM({ prompt, response_json_schema, max_tokens }) {
  const hasSchema = !!response_json_schema;

  // Build system prompt: if caller expects JSON, instruct Claude to return pure JSON
  const system = hasSchema
    ? 'You are a helpful assistant. Respond ONLY with valid JSON — no preamble, no markdown fences, no explanation. Just the raw JSON object.'
    : undefined;

  const effectiveMaxTokens = max_tokens || (hasSchema ? 2000 : 4000);

  const res = await base44.functions.invoke('callClaudeProxy', {
    system,
    prompt,
    max_tokens: effectiveMaxTokens,
  });

  const data = res.data || res;
  if (data.error) throw new Error('LLM error: ' + data.error);

  const text = data.text || '';

  if (!hasSchema) {
    // Plain text response — return string (matches InvokeLLM behavior)
    return text.trim();
  }

  // JSON response — parse and return object (matches InvokeLLM behavior)
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    console.error('invokeLLM JSON parse failed. Raw:', clean.substring(0, 500));
    throw new Error('LLM returned invalid JSON: ' + err.message);
  }
}
