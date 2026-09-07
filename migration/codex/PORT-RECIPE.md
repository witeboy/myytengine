# Port recipe — how to move one function (Phases 6–11)

> Prepend `codex/00-PREAMBLE.md`. You will run this 64 times. It is mechanical by design.

## Substitution table

| Base44 (Deno) | Worker | Notes |
|---|---|---|
| `import { createClientFromRequest } from 'npm:@base44/sdk@…'` | *(delete)* | |
| `Deno.serve(async (req) => { … })` | `export default async function handler(body, ctx) { … }` | |
| `const base44 = createClientFromRequest(req)` | *(delete)* | |
| `const user = await base44.auth.me()` | `const user = ctx.user` | middleware already enforced it |
| `if (!user) return Response.json({error:'Unauthorized'},{status:401})` | *(delete)* | |
| `const body = await req.json()` | *(delete)* — `body` is the parameter | |
| `base44.entities.X` | `ctx.db.X` | |
| **`base44.asServiceRole.entities.X`** | **`ctx.db.X`** | **146 files use this.** Base44 used it to bypass row-level security; `ctx.db` has no per-user filtering either, so behaviour is identical |
| `Deno.env.get('GEMINI_API_KEY')` | `await ctx.keys.require('GEMINI_API_KEY')` | BYOK — throws a clear 400 if unset |
| optional provider key | `await ctx.keys.get('MINIMAX_API_KEY')` | returns `null`; branch to the fallback path |
| `base44.integrations.Core.InvokeLLM(args)` | `await invokeLLM(ctx, args)` | from `lib/ai` |
| `base44.integrations.Core.UploadFile({file})` | `await putMedia(ctx, …)` | from `lib/r2` |
| `base44.integrations.Core.GenerateImage(args)` | KIE via `lib/kie` | |
| `return Response.json(x)` | `return x` | router wraps it as `{ data: x }` |
| `return Response.json({error:m},{status:s})` | `throw new HttpError(s, m)` | from `lib/http` |
| `fetch('https://generativelanguage.googleapis.com/v1beta/…')` | `geminiGenerate(ctx, model, payload)` | from `lib/ai` |
| `fetch('https://api.anthropic.com/v1/messages')` | `anthropic(ctx, body)` | from `lib/ai` |
| `fetch('https://api.openai.com/v1/…')` | `openai(ctx, path, body)` | from `lib/ai` |
| AssemblyAI submit/poll | `submit(ctx,url)` / `poll(ctx,id)` | from `lib/asr` |
| `console.log(...)` | keep as-is | useful in `wrangler tail` |

Everything else — **prompts, model ids, temperature, `responseMimeType`, JSON-repair
regexes, field names, log strings** — is copied byte-for-byte.

---

## Worked example: `researchNicheStrategy`

**Before** — `base44/functions/researchNicheStrategy/entry/entry/entry.ts`

```ts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel_id } = await req.json();
    if (!channel_id) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const prompt = `You are an expert YouTube content strategist. …`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" }
        }) }
    );
    if (!response.ok) { const err = await response.json();
      throw new Error(`Gemini error: ${err.error?.message || response.status}`); }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let strategy;
    try { strategy = JSON.parse(rawText); }
    catch (_) { const match = rawText.match(/\{[\s\S]*\}/); strategy = match ? JSON.parse(match[0]) : {}; }

    await base44.asServiceRole.entities.Channels.update(channel_id, {
      script_strategy: JSON.stringify(strategy),
    });
    console.log(`✓ Niche strategy researched for "${channel.niche}" channel "${channel.name}"`);
    return Response.json({ success: true, strategy });
  } catch (error) {
    console.error("researchNicheStrategy error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```

**After** — `workers/api/src/fn/researchNicheStrategy.ts`

```ts
// Ported from base44/functions/researchNicheStrategy/entry/entry/entry.ts
import { geminiGenerate } from '../lib/ai';
import { HttpError } from '../lib/http';
import type { FnHandler } from '../types';

const handler: FnHandler = async (body, ctx) => {
  const { channel_id } = body;
  if (!channel_id) throw new HttpError(400, 'channel_id required');

  const channels = await ctx.db.Channels.filter({ id: channel_id });
  const channel = channels[0];
  if (!channel) throw new HttpError(404, 'Channel not found');

  // PROMPT COPIED VERBATIM — do not edit.
  const prompt = `You are an expert YouTube content strategist. …`;

  const data = await geminiGenerate(ctx, 'gemini-2.0-flash', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let strategy: any;
  try {
    strategy = JSON.parse(rawText);
  } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    strategy = match ? JSON.parse(match[0]) : {};
  }

  await ctx.db.Channels.update(channel_id, { script_strategy: JSON.stringify(strategy) });
  console.log(`✓ Niche strategy researched for "${channel.niche}" channel "${channel.name}"`);

  return { success: true, strategy };
};

export default handler;
```

Then in `src/fn/registry.ts`:

```ts
import researchNicheStrategy from './researchNicheStrategy';
export const FUNCTIONS = { healthCheck, researchNicheStrategy, … };
```

Note what did **not** change: the prompt, `gemini-2.0-flash`, `temperature: 0.7`,
`maxOutputTokens: 4096`, `responseMimeType`, the JSON-repair regex, the log line, the
`{ success, strategy }` return shape. The outer try/catch is gone because the router
does exactly the same thing.

---

## Traps

**1. The 30-second CPU wall.** Base44's Deno host tolerated long runs — see
`invokeWithTimeout` in `apps/web/src/pages/ContentGeneration.jsx:499`, which deliberately
swallows 504s and polls instead. Workers do not. Before porting, check for loops over
scenes or batches. Known suspects: `autoBrollPopulate`, `generateScriptBatches`,
`enhanceScenePrompts`, `sleepBrollPopulate`.

Where a function already returns `{ done: false, remaining: N }` and the frontend loops
(as `components/content/AutoBrollButton.jsx` does), **keep that contract** — process one
chunk per invocation. Where it does not, raise it before porting; the answer is a
Durable Object, Queue or Workflow, not a bigger timeout.

**2. Undeclared fields.** Many functions write fields absent from the entity schema
(`Projects.scene_blueprint`, `ScriptBatches.analysis_*`, `Topics.viral_angle`,
`ThumbnailConcepts.psychological_trigger`). This is expected — `attrs` catches them.
**Do not "fix" the write to match the schema.** If a field is used in a `filter()` and
is not a real column, stop and report it; it needs promoting in `schema.sql` the way
`UploadMetadata.record_type` and `.status` already were.

**3. `res.data` unwrapping.** Frontend call sites do `const data = res.data || res`.
The router already returns `{ data }`, so a handler must return the **inner** value —
never `{ data: … }` itself, or callers get `res.data.data`.

**4. Optional providers.** If the original had a MiniMax or Inworld branch, keep it and
gate it on `await ctx.keys.get('MINIMAX_API_KEY')` being non-null. Absent key → fall
through to the AI33/KIE path. Never throw for an optional provider.

## Per-function checklist

- [ ] canonical source file confirmed against `PHASE-0-DEDUP-MANIFEST.md`
- [ ] header comment names the source file it was ported from
- [ ] every prompt string is byte-identical (diff them)
- [ ] model ids and generation params unchanged
- [ ] `asServiceRole` mapped to `ctx.db`
- [ ] returns the inner value, not `{ data }`
- [ ] error paths use `HttpError` with the original status codes
- [ ] registered in `src/fn/registry.ts`
- [ ] `npm run typecheck` clean
- [ ] exercised once from the real UI, not just curl
