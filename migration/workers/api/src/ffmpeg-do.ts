// Durable Object that fronts the ffmpeg container.
//
// The Container base class handles the lifecycle: it starts the container on first
// request, forwards HTTP to `defaultPort`, and stops it after `sleepAfter` of idleness.
// Because Cloudflare Containers bill per second of runtime, that idle timeout is a
// direct cost lever — short enough that nothing lingers, long enough that a burst of
// clips reuses one warm instance instead of paying cold start each time.
//
// One DO instance per job (lib/ffmpeg.ts uses a random id), so a slow encode never
// blocks an unrelated one.

import { Container } from '@cloudflare/containers';

export class FfmpegContainer extends Container {
  defaultPort = 8080;

  // A cold start is ~2–4s for this image. 5 minutes keeps a batch of clips on one warm
  // instance while still releasing it well inside an idle session.
  sleepAfter = '5m';

  override onStart() {
    console.log('[ffmpeg] container started');
  }

  override onStop() {
    console.log('[ffmpeg] container stopped');
  }

  override onError(err: unknown) {
    console.error('[ffmpeg] container error:', err);
    throw err;
  }
}
