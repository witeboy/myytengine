# Phase 7 — Image & video generation

> Prepend `codex/00-PREAMBLE.md`. Phase 6 must be green first.

**16 functions: 14 codemod + 2 hand-written.** This batch is where the S3 SDK dies and
R2 becomes a binding.

---

## Step 1 — Run the batch (14 functions)

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase7.json
```

**Expected: `14 pass / 0 fail (246 strings compared)`, 3 PORT-TODO, exit 0.**

## Step 2 — Place the two hand-written files

`uploadToR2` and `proxyFetchAsset` are **not** in the manifest. The codemod cannot do
them: both drive R2 through `@aws-sdk/client-s3`, and the Worker replacement is a
different API, not a different URL. Both are written for you:

- `workers/api/src/fn/uploadToR2.ts`
- `workers/api/src/fn/proxyFetchAsset.ts`

Copy them in as-is. Read the header comments — they document the exact browser contract
each one must keep.

### Why they were rewritten rather than transformed

`uploadToR2` is a **multipart upload** with `init` / `chunk` / `complete` / `abort`
actions, driven from `src/lib/ExportContext.jsx:69-160` in 5MB base64 chunks. R2's
binding has native multipart (`createMultipartUpload` → `resumeMultipartUpload` →
`uploadPart` → `complete`/`abort`), so the port is a clean 1:1 — but only if the wire
field names survive: `upload_id`, `r2_key`, `part_number`, `etag`, `parts[]`, `url`.
They do. **Do not rename any of them**; the browser half is not changing.

> R2 requires every multipart part except the last to be the same size and ≥5 MiB.
> `ExportContext` uses a fixed `CHUNK_SIZE = 5 * 1024 * 1024`. If you ever change that
> constant, change it on both sides or completion fails.

`proxyFetchAsset` keeps its domain allowlist verbatim and its two response shapes
(`{success, data, content_type, size}` inline base64 under 12MB, `{success, file_url, …}`
above). One deliberate fix: the original built base64 with
`String.fromCharCode.apply(null, subarray)`, which pushes every byte onto the argument
stack and throws `RangeError` on large buffers in a Worker. Same output, explicit loop.

> ⚠ **Storage is tiered, and `tier` is REQUIRED** — TypeScript rejects a write without
> one. The rule: **if a URL is written into an entity row, use `'durable'`.** Only the
> export-time proxy cache is `'ephemeral'` (swept at ~48h). See `lib/storage.ts`.

## Step 3 — Resolve the flagged items

### 3a · S3 SDK → `lib/r2.ts` — `generateNewThumbnailImage`, `pollThumbnailTask`
Both do a single `PutObjectCommand`. Replace the whole `new S3Client({...})` +
`r2Client.send(new PutObjectCommand({...}))` block:

```ts
// before — generateNewThumbnailImage:596
const r2Client = new S3Client({ region: 'auto', endpoint: …, credentials: {…} });
await r2Client.send(new PutObjectCommand({ Bucket: …, Key: fileName, Body: bytes, ContentType: contentType }));
const fileUrl = `${publicBase}/${fileName}`;

// after
const { url: fileUrl } = await putMedia(ctx, bytes, {
  tier: 'durable', filename: fileName, contentType,
});
```

`pollThumbnailTask`'s helper `reuploadToR2(imageUrl, conceptId)` fetches a URL and
re-uploads it — that is exactly `ingestUrl` from `lib/r2.ts`:

```ts
import { ingestUrl } from '../lib/r2';
const { url: persistentUrl } = await ingestUrl(ctx, imageUrl, {
  tier: 'durable',                      // an entity stores this URL — never swept on a timer
  prefix: `thumbnails/${conceptId}`,
});
```
Delete the local helper and the `ctx` the codemod injected into it. Keep the call sites
(`pollThumbnailTask.ts:109` and `:168`) doing the same thing at the same points.

Delete the five now-unused env vars everywhere they appear: `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`,
`CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`. They are **not** in
`lib/providers.ts` and never will be — R2 needs no credentials in a Worker.

### 3b · `ctx` injected into helpers — `generateSceneImage`, `extractCharacterDNA`, `generateProgressionPrompts`, `pollThumbnailTask`
Same as Phase 6. `processScene`, `callGemini`, `callClaude`, `callLLM`, `reuploadToR2`
gained a leading `ctx` parameter at both declaration and call sites. Verify with typecheck.

### 3c · Gemini URL in a variable — `extractCharacterDNA`
Same as Phase 6 §2b. Convert the `fetch(url, init)` to
`geminiFetch(ctx, '<path>', init)` and drop the now-dead `url` variable.

### 3d · Removed blocks — informational
The codemod deleted per-function CORS preflight blocks (`generateNewThumbnailImage`,
`pollThumbnailTask`, `thumbnailBlend`, `pollThumbnailBlend`) and the deferred
`let base44 … createClientFromRequest(req)` pattern (`generateSceneVideo`,
`generateProgressionVideo`). **Check the catch blocks** in the latter two: they had
`if (scene_id && base44) { …mark failed… }` and now read `if (scene_id)`. That cleanup
must still run.

## Step 4 — KIE notes

**KIE does not go through AI Gateway.** The gateway fronts LLM providers only. KIE URLs
stay exactly as they are; the only change is the key, which the codemod already did.
`lib/kie.ts` is provided for shared use and new code — ported files may keep their inline
`fetch`. Do not refactor working functions onto it just for tidiness.

The KIE contract, for reference (read out of the source, not invented):
```
POST /api/v1/jobs/createTask   { model, input }   -> { code, data: { taskId } }
GET  /api/v1/jobs/recordInfo?taskId=X             -> { code, data: { state, resultJson, failMsg } }
states: undefined | pending | queued | processing | success | fail
result: JSON.parse(data.resultJson).resultUrls[0] ?? .url ?? .video_url
```
Two traps the originals already handle — preserve both:
1. **`code` is in the body.** HTTP 200 with `code !== 200` is a failure.
2. **`success` can arrive before `resultJson` is populated.** That is not an error; treat
   it as still-processing and poll again, or you write an empty URL into the entity.

## Step 4b — ⚠ Consolidate ALL image work onto KIE (owner-directed change)

House rule: **KIE owns every visual — text-to-image, image-to-image (editing,
compositing, face blending) and image-to-video (animation).** AI33 owns audio only.
Nothing visual may call AI33 after this phase.

That is not the state you inherit. Six ported functions still reach for AI33's image
endpoint `POST /v1i/task/generate-image` with `model_id: 'bytedance-seedream-4.5'`:

| Function | AI33 image use | Action |
|---|---|---|
| `generateSceneImage` | fallback branch | delete the branch |
| `generateThumbnailImage` | fallback branch | delete the branch |
| `pollSceneImage` | polls AI33 task ids | delete that dispatch arm |
| `pollThumbnailTask` | polls AI33 task ids | delete that dispatch arm |
| `thumbnailBlend` | **AI33 only** — no KIE path exists | **port it to KIE** |
| `pollThumbnailBlend` | **AI33 only** | **port it to KIE** |

### The four fallback removals are easy
`generateThumbnailImage` already runs a KIE-first cascade —
`seedream-edit` → `z-image` → `grok-imagine/text-to-image` → `seedream-4.5` — with AI33
last. Delete the AI33 arm and its polling counterpart. Keep the cascade order and every
model id: those four names are what
`src/components/content/ImageProviderSelector.jsx` shows the user (Auto, Z-Image,
Seedream 4.5, Grok Imagine, Nano Banana). **The picker must keep all five options and
its exact copy** — you are changing which API serves them, not what the user sees.

### `thumbnailBlend` / `pollThumbnailBlend` need a real port
These composite a face into a thumbnail through AI33's multipart
`/v1i/task/generate-image` (`bytedance-seedream-4.5`), then poll `/v1/task/{id}`.
KIE serves the same family, and the input shape is already proven in this repo — see the
`seedream-edit` call in `generateThumbnailImage`:

```ts
import { editImage, recordInfo } from '../lib/kie';

// submit — replaces the AI33 FormData block
const taskId = await editImage(ctx, {
  prompt,
  image_url: imageDataUrl,     // data: URI or public URL, as the original passed
  aspect_ratio: aspectRatio,
});

// poll — replaces the AI33 /v1/task/{id} loop
const rec = await recordInfo(ctx, taskId);
if (rec.state === 'fail')    return { success: false, error: rec.failMsg };
if (rec.state !== 'success') return { success: true, status: 'PROCESSING', task_id: taskId };
const blendedUrl = rec.url;
```
Keep the surrounding behaviour byte-for-byte: the same reference-image assembly, the
same prompt construction, the same `ThumbnailConcepts` writes, the same response fields.
Only the provider call changes.

> Task-id prefixes: `pollThumbnailTask` distinguishes AI33 from KIE ids. Once AI33 is
> gone that branch is dead — remove it, but check nothing persisted an AI33-prefixed id
> that would now fail to resolve. If in doubt, leave the arm returning a clear error
> rather than deleting it silently.

### After this step
```bash
grep -rn "ai33\|AI33" workers/api/src/fn/generateSceneImage.ts   workers/api/src/fn/generateThumbnailImage.ts   workers/api/src/fn/pollSceneImage.ts   workers/api/src/fn/pollThumbnailTask.ts   workers/api/src/fn/thumbnailBlend.ts   workers/api/src/fn/pollThumbnailBlend.ts
# -> nothing. AI33 is audio-only.
```

## Step 5 — ✅ FIX: re-host generated assets (owner-directed)

This was previously "report, do not fix". The owner has ruled: fix it.

KIE returns short-lived URLs on `file.aiquickdraw.com` / `tempfile.aiquickdraw.com`.
Three functions write those straight into entity rows, so those rows eventually point at
nothing. `proxyFetchAsset` exists largely to paper over the consequences at export time.

| Function | Writes | Currently |
|---|---|---|
| `pollThumbnailTask` | `ThumbnailConcepts.image_url` | ✅ already re-hosts |
| `pollSceneImage` | `Scenes.image_url` | ❌ raw KIE URL |
| `pollSceneVideo` | `Scenes.video_url` | ❌ raw KIE URL |
| `pollThumbnailBlend` | blend result | ❌ raw KIE URL |

In each of the three, re-host immediately before the entity write:

```ts
import { ingestUrl } from '../lib/storage';

// before
await ctx.db.Scenes.update(scene_id, { image_url: finalUrl, status: 'image_ready' });

// after
const stored = await ingestUrl(ctx, finalUrl, { tier: 'durable', prefix: 'scenes' });
await ctx.db.Scenes.update(scene_id, { image_url: stored.url, status: 'image_ready' });
```

Keep everything else identical — the same status strings, the same response fields, the
same "success but no URL yet, keep polling" branch.

> ⚠ **`tier: 'durable'`, not `'ephemeral'`.** The rule is in `lib/storage.ts`: if an
> entity row stores the URL, the asset is durable. A scene image swept at 48h would empty
> a project that is still open — worse than the expiring URL this fixes. Media for
> *archived* projects is freed separately by the archive sweep.

## Step 6 — Register and typecheck

Add all 16 to `registry.ts`, then:
```bash
cd workers/api && npm run typecheck
```

## Acceptance

- [ ] `port-batch.mjs …/phase7.json` → **14 pass / 0 fail**, exit 0
- [ ] `uploadToR2.ts` and `proxyFetchAsset.ts` placed; zero `PORT-TODO` left in `src/fn/`
- [ ] `grep -rn "aws-sdk\|S3Client\|PutObjectCommand" workers/api/src` → **nothing**
- [ ] `grep -rn "CLOUDFLARE_R2_\|CLOUDFLARE_ACCOUNT_ID" workers/api/src` → **nothing**
- [ ] `npm run typecheck` clean; all 16 registered
- [ ] **no image function calls AI33** — the grep in Step 4b returns nothing
- [ ] the image-model picker still shows all five options with unchanged labels
- [ ] **End-to-end, in the real UI:**
  - generate a scene image, poll it to `image_ready`, confirm it renders
  - generate a scene video from that image, poll to `video_ready`
  - generate a thumbnail, confirm `pollThumbnailTask` returns an R2 URL on your own domain
  - run a timeline export → `uploadToR2` multipart init/chunk/complete → the finished
    file plays from its public URL. **Test with a file over 10MB** so more than one part
    is exercised; single-part multipart uploads hide ordering bugs.
- [ ] `MIGRATION-NOTES.md` records Step 5

## Do not

- Do not route KIE through AI Gateway.
- Do not remove or rename an option in `ImageProviderSelector` — the model ids are
  user-visible labels.
- Do not "upgrade" a KIE model id (`grok-imagine/image-to-video`, `google/nano-banana`,
  `seedream-4.5`, `kie-ai/upscaler` …) or change `duration`, `resolution` or `mode`.
- Do not add R2 credentials to `wrangler.toml`. The binding is the credential.
- Do not start re-hosting scene assets (Step 5).
- Do not change `CHUNK_SIZE` on either side of the multipart upload.
