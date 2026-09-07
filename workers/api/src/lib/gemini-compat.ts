// Gemini native <-> OpenAI chat-completions translation.
//
// WHY THIS EXISTS
// ---------------
// CheaperInference exposes OpenAI-compatible and Anthropic-compatible surfaces. Claude
// and GPT therefore need nothing but a base-URL change. Gemini is the odd one out: ~51
// of the ported functions call it in its NATIVE shape —
//
//   POST /v1beta/models/gemini-2.0-flash:generateContent
//   { contents: [{ parts: [{ text }] }], generationConfig: { temperature, maxOutputTokens } }
//   -> data.candidates[0].content.parts[0].text
//
// Rather than rewrite 51 functions (and risk their prompts), this module translates the
// request on the way out and the response on the way back, so `geminiFetch` can hand
// callers a Response whose JSON is shaped EXACTLY like Gemini's. Every ported function
// keeps working unchanged — `res.ok`, `await res.json()`, `candidates[0].content.parts`,
// their own retry loops and their own error parsing all still apply.
//
// SCOPE CHECK (measured against the ported set, not guessed):
//   - text calls .......... all fine
//   - image input ......... 2 functions (detectFaceRegion, newThumbnailConcept), supported
//   - video input ......... ZERO. Every video-to-Gemini call was an orphan or lived in a
//                           dropped action, so no translation is needed for it.
// If a future function sends video, this module must reject it loudly rather than
// silently dropping the part — see assertNoVideo below.

import { HttpError } from './http';
import { mapModel as mapModelId } from './models';

/** `/v1beta/models/gemini-2.0-flash:generateContent` -> `gemini-2.0-flash` */
export function modelFromPath(path: string): string {
  const m = path.match(/models\/([^:/?]+)/);
  if (!m) throw new HttpError(500, `Could not read a model id from Gemini path: ${path}`);
  return m[1];
}

// Model mapping lives in lib/models.ts — it covers Gemini, Claude and GPT in one
// place, because the code's pinned ids differ from the aggregator's catalogue for all
// three providers, not just Gemini.
export { mapModel } from './models';

function partsToOpenAIContent(parts: any[]): string | any[] {
  const out: any[] = [];
  let textOnly = true;

  for (const p of parts || []) {
    if (typeof p?.text === 'string') {
      out.push({ type: 'text', text: p.text });
      continue;
    }
    const inline = p?.inline_data || p?.inlineData;
    if (inline?.data) {
      const mime = inline.mime_type || inline.mimeType || 'image/jpeg';
      assertNoVideo(mime);
      textOnly = false;
      out.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${inline.data}` } });
      continue;
    }
    const file = p?.file_data || p?.fileData;
    if (file) {
      assertNoVideo(file.mime_type || file.mimeType || 'video/mp4');
      textOnly = false;
      out.push({ type: 'image_url', image_url: { url: file.file_uri || file.fileUri } });
      continue;
    }
  }

  // Keep plain-text messages as plain strings — some OpenAI-compatible servers are
  // stricter about the array form than the spec suggests.
  if (textOnly) return out.map((o) => o.text).join('\n');
  return out;
}

function assertNoVideo(mime: string) {
  if (mime.startsWith('video/')) {
    throw new HttpError(
      501,
      'Video input is not supported through the OpenAI-compatible aggregator. ' +
        'Route this function directly at Google AI Studio (AI_PROVIDER_MODE=gateway) ' +
        'or use a provider with native Gemini video understanding.',
    );
  }
}

/** Gemini `generateContent` body -> OpenAI `chat/completions` body. */
export function toOpenAIRequest(model: string, body: any): Record<string, unknown> {
  const messages: any[] = [];

  const sys = body?.systemInstruction || body?.system_instruction;
  if (sys?.parts?.length) {
    const text = sys.parts.map((p: any) => p?.text || '').join('\n').trim();
    if (text) messages.push({ role: 'system', content: text });
  }

  for (const c of body?.contents || []) {
    // Gemini uses 'model' where OpenAI uses 'assistant'; an absent role means user.
    const role = c?.role === 'model' ? 'assistant' : c?.role || 'user';
    messages.push({ role, content: partsToOpenAIContent(c?.parts || []) });
  }

  const gc = body?.generationConfig || body?.generation_config || {};
  const out: Record<string, unknown> = { model: mapModelId(model), messages };

  if (gc.temperature != null) out.temperature = gc.temperature;
  if (gc.maxOutputTokens != null) out.max_tokens = gc.maxOutputTokens;
  if (gc.topP != null) out.top_p = gc.topP;
  // Gemini's JSON mode. 27 of the ported functions set this and then JSON.parse the
  // result, so dropping it would break them.
  if ((gc.responseMimeType || gc.response_mime_type) === 'application/json') {
    out.response_format = { type: 'json_object' };
  }
  // Deliberately NOT forwarded: topK and safetySettings have no OpenAI equivalent.
  // They are advisory here; the prompts are unchanged either way.

  return out;
}

/** OpenAI `chat/completions` response -> the Gemini shape callers already parse. */
export function toGeminiResponse(data: any): any {
  const choices = data?.choices || [];
  const candidates = choices.map((ch: any) => ({
    content: {
      role: 'model',
      parts: [{ text: ch?.message?.content ?? '' }],
    },
    finishReason: ch?.finish_reason ?? 'STOP',
    index: ch?.index ?? 0,
  }));

  const u = data?.usage;
  return {
    candidates,
    usageMetadata: u
      ? {
          promptTokenCount: u.prompt_tokens ?? 0,
          candidatesTokenCount: u.completion_tokens ?? 0,
          totalTokenCount: u.total_tokens ?? 0,
        }
      : undefined,
  };
}

/** Build a Response that is indistinguishable from Google's, for the caller. */
export function geminiShapedResponse(openAiJson: any, status = 200): Response {
  return new Response(JSON.stringify(toGeminiResponse(openAiJson)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
