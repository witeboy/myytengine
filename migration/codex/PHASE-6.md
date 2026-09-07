# Phase 6 — Core text: scripts, hooks, scene breakdown, prompt engine

> Prepend `codex/00-PREAMBLE.md`. Read `codex/PORT-RECIPE.md` first.

**18 functions. ~750KB of source. 1,205 prompt strings that must not change by one byte.**

This is the batch where the app's output quality lives. You are **not** rewriting these
files by hand and you are **not** retyping any prompt. You run a codemod, fix what it
flags, and prove nothing moved.

---

## Step 1 — Run the batch

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase6.json
```

This runs, for each of the 18 functions:
- `port-fn.mjs` — the structural Deno→Worker transform, writing `workers/api/src/fn/<name>.ts`
- `verify-prompts.mjs` — extracts every string ≥40 chars from source and port and compares
  the multisets

**Expected output on a clean tree: `18 pass / 0 fail (1205 strings compared)`, 3 PORT-TODO
markers, exit 0.** If the pass count is lower, something upstream changed — stop and report
rather than editing prompts to make it green.

Re-run `port-batch.mjs` any time. It is deterministic and overwrites its outputs, so you can
iterate on the tool instead of hand-patching generated files.

---

## Step 2 — Resolve what the tool flags

It reports every item. Four kinds, all mechanical:

### 2a · `Injected ctx into helper(s): …` — 13 functions
Module-scope helpers like `callGemini`, `callClaude`, `callClaudeFallback`, `callOpenAI`
now need `ctx`. The tool already rewrote both the signature and the call sites:

```ts
async function callGemini(ctx, prompt, temperature = 0.7) { … }
const result = await callGemini(ctx, prompt);
```

**Check:** every call site got exactly one `ctx`, default parameters still line up, and no
call site inside another helper lost its own `ctx`. `npm run typecheck` catches all of this.

### 2b · `A Gemini URL was assigned to a variable before fetch()` — `generateScriptBatches`, `longViralGenerateScript`
These build the URL first:
```ts
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
const res = await fetch(url, init);
```
The tool rewrote the literal to `gwUrl(ctx.env, 'google-ai-studio', …)` and left a
PORT-TODO. **You must convert the `fetch(url, init)` call itself** to:
```ts
const res = await geminiFetch(ctx, `/v1beta/models/${model}:generateContent`, init);
```
and delete the now-unused `url` variable. Without this the request goes out with no API key.

### 2c · `Still references req` — `selectHook`
`selectHook` handles its own CORS preflight:
```ts
if (req.method === 'OPTIONS') { … }
```
**Delete that whole block.** CORS is handled centrally in `src/index.ts`. Nothing else in
the file touches `req`.

### 2d · `Calls another function` — `generateSceneBreakdown`
It invokes another function over HTTP. Import that handler and call it in-process:
```ts
import other from './other';
const result = await other({ …payload }, ctx);
```
Do **not** make an HTTP round-trip from one Worker route to another.

---

## Step 3 — Three findings you must act on before finishing

### 3.1 · `enhancePrompt` is dead — do not port it
`enhancePrompt.ts` and `rephraseScenePrompt.ts` are **byte-identical** (85KB each; `diff`
returns zero lines). The same implementation was deployed twice under different names.

- `rephraseScenePrompt` — **live**, called from `src/components/content/SceneCard.jsx:231`
- `enhancePrompt` — called only from `base44/functions/generateAsset.ts`, which is itself
  an orphan, plus the old healthCheck's ping list

`phase6.json` therefore ports `rephraseScenePrompt` only. Leave `enhancePrompt` unported.
If something later turns out to need it, register the *same module* under both names rather
than copying the file:
```ts
import rephraseScenePrompt from './rephraseScenePrompt';
export const FUNCTIONS = { rephraseScenePrompt, enhancePrompt: rephraseScenePrompt, … };
```

### 3.2 · The prompt-engine cluster is one lineage — keep them separate anyway
| Pair | Identical |
|---|---|
| `enhancePrompt` ↔ `rephraseScenePrompt` | 100% |
| `enhanceScenePrompts` ↔ `enhancePrompt` | 95% (154 differing lines) |
| `generateScenePrompts` ↔ the others | ~67% |

They are the same "SCENE PROMPT GENERATOR" at three points in its evolution.
**Do not consolidate them.** They are wired to different UI entry points and consolidating
would change behaviour. Port all three as separate modules.

### 3.3 · ✅ FIX the hardcoded gender — owner-directed

This was previously "report, do not fix". The owner has ruled: **the script decides.**

`rephraseScenePrompt` contains a `sanitizeGender(desc)` helper that rewrites every
character to female:

```js
.replace(/\bany gender\b/gi, 'female')
.replace(/\ba person\b/gi,   'a woman')
.replace(/\ban adult\b/gi,   'a woman')
```

`enhanceScenePrompts` has a near-identical helper that derives per character — but it
still defaults to female when no male marker is found, so it is not the fix either.

**In BOTH functions, delete the local `sanitizeGender` and use the shared helper:**

```ts
import { sanitizeGender } from '../lib/gender';

// before
sanitizeGender(fullDesc)

// after — pass the character's identity text, which is what the director wrote
sanitizeGender(fullDesc, identityDesc)
```

`lib/gender.ts` derives gender from the character's own description (`identity_core`,
`visual_description`, or `description` — whichever the character record carries), using
both male and female markers. Three outcomes:

| Director wrote | Result |
|---|---|
| male markers only | `a man` / `male` |
| female markers only | `a woman` / `female` |
| nothing, or both | **substitution skipped — wording left exactly as written** |

That third row is the real change. Neither original could produce it; both invented a
gender. Do not add a fallback default — "the director did not say" is a valid answer and
inventing one is the bug being fixed.

The replacement patterns and their order are unchanged, so a character the director
actually described produces byte-identical output to before.

## Step 4 — Register and typecheck

Add all 18 to `workers/api/src/fn/registry.ts`:
```ts
import generateFullScript from './generateFullScript';
// …one line per function

export const FUNCTIONS: Record<string, FnHandler> = {
  healthCheck,
  generateFullScript, generateScriptBatches, initializeScriptBatches,
  generateHooks, selectHook,
  generateSceneBreakdown, sleepSceneBreakdown, shortsSceneBreakdown,
  longViralSceneBreakdown, explainerSceneBreakdown,
  generateScenePrompts, enhanceScenePrompts, cleanScenePrompt, fixScenePrompts,
  rephraseScenePrompt, dedupScenes,
  shortsGenerateScript, longViralGenerateScript,
};
```

```bash
cd workers/api && npm run typecheck
```

The ported files are ex-JavaScript, so expect implicit-`any` complaints on helper params.
**Add types; do not change logic.** If `strict` is too noisy for this batch, add
`// @ts-nocheck` to the top of a file as a *temporary* measure and log it in
`MIGRATION-NOTES.md` — but prefer typing the parameters.

---

## Step 5 — Runtime limits: what is and is not a risk

Earlier planning flagged "the 30s wall" broadly. Having read the call sites, here is the
accurate picture — do not over-engineer around a problem that is not there.

**Workers limit CPU time, not wall time.** Time spent awaiting a Gemini or Claude response
costs essentially no CPU. These functions are I/O-bound, so a 40-second Gemini call is fine.

**The frontend already drives a resumable loop.** `src/pages/ContentGeneration.jsx:534`:
```js
while (!promptsDone && attempts < MAX_ATTEMPTS) {          // MAX_ATTEMPTS = 20
  const prResult = await base44.functions.invoke('generateScenePrompts', { project_id });
  promptsDone = (prResult?.data || prResult)?.done === true;
  …
  if (status === 500 || status === 502 || status === 504) { /* wait 8s, retry */ }
}
```
`generateScenePrompts` handles `BASE_BATCH_SIZE = 12` scenes per invocation with
`PARALLEL_PROMPT_BATCHES = 3` concurrent calls, then returns
`{ done, remaining_scenes }`. **Preserve that contract exactly** — the batch sizes, the
`done` flag and the field names. The same pattern appears in `generateSceneBreakdown`,
`longViralSceneBreakdown` and `longViralGenerateScript`.

**What to actually watch:**
- **Subrequest count** — 50 per request on the Workers free plan, 1000 on paid. At 3
  parallel Gemini calls per batch these are comfortable, but a paid plan is assumed.
- **Real CPU work** — `generateScenePrompts` runs heavy regex over prompt text
  (identity injection, name stripping). At 12 scenes per invocation this is fine. If you
  ever raise `BASE_BATCH_SIZE`, re-measure.
- **Client timeout** — the frontend shim uses a 300s timeout (`apps/web/src/api/client.js`).

Raise a concern only if `wrangler tail` shows an actual `Exceeded CPU limit`.

---

## Acceptance

- [ ] `node migration/tools/port-batch.mjs migration/tools/batches/phase6.json` → **18 pass / 0 fail**, exit 0
- [ ] every flagged item from Step 2 resolved; zero `PORT-TODO` left in `src/fn/`
- [ ] `cd workers/api && npm run typecheck` clean
- [ ] all 18 registered in `registry.ts`; `/api/fn/<name>` returns 200 for each
- [ ] **End-to-end**: create a project in the real UI and run Topics → Hooks → Duration →
      Script → Scene Breakdown → Scene Prompts. Scenes reach `prompts_ready`.
- [ ] **Output parity**: run the same seed topic through Base44 and through the Worker.
      Compare the generated script and 3 scene prompts. Wording will differ (the models are
      non-deterministic) — what must match is *structure*: same field names, same scene
      count, same act assignment, same status transitions. A structural difference means a
      port bug.
- [ ] `MIGRATION-NOTES.md` records finding 3.3 and anything else you noticed but did not change

## Do not

- Do not edit a prompt string. Not to fix a typo, not to reword, not to reindent.
- Do not "improve" a model id, temperature or `maxOutputTokens`.
- Do not consolidate the three prompt-engine variants.
- Do not add a default gender when the director specified none (§3.3).
- Do not make prompt verification pass by changing the source file.ctions. ~750KB of source. 1,205 prompt strings that must not change by one byte.**

This is the batch where the app's output quality lives. You are **not** rewriting these
files by hand and you are **not** retyping any prompt. You run a codemod, fix what it
flags, and prove nothing moved.

---

## Step 1 — Run the batch

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase6.json
```

This runs, for each of the 18 functions:
- `port-fn.mjs` — the structural Deno→Worker transform, writing `workers/api/src/fn/<name>.ts`
- `verify-prompts.mjs` — extracts every string ≥40 chars from source and port and compares
  the multisets

**Expected output on a clean tree: `18 pass / 0 fail (1205 strings compared)`, 3 PORT-TODO
markers, exit 0.** If the pass count is lower, something upstream changed — stop and report
rather than editing prompts to make it green.

Re-run `port-batch.mjs` any time. It is deterministic and overwrites its outputs, so you can
iterate on the tool instead of hand-patching generated files.

---

## Step 2 — Resolve what the tool flags

It reports every item. Four kinds, all mechanical:

### 2a · `Injected ctx into helper(s): …` — 13 functions
Module-scope helpers like `callGemini`, `callClaude`, `callClaudeFallback`, `callOpenAI`
now need `ctx`. The tool already rewrote both the signature and the call sites:

```ts
async function callGemini(ctx, prompt, temperature = 0.7) { … }
const result = await callGemini(ctx, prompt);
```

**Check:** every call site got exactly one `ctx`, default parameters still line up, and no
call site inside another helper lost its own `ctx`. `npm run typecheck` catches all of this.

### 2b · `A Gemini URL was assigned to a variable before fetch()` — `generateScriptBatches`, `longViralGenerateScript`
These build the URL first:
```ts
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
const res = await fetch(url, init);
```
The tool rewrote the literal to `gwUrl(ctx.env, 'google-ai-studio', …)` and left a
PORT-TODO. **You must convert the `fetch(url, init)` call itself** to:
```ts
const res = await geminiFetch(ctx, `/v1beta/models/${model}:generateContent`, init);
```
and delete the now-unused `url` variable. Without this the request goes out with no API key.

### 2c · `Still references req` — `selectHook`
`selectHook` handles its own CORS preflight:
```ts
if (req.method === 'OPTIONS') { … }
```
**Delete that whole block.** CORS is handled centrally in `src/index.ts`. Nothing else in
the file touches `req`.

### 2d · `Calls another function` — `generateSceneBreakdown`
It invokes another function over HTTP. Import that handler and call it in-process:
```ts
import other from './other';
const result = await other({ …payload }, ctx);
```
Do **not** make an HTTP round-trip from one Worker route to another.

---

## Step 3 — Three findings you must act on before finishing

### 3.1 · `enhancePrompt` is dead — do not port it
`enhancePrompt.ts` and `rephraseScenePrompt.ts` are **byte-identical** (85KB each; `diff`
returns zero lines). The same implementation was deployed twice under different names.

- `rephraseScenePrompt` — **live**, called from `src/components/content/SceneCard.jsx:231`
- `enhancePrompt` — called only from `base44/functions/generateAsset.ts`, which is itself
  an orphan, plus the old healthCheck's ping list

`phase6.json` therefore ports `rephraseScenePrompt` only. Leave `enhancePrompt` unported.
If something later turns out to need it, register the *same module* under both names rather
than copying the file:
```ts
import rephraseScenePrompt from './rephraseScenePrompt';
export const FUNCTIONS = { rephraseScenePrompt, enhancePrompt: rephraseScenePrompt, … };
```

### 3.2 · The prompt-engine cluster is one lineage — keep them separate anyway
| Pair | Identical |
|---|---|
| `enhancePrompt` ↔ `rephraseScenePrompt` | 100% |
| `enhanceScenePrompts` ↔ `enhancePrompt` | 95% (154 differing lines) |
| `generateScenePrompts` ↔ the others | ~67% |

They are the same "SCENE PROMPT GENERATOR" at three points in its evolution.
**Do not consolidate them.** They are wired to different UI entry points and consolidating
would change behaviour. Port all three as separate modules.

### 3.3 · ✅ FIX the hardcoded gender — owner-directed

This was previously "report, do not fix". The owner has ruled: **the script decides.**

`rephraseScenePrompt` contains a `sanitizeGender(desc)` helper that rewrites every
character to female:

```js
.replace(/any gender/gi, 'female')
.replace(/a person/gi,   'a woman')
.replace(/an adult/gi,   'a woman')
```

`enhanceScenePrompts` has a near-identical helper that derives per character — but it
still defaults to female when no male marker is found, so it is not the fix either.

**In BOTH functions, delete the local `sanitizeGender` and use the shared helper:**

```ts
import { sanitizeGender } from '../lib/gender';

// before
sanitizeGender(fullDesc)

// after — pass the character's identity text, which is what the director wrote
sanitizeGender(fullDesc, identityDesc)
```

`lib/gender.ts` derives gender from the character's own description (`identity_core`,
`visual_description`, or `description` — whichever the character record carries), using
both male and female markers. Three outcomes:

| Director wrote | Result |
|---|---|
| male markers only | `a man` / `male` |
| female markers only | `a woman` / `female` |
| nothing, or both | **substitution skipped — wording left exactly as written** |

That third row is the real change. Neither original could produce it; both invented a
gender. Do not add a fallback default — "the director did not say" is a valid answer and
inventing one is the bug being fixed.

The replacement patterns and their order are unchanged, so a character the director
actually described produces byte-identical output to before.

## Step 4 — Register and typecheck

Add all 18 to `workers/api/src/fn/registry.ts`:
```ts
import generateFullScript from './generateFullScript';
// …one line per function

export const FUNCTIONS: Record<string, FnHandler> = {
  healthCheck,
  generateFullScript, generateScriptBatches, initializeScriptBatches,
  generateHooks, selectHook,
  generateSceneBreakdown, sleepSceneBreakdown, shortsSceneBreakdown,
  longViralSceneBreakdown, explainerSceneBreakdown,
  generateScenePrompts, enhanceScenePrompts, cleanScenePrompt, fixScenePrompts,
  rephraseScenePrompt, dedupScenes,
  shortsGenerateScript, longViralGenerateScript,
};
```

```bash
cd workers/api && npm run typecheck
```

The ported files are ex-JavaScript, so expect implicit-`any` complaints on helper params.
**Add types; do not change logic.** If `strict` is too noisy for this batch, add
`// @ts-nocheck` to the top of a file as a *temporary* measure and log it in
`MIGRATION-NOTES.md` — but prefer typing the parameters.

---

## Step 5 — Runtime limits: what is and is not a risk

Earlier planning flagged "the 30s wall" broadly. Having read the call sites, here is the
accurate picture — do not over-engineer around a problem that is not there.

**Workers limit CPU time, not wall time.** Time spent awaiting a Gemini or Claude response
costs essentially no CPU. These functions are I/O-bound, so a 40-second Gemini call is fine.

**The frontend already drives a resumable loop.** `src/pages/ContentGeneration.jsx:534`:
```js
while (!promptsDone && attempts < MAX_ATTEMPTS) {          // MAX_ATTEMPTS = 20
  const prResult = await base44.functions.invoke('generateScenePrompts', { project_id });
  promptsDone = (prResult?.data || prResult)?.done === true;
  …
  if (status === 500 || status === 502 || status === 504) { /* wait 8s, retry */ }
}
```
`generateScenePrompts` handles `BASE_BATCH_SIZE = 12` scenes per invocation with
`PARALLEL_PROMPT_BATCHES = 3` concurrent calls, then returns
`{ done, remaining_scenes }`. **Preserve that contract exactly** — the batch sizes, the
`done` flag and the field names. The same pattern appears in `generateSceneBreakdown`,
`longViralSceneBreakdown` and `longViralGenerateScript`.

**What to actually watch:**
- **Subrequest count** — 50 per request on the Workers free plan, 1000 on paid. At 3
  parallel Gemini calls per batch these are comfortable, but a paid plan is assumed.
- **Real CPU work** — `generateScenePrompts` runs heavy regex over prompt text
  (identity injection, name stripping). At 12 scenes per invocation this is fine. If you
  ever raise `BASE_BATCH_SIZE`, re-measure.
- **Client timeout** — the frontend shim uses a 300s timeout (`apps/web/src/api/client.js`).

Raise a concern only if `wrangler tail` shows an actual `Exceeded CPU limit`.

---

## Acceptance

- [ ] `node migration/tools/port-batch.mjs migration/tools/batches/phase6.json` → **18 pass / 0 fail**, exit 0
- [ ] every flagged item from Step 2 resolved; zero `PORT-TODO` left in `src/fn/`
- [ ] `cd workers/api && npm run typecheck` clean
- [ ] all 18 registered in `registry.ts`; `/api/fn/<name>` returns 200 for each
- [ ] **End-to-end**: create a project in the real UI and run Topics → Hooks → Duration →
      Script → Scene Breakdown → Scene Prompts. Scenes reach `prompts_ready`.
- [ ] **Output parity**: run the same seed topic through Base44 and through the Worker.
      Compare the generated script and 3 scene prompts. Wording will differ (the models are
      non-deterministic) — what must match is *structure*: same field names, same scene
      count, same act assignment, same status transitions. A structural difference means a
      port bug.
- [ ] `MIGRATION-NOTES.md` records finding 3.3 and anything else you noticed but did not change

## Do not

- Do not edit a prompt string. Not to fix a typo, not to reword, not to reindent.
- Do not "improve" a model id, temperature or `maxOutputTokens`.
- Do not consolidate the three prompt-engine variants.
- Do not add a default gender when the director specified none (§3.3).
- Do not make prompt verification pass by changing the source file.
