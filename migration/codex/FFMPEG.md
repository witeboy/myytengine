# Server-side ffmpeg — architecture

> Resolves the Phase 8 §5 blocker. Prepend `codex/00-PREAMBLE.md`.

## The problem

`quickPublishTranscribe`'s `clip_video` action ran `new Deno.Command('ffmpeg', […])` —
a subprocess writing to `/tmp`. Workers have no subprocess, no filesystem and no ffmpeg
binary. There is no transformation that makes it work in a Worker.

## The decision: Cloudflare Containers

**Run ffmpeg in a Cloudflare Container, invoked from the Worker.**

Why this over the alternatives:

| Option | Verdict |
|---|---|
| **Cloudflare Containers** | ✅ Same account, same billing, same logs, same `wrangler deploy`. Real ffmpeg binary, no wasm limits. Scales to zero. |
| Browser `ffmpeg.wasm` | Already exists and stays for interactive work — but it cannot run headless, scheduled, or on a machine that is closed. |
| External box (Fly / Hetzner / Railway) | Cheaper for sustained load, but a second platform to deploy, secure and monitor. Worth revisiting only if ffmpeg becomes a constant workload. |
| Managed video API (Shotstack, Creatomate) | Creatomate was already dropped once. Re-adding a paid renderer for operations this simple is poor value. |

**Be honest about the cost shape:** Containers bill per second of runtime, and video
encoding is CPU-bound — this will be the most expensive component in the stack per unit
of work. That is acceptable because the operations here are short (a 6s 9:16 crop, a
caption burn-in, a concat), not because it is cheap.

**Keep the browser path.** `src/lib/clipWithFFmpeg.js` is imported by 8 modules and
`OpenShorts.jsx:277` states clipping runs in-browser. Do not re-point those at the
container. The container serves the *cloud* path — batch work, scheduled jobs, and
`renderShortCloud` — where there is no browser to borrow.

## Shape

```
POST /api/fn/clipVideo          Worker
   └─ ctx.env.FFMPEG            Durable Object → Container
        ├─ GET  source from the Bunny CDN URL
        ├─ run  ffmpeg
        ├─ PUT  result to Bunny  (tier decided by the caller)
        └─ return { key, url, duration }
```

The Worker awaits the encode rather than polling: a 6s clip is seconds of work, and
`directApi.clipVideoCloud` is written as a single call. If an op is ever added that runs
for minutes, move it to the submit/poll shape the rest of the app uses — do not raise
the client timeout.

## The container's HTTP contract

Two endpoints: `POST /run` and `GET /health`. Deliberately dumb — all policy lives in
the Worker.

```
POST /run
{
  "op": "clip" | "burn_captions" | "concat" | "probe",
  "source_url": "https://cdn.example.b-cdn.net/ephemeral/…/src.mp4",
  "args": { … per op … },
  "upload": { "put_url": "https://ny.storage.bunnycdn.com/zone/key", "access_key": "…" }
}
->
{ "ok": true, "duration": 6.0, "bytes": 812344 }
```

The Worker hands the container a **pre-authorized upload target**, so the container
never holds long-lived credentials and never talks to the database. If the container is
ever compromised, the blast radius is one upload path.

### Ops

All four are implemented. `clip` is the one that unblocks today; the others exist
because the browser already does them and the cloud path will want parity.

| op | what |
|---|---|
| `clip` | cut + 9:16 portrait crop |
| `burn_captions` | hard-burn an SRT |
| `concat` | join clips (stream copy) |
| `probe` | duration without transcoding; also the health check |

The `clip` flags are copied verbatim from the original `clip_video`:
```
-ss {start} -i {src} -t {duration}
-vf crop=ih*9/16:ih,scale=720:1280
-c:v libx264 -preset ultrafast -crf 26
-c:a aac -b:a 128k -movflags +faststart
```
**Do not tune them.** They are what the existing output looks like; changing the preset
or CRF changes every clip the app has ever produced.

### Two things in the implementation worth knowing

**ffmpeg's protocol whitelist is pinned** to `file,http,https,tcp,tls,crypto`. Without
it, a crafted `source_url` using `file:` or `concat:` could make ffmpeg read the
container's own disk. `source_url` is also scheme-checked in Go before it is used, and
no user string is ever passed as an ffmpeg *flag* — only as a single `-i` value or a
file we wrote ourselves.

**Instances are pooled, not per-job.** `lib/ffmpeg.ts` uses `getRandom(binding, 5)`
rather than minting a fresh Durable Object id per job. A unique id per job means a brand
new container every time — cold start on every clip, which is the most expensive
possible shape when billing is per second. Keep `FFMPEG_POOL` in `lib/ffmpeg.ts` equal
to `max_instances` in `wrangler.toml`.

## Files — all written, place them as-is

```
workers/ffmpeg/main.go             the container server (POST /run, GET /health)
workers/ffmpeg/Dockerfile          two-stage: golang builder -> alpine + ffmpeg (~85MB)
workers/ffmpeg/go.mod
workers/api/src/ffmpeg-do.ts       Durable Object fronting the container
workers/api/src/lib/ffmpeg.ts      Worker-side client
workers/api/wrangler.toml          [[containers]] + DO binding + migration  (already added)
```

`quickPublishTranscribe`'s `clip_video` action already calls `runClip` — no separate
`clipVideo.ts` is needed.

### Why Go

The server is ~200 lines of stdlib: parse JSON, run ffmpeg, PUT the result. Go gives a
static binary and an ~85MB image against ~140MB for Node. **Cold start scales with image
size and Containers bill per second**, so this is a cost decision, not a taste one. If
you would rather keep everything TypeScript, the port is mechanical — the contract is
what matters, not the language.

### Deploy

```bash
cd workers/api
npm install                 # pulls @cloudflare/containers
npx wrangler deploy         # builds the image and pushes the Worker together
```

Docker must be running locally — wrangler builds the image on your machine.

## Already wired

`quickPublishTranscribe`'s `clip_video` action no longer throws 501 — it calls
`runClip` and returns the shape `directApi.clipVideoCloud` already reads:

```ts
const { clip_url, duration } = await runClip(ctx, { source_url, start, end });
return { success: true, clip_url, duration };
```

So `renderShortCloud.js` works unchanged and `ShortsClipperPanel` keeps both its cloud
and browser options — which was the point of not deleting either.

**Graceful absence:** until the container is deployed, `ctx.env.FFMPEG` is undefined and
`runClip` throws a 501 naming the in-browser path. Nothing else breaks, and
`healthCheck` reports the container as "not configured" rather than failing. That means
Phases 0–11 can run to completion before the container exists.

## Acceptance

- [ ] `npx wrangler deploy` builds the image and deploys; `GET /health` returns `{ok:true}`
- [ ] `/run` responds to `probe` with a duration
- [ ] a 6s clip from a real Bunny URL comes back cropped 720×1280, plays, has audio
- [ ] ffmpeg flags byte-match the original — diff them, do not eyeball
- [ ] the container holds no API keys and no database access
- [ ] a failed encode returns a message naming the op, not a generic 500
- [ ] the browser path still works in `ClipExtractor` — it must not have been touched
