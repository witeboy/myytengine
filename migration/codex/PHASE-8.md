# Phase 8 — Audio: voiceover, voice cloning, music, SFX, transcription

> Prepend `codex/00-PREAMBLE.md`. Phase 7 must be green first.

**13 functions: 11 codemod + 2 hand-written.** This batch retires Bunny CDN, moves sound
effects and background music onto AI33, switches transcription onto the
AssemblyAI ⇄ Whisper interface, and contains the only function in the whole migration
that **cannot be ported**.

---

## Step 1 — Run the batch

```bash
node migration/tools/port-batch.mjs migration/tools/batches/phase8.json
```

**Expected: `11 pass / 0 fail`, 18 PORT-TODO, exit 0.**

18 sounds alarming; it is 6 markers × the same 3 files, all the identical S3 block.

## Step 2 — Place the hand-written function

Copy in both:

- `workers/api/src/fn/quickPublishTranscribe.ts` — read its header; it documents every
  action and why three of them changed. Details in §4 and §5.
- `workers/api/src/fn/generateSoundEffect.ts` — **sound effects now run on AI33**, per
  the house rule that AI33 owns everything speech and audio *out*.

  ⚠ This one is deliberately **not** a like-for-like port. The original did not generate
  sound effects at all: it built the string `[Sound effect: ${text}]` and sent it to
  MiniMax **text-to-speech** with `voice_id: 'English_expressive_narrator'`, i.e. it
  produced a person reading those words aloud, with a music-API fallback. The
  replacement calls a real sound-generation endpoint. Input, output shape, the
  `Scenes.sound_effect_url` write and the `sfx/` key prefix are all unchanged; the audio
  itself will sound completely different, and correct.

  There is **no separate sound-generation endpoint** on AI33. Effects go through the
  same Suno endpoint as music (`/v1s/task/music-generation`) in simple mode with
  `make_instrumental: true`. Suno is asynchronous, so the handler submits and then polls
  inline — `SceneSfxEditor.jsx:50` makes one call and reads `res.data.audio_url`, and
  that contract is preserved. Inline polling is I/O wait, which costs a Worker
  essentially no CPU.

> ⚠ **Storage is tiered, and `tier` is REQUIRED** — TypeScript rejects a write without
> one. The rule: **if a URL is written into an entity row, use `'durable'`.** Only the
> export-time proxy cache is `'ephemeral'` (swept at ~48h). Getting this wrong deletes a
> live project's media. See `lib/storage.ts`.

## Step 3 — The S3 block, ×3

`generateVoiceover`, `inworldVoiceover` and `checkMusicStatus` all do the same thing: synthesize audio → upload bytes to R2 → return a public URL.

```ts
// before
const r2Client = new S3Client({ region: 'auto', endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: {…} });
const fileName = `music/${track_id}-${Date.now()}.mp3`;
await r2Client.send(new PutObjectCommand({ Bucket: …, Key: fileName, Body: audioBytes, ContentType: 'audio/mpeg' }));
const publicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
const permanentUrl = `${publicUrl}/${fileName}`;

// after
const fileName = `music/${track_id}-${Date.now()}.mp3`;      // ← unchanged
const { url: permanentUrl } = await putMedia(ctx, audioBytes, {
  tier: 'durable', filename: fileName, contentType: 'audio/mpeg',
});
```

> ⚠ **Use the binding directly, not `putMedia`.** `putMedia` generates its own key
> (`${prefix}/${uuid}_${name}`). These three build their own keys — `music/…`,
> `voiceovers/…`, `sfx/…` — and existing objects and stored URLs depend on that layout.
> **Keep every `fileName` expression exactly as written.** `putMedia` and `ingestUrl` are
> for new code and for the fetch-then-store case, not here.

Then delete the retired env vars. `grep -rn "CLOUDFLARE_R2_\|CLOUDFLARE_ACCOUNT_ID\|BUNNY_" workers/api/src`
must come back empty. They are deliberately absent from `lib/providers.ts` — R2 needs no
credentials in a Worker, and Bunny is gone.

## Step 3b — Music moves from KIE to AI33 — `generateMusic`, `checkMusicStatus`

House rule: **AI33 owns everything audio out** — speech, effects and music. KIE keeps
image and video only.

These two stay in the codemod batch rather than being hand-written, and that is
deliberate: `generateMusic` opens with a large Gemini "film music supervisor" prompt
that analyses the script and writes the music brief. **That prompt must not be retyped
or touched.** Only the synthesis call changes.

### `generateMusic` — swap the submit block only

Keep everything above it: the Gemini analysis, `musicPrompt`, `title`, the
`MusicTracks.update(track_id, { status: 'generating' })` write, the prompt-length clamp.
Replace only the KIE Suno submit (`https://api.kie.ai/api/v1/generate`, `model: 'V4'`):

```ts
import { submitMusic } from '../lib/ai33';

// Suno simple mode. Instrumental by default — score under narration should not have
// vocals competing with the voiceover. gpt_description_prompt is capped at 500 chars
// by AI33; submitMusic truncates for you.
const taskId = await submitMusic(ctx, musicPrompt);

return { success: true, status: 'pending', task_id: taskId, music_prompt: musicPrompt, title };
```
Return the same field names the original did (`success`, `status`, `task_id`,
`music_prompt`, `title`) — the frontend reads them.

### `checkMusicStatus` — poll the AI33 task

Replace the whole KIE `record-info` poll, its status vocabulary
(`SUCCESS` / `FIRST_SUCCESS` / `CREATE_TASK_FAILED` / …) and the S3 re-upload with:

```ts
import { getTask } from '../lib/ai33';
import { ingestUrl } from '../lib/r2';

const task = await getTask(ctx, task_id);

if (task.status === 'error') {
  if (track_id) await ctx.db.MusicTracks.update(track_id, { status: 'failed' });
  return { status: 'FAILED', error: task.error };
}
if (task.status !== 'done' || !task.audioUrl) {
  // A preview stream can appear before the final file — surface it, do not store it.
  return { status: 'PROCESSING', progress: task.progress, stream_url: task.streamUrl };
}

// Suno serves from cdn1.suno.ai, which expires. Re-host before persisting.
const stored = await ingestUrl(ctx, task.audioUrl, { tier: 'durable', prefix: 'music' });
if (track_id) {
  await ctx.db.MusicTracks.update(track_id, { audio_url: stored.url, status: 'ready' });
}
return { status: 'SUCCESS', audio_url: stored.url };
```
The S3 block in this file disappears entirely — it is one of the three from Step 3.

**Suno specifics that matter:**
- It returns **several clips** (usually two variations). `task.audioUrl` is the first;
  `task.allAudioUrls` holds the rest. The `MusicTracks` entity stores one URL, so keep
  taking the first — but the others are there if you ever want a "regenerate variation"
  affordance.
- `status: 'done'` is the completion value. Anything else that is not an error means
  keep polling.
- The result lives in `metadata`, not the envelope — `getTask` already unwraps it.

> Preserve whatever `MusicTracks` status strings the original wrote (`generating`,
> `ready`, `failed`) — `MusicPanel.jsx` renders off them.

## Step 4 — Optional keys: verify the fallbacks still work

The codemod now distinguishes `ctx.keys.require()` (throws) from `ctx.keys.get()`
(returns null) based on whether the original null-checked the value. It reports which
keys it treated as optional. In this batch that matters most in `generateVoiceover`:

```ts
const MINIMAX_KEY = await ctx.keys.get('MINIMAX_API_KEY');   // not require()
…
if (useMinimax) {
  if (!MINIMAX_KEY) {
    throw new HttpError(500, 'MINIMAX_API_KEY not configured. Switch to AI33.');
  }
```

That guard must stay reachable. **Test it**: with no MiniMax key configured, request a
voiceover with `provider: 'minimax_direct'` and confirm you get that message rather than
a generic "Missing API key" — the app is meant to tell you to switch to AI33.

The three-path design is unchanged and worth understanding before you touch it:

| Path | Route | Task id prefix |
|---|---|---|
| A | MiniMax sync `/v1/t2a_v2` (≤5000 chars) | none — returns audio inline |
| B | MiniMax async `/v1/t2a_async_v2` | `minimax:` |
| C | AI33 async `/v3/text-to-speech` (FormData) | `ai33:` |

`pollVoiceover` dispatches on that prefix, with bare ids treated as legacy AI33.
**Preserve the prefixes.** They are persisted in `ProductionSettings.generation_task_id`,
so changing them orphans every in-flight job.

`lib/ai33.ts` is available (`ai33Fetch` raw passthrough, `submitTts`, `pollTts`,
`listVoicesByProvider`, `previewVoice`). Like KIE, **AI33 is called directly, not through
AI Gateway** — ported files may keep their inline fetches. Do not refactor working code
onto the helper for tidiness.

## Step 5 — ⚠ `clip_video` cannot be ported. Do not paper over it.

The original ran `new Deno.Command('ffmpeg', […])` — a subprocess writing to `/tmp`.
Workers have no subprocess, no filesystem, no ffmpeg. There is no transformation that
makes this work.

`quickPublishTranscribe.ts` therefore returns **501** for that action, with a message
naming the alternative. That is deliberate: a loud, specific failure beats a silent one.

Context for the decision, which is the owner's, not yours:

- **The browser path already exists and dominates.** `src/lib/clipWithFFmpeg.js`
  (ffmpeg.wasm) is imported by 8 modules — `ClipExtractor`, `ClipCard`,
  `ShortsClipperPanel`, `useFFmpegExport`, `renderShortWithCaptions`,
  `renderClipAndVoice`, `concatTimelapse`. `OpenShorts.jsx:277` states outright:
  *"all clipping runs in-browser via WebCodecs with 9:16 crop"*.
- **The server path has exactly one consumer**: `renderShortCloud.js` →
  `directApi.clipVideoCloud`, used only by `ShortsClipperPanel.jsx` — the same component
  that already imports the browser twin `renderShortWithCaptions.js`.

So the realistic options are (a) let `ShortsClipperPanel` use its browser path and drop
cloud render, or (b) re-host ffmpeg on Cloudflare Containers and point `clip_video` at it.

**Do neither on your own.** Do not re-point `ShortsClipperPanel` at the browser path, do
not delete `renderShortCloud.js`, do not stub the error away. Record it in
`MIGRATION-NOTES.md` under "Blocked — needs an owner decision" and move on.

## Step 6 — Rewrite `directApi.uploadToCloudinary` (frontend)

This is the one frontend function the migration forces to change, because
`bunny_config` returned `BUNNY_STORAGE_PASSWORD` **to the browser** so it could PUT
directly to Bunny. That handed a write credential to every client. It is gone and is not
coming back.

In `apps/web/src/lib/directApi.js`, replace the body of `uploadToCloudinary` — keep the
exported name, the options and the return shape, because `OpenShorts` and `QuickPublish`
destructure `secure_url`:

```js
export const uploadToCloudinary = async (file, { resourceType = 'video', onProgress } = {}) => {
  onProgress?.(5);
  const form = new FormData();
  form.append('file', file);

  const uploaded = await base44.integrations.Core.UploadFile({ file });
  const fileUrl = uploaded?.file_url;
  if (!fileUrl) throw new Error('Upload returned no file URL');

  onProgress?.(100);
  return { secure_url: fileUrl, public_id: fileUrl, cdn_url: fileUrl, storage: 'r2' };
};
```

`Core.UploadFile` is already wired to `POST /api/upload` by the client shim, so the
credential never leaves the Worker. Delete the `uploadViaBase44` fallback (it is now the
only path) and the whole Bunny XHR block.

Leave `getCloudinaryConfig` and `buildCloudinaryClipUrl` alone — they are called
elsewhere and their return shapes are still valid.

> **Do not rewrite the rest of `directApi.js`.** `generateSeo` and
> `generateThumbnailConcepts` contain prompt strings. Touch only `uploadToCloudinary`.

## Step 7 — Transcription: speech IN stays on AssemblyAI / Whisper

To be explicit about the split, because it is easy to get backwards:

| Direction | Provider |
|---|---|
| Speech **out** — TTS, voice cloning, sound effects | **AI33.pro** |
| Speech **in** — transcription / STT | **AssemblyAI**, falling back to Workers AI Whisper |

AI33 is deliberately not an STT option.



`submitTranscription`, `pollTranscription` and `quickPublishTranscribe`'s `submit`/`poll`
all route through `lib/asr.ts`, which picks AssemblyAI or Workers AI Whisper from
**Settings → Transcription engine** (`auto` uses AssemblyAI when a key exists).

Transcript ids are prefixed `aai:` / `cfw:` so `poll` knows which backend to ask.
`src/lib/transcribeASR.js` and `directApi.transcribeFile` treat the id as opaque and need
no change.

**Run the Phase 5 spike now if it has not been run.** Whisper word-timing quality is what
G4 caption auto-sync, G5 silence trim and `asrAutoSync.js` depend on. Compare both
engines on the same file. If Whisper's timings are poor, that is not a blocker — the user
adds an AssemblyAI key in Settings and the original path resumes.

## Step 8 — Register and typecheck

Add all 13 to `registry.ts`, then `cd workers/api && npm run typecheck`.

## Acceptance

- [ ] `port-batch.mjs …/phase8.json` → **11 pass / 0 fail**, exit 0
- [ ] `quickPublishTranscribe.ts` and `generateSoundEffect.ts` placed; zero `PORT-TODO` left in `src/fn/`
- [ ] `grep -rn "aws-sdk\|S3Client\|CLOUDFLARE_R2_\|CLOUDFLARE_ACCOUNT_ID\|BUNNY_" workers/api/src` → **nothing**
- [ ] `grep -rn "bunny" apps/web/src` → only harmless comments, no live calls
- [ ] `npm run typecheck` clean; all 13 registered
- [ ] **End-to-end, in the real UI:**
  - voice list loads; preview plays a sample
  - generate a voiceover on a real project → `generating` → poll → `completed`, audio
    plays from a URL on your own domain
  - with no MiniMax key, `provider: 'minimax_direct'` returns the "Switch to AI33" message
  - generate music → `checkMusicStatus` → track plays, served from your own domain
  - generate a sound effect on a scene → it is an actual effect, **not a voice reading
    the words** — this is how you confirm the AI33 SFX path is live
  - upload a video in OpenShorts → transcribe → words and chapters come back
  - OpenShorts project save / list / delete round-trips through the R2 manifest
- [ ] `MIGRATION-NOTES.md` records the `clip_video` block (§5)

## Do not

- Do not route AI33 or KIE through AI Gateway.
- Do not change the `minimax:` / `ai33:` task-id prefixes — in-flight jobs depend on them.
- Do not swap the `fileName` expressions for `putMedia`; the R2 key layout is load-bearing.
- Do not re-point `ShortsClipperPanel` away from `renderShortCloud` (§5).
- Do not reintroduce a client-visible storage credential in any form.
