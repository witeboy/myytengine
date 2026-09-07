# Codex preamble — prepend this to EVERY phase prompt

You are implementing a substrate migration of `myytengine`, a faceless-YouTube content
engine, off Base44 and onto Vercel (frontend) + Cloudflare Workers (backend).

## The one rule

**Do not change behaviour.** No prompt text, model id, temperature, safety setting,
response schema, retry, timeout, copy string, className, layout or UX flow may change.
You are moving code between runtimes, not improving it.

If something looks like a bug, **leave it and append a line to `MIGRATION-NOTES.md`**.
Post-migration cleanup is a separate project.

## Rules that follow from it

1. **Do not change call signatures.** Shims exist so the ~440 existing call sites stay
   untouched. If you find yourself editing a `.jsx` page to make a backend change work,
   **stop** — the shim is wrong, fix the shim.
2. **One function per file** under `workers/api/src/fn/<name>.ts`, named exactly as the
   original Base44 function. Register it in `src/fn/registry.ts`.
3. **Port, don't rewrite.** Copy the body verbatim. Change only:
   - the import header (`npm:@base44/sdk` → nothing)
   - the `Deno.serve(async (req) => …)` wrapper → `export default async function handler(body, ctx)`
   - `Deno.env.get('X')` → `await ctx.keys.require('X')`
   - `base44.entities.X` → `ctx.db.X`
   - `base44.auth.me()` + the `if (!user) return 401` prologue → delete (middleware does it)
   - `base44.integrations.Core.InvokeLLM` → `invokeLLM(ctx, …)` from `lib/ai`
   - `base44.integrations.Core.UploadFile` → `putMedia(ctx, …)` from `lib/r2`
   - provider base URLs → the AI Gateway equivalents in `lib/ai`
4. **Never invent an env var or an API endpoint.** The complete key list is
   `workers/api/src/lib/providers.ts`. Every URL must already appear in the source file
   you are porting.
5. **API keys are BYOK.** They live encrypted in D1, entered by the user in Settings.
   There are no provider keys in `wrangler.toml`. Read them via `ctx.keys`.
6. **When two duplicate versions of a function disagree, ASK.** Do not merge them.
7. **Do not add dependencies** without saying why in `MIGRATION-NOTES.md`.

## Reference documents

| File | What it is |
|---|---|
| `AUDIT.md` | Full repo audit: features, providers, coupling points |
| `MIGRATION-PLAN.md` | Architecture, the 4 contracts, phase list |
| `codex/PHASE-0-DEDUP-MANIFEST.md` | Exactly which file is canonical for each function |
| `codex/PORT-RECIPE.md` | Worked before/after for porting one function |

## Provider routing (set once, in lib/ai.ts — never in a ported function)

| Concern | Provider |
|---|---|
| **All LLM text + vision** — Claude, GPT, Gemini | **CheaperInference**, one key |
| Image gen, image-to-image, image-to-video | **KIE.ai**, called directly |
| TTS, voice cloning, sound effects, music | **AI33.pro**, called directly |
| Speech-to-text | AssemblyAI, falling back to Workers AI Whisper |

`AI_PROVIDER_MODE` in `wrangler.toml` switches LLM routing:

- `aggregator` (default) — CheaperInference. Claude and GPT use its Anthropic- and
  OpenAI-compatible surfaces (base-URL swap only). Gemini goes through the OpenAI
  surface with native↔OpenAI translation in `lib/gemini-compat.ts`, so callers still
  receive Gemini-shaped JSON.
- `gateway` — Cloudflare AI Gateway, per-provider direct calls with per-provider BYOK
  keys. The escape hatch, and the **only** mode that supports Gemini video understanding.

### ⚠ Model ids are remapped — do not "fix" them in a ported function

The code pins model ids from Base44's era. Almost none exist in the aggregator's
catalogue, and mismatches are **silent 404s at generation time**, not build errors:

| Pinned in code | Uses | Served as |
|---|---|---|
| `gemini-2.0-flash` | 39 | `gemini-2.5-flash` |
| `gemini-2.5-pro` | 9 | `gemini-3.1-pro` |
| `claude-sonnet-4-6` | 3 | `claude-sonnet-4.6` — **dot, not dash** |
| `claude-sonnet-4-5` | 4 | `claude-sonnet-4.5` |
| `claude-sonnet-4-20250514` | 5 | `claude-sonnet-4.5` |
| `claude-sonnet-3-5` | 3 | `claude-sonnet-4.5` |
| `gpt-4o` | 6 | `gpt-5.4` |
| `gpt-4o-mini` | 3 | `gpt-5-mini` |
| `gemini-2.5-flash`, `gemini-3.1-pro-preview` | 4 | unchanged |

`lib/models.ts` owns this. **Leave the pinned id in the ported function exactly as
written** — the mapping happens in transit. Editing a model id in `src/fn/` is a
behaviour change and breaks the one place the substitution is documented.
`healthCheck` fails loudly if any known id is unmapped.

**A ported function must never know which mode is active.** It calls
`geminiFetch` / `anthropicFetch` / `openaiFetch` and reads
`data.candidates[0].content.parts[0].text` exactly as it always did. If you find
yourself adding a mode check inside `src/fn/`, stop — it belongs in `lib/ai.ts`.

## The four contracts (memorise these)

- **C-1** `POST /api/fn/:name` → `{ data }` on success, `{ error }` with an HTTP status on failure
- **C-2** `POST /api/db/:entity/:op` — `filter` returns `[]` never null; `update` is a
  **partial merge**; `create`/`update` return the full row
- **C-3** every table = typed declared columns **+ an `attrs` JSON overflow column**,
  because Base44 was schemaless and 15 entities write undeclared fields
- **C-4** fields marked `cold` in `db/registry.ts` are offloaded to R2 above 64KB

## Definition of done for any phase

- `npm run typecheck` clean in `workers/api`
- `npm run build` and `npm run lint` clean in `apps/web`
- the phase's stated acceptance criteria pass
- `MIGRATION-NOTES.md` updated with anything you noticed but did not change
