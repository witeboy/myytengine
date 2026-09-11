// myytengine API Worker — the single backend the SPA talks to.
//
// Routes:
//   GET  /api/health                 no auth — liveness
//   GET  /api/auth/me                current user           [replaces base44.auth.me]
//   POST /api/db/:entity/:op         entity CRUD            [replaces base44.entities.*]
//   POST /api/fn/:name               ported functions       [replaces base44.functions.invoke]
//   POST /api/upload                 multipart -> R2        [replaces Core.UploadFile]
//   GET  /api/keys                   BYOK catalog + status
//   POST /api/keys/{set,test,testAll,delete,settings}

import { authenticate } from './middleware/auth';
import { handleDb } from './routes/db';
import { proxyNeonAuth } from './routes/neon-auth';
import { listKeys, removeKey, setKey, testAllKeys, testKey, updateSettings } from './routes/keys';
import { makeKeyResolver } from './lib/vault';
import { FUNCTIONS } from './fn/registry';
import { corsHeaders, fail, json, newId, notFound, ok } from './lib/http';
import { putMedia, sweepArchivedProject, sweepExpired } from './lib/storage';
import { makeDb } from './db/client';
import type { Ctx, Env } from './types';

// Durable Object class — must be exported from the entrypoint for wrangler to bind it.
export { FfmpegContainer } from './ffmpeg-do';

export default {
  async fetch(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/health') {
      return json({ data: { ok: true, ts: new Date().toISOString() } }, { status: 200 }, cors);
    }

    // Vercel's same-origin `/api/auth/*` rewrite lands here. This route must remain
    // before JWT authentication because it creates and refreshes the auth session.
    if (path === '/api/neon-auth' || path.startsWith('/api/neon-auth/')) {
      return proxyNeonAuth(req, env);
    }

    try {
      const user = await authenticate(req, env);
      const ctx: Ctx = {
        env,
        user,
        db: makeDb(env, user),
        keys: makeKeyResolver(env, user),
        waitUntil: (p) => exec.waitUntil(p),
      };

      const body =
        req.method === 'POST' && req.headers.get('Content-Type')?.includes('application/json')
          ? await req.json().catch(() => ({}))
          : {};

      // ── auth ────────────────────────────────────────────────────────────────
      if (path === '/api/auth/me') return ok(user, cors);

      // ── BYOK ────────────────────────────────────────────────────────────────
      if (path === '/api/keys') return ok(await listKeys(ctx), cors);
      if (path === '/api/keys/set') return ok(await setKey(body, ctx), cors);
      if (path === '/api/keys/test') return ok(await testKey(body, ctx), cors);
      if (path === '/api/keys/testAll') return ok(await testAllKeys(ctx), cors);
      if (path === '/api/keys/delete') return ok(await removeKey(body, ctx), cors);
      if (path === '/api/keys/settings') return ok(await updateSettings(body, ctx), cors);

      // ── entities ────────────────────────────────────────────────────────────
      const dbMatch = path.match(/^\/api\/db\/([A-Za-z0-9_]+)\/([A-Za-z]+)$/);
      if (dbMatch) return ok(await handleDb(dbMatch[1], dbMatch[2], body, ctx), cors);

      // ── functions ───────────────────────────────────────────────────────────
      const fnMatch = path.match(/^\/api\/fn\/([A-Za-z0-9_]+)$/);
      if (fnMatch) {
        const handler = FUNCTIONS[fnMatch[1]];
        if (!handler) throw notFound(`Unknown function: ${fnMatch[1]}`);
        return ok(await handler(body, ctx), cors);
      }

      // ── uploads ─────────────────────────────────────────────────────────────
      if (path === '/api/upload' && req.method === 'POST') {
        return ok(await handleUpload(req, ctx), cors);
      }

      throw notFound(`No route for ${req.method} ${path}`);
    } catch (err) {
      return fail(err, cors);
    }
  },

  /**
   * Daily 48-hour sweep of ephemeral media (wrangler.toml [triggers]).
   *
   * Only `ephemeral/` is touched. `durable/` holds finished exports and R2 cold storage
   * holds oversized D1 columns — deleting either would be data loss, so neither is in
   * scope here. See lib/storage.ts.
   */
  async scheduled(_event: ScheduledController, env: Env, exec: ExecutionContext) {
    exec.waitUntil(
      (async () => {
        // 1. The ephemeral cache — safe, always runs.
        try {
          const { swept, backend } = await sweepExpired(env);
          console.log(
            swept.length
              ? `[sweep] ${backend}: removed ${swept.length} expired path(s): ${swept.join(', ')}`
              : `[sweep] ${backend}: nothing expired`,
          );
        } catch (e: any) {
          console.error('[sweep] ephemeral failed:', e?.message || e);
        }

        // 2. Media belonging to ARCHIVED projects. Off unless explicitly enabled —
        //    this deletes generated work, so it is never inferred.
        if (env.ARCHIVE_SWEEP_ENABLED !== 'true') return;
        try {
          const system = { id: 'system', email: 'system@sweep' };
          const db = makeDb(env, system);
          const archived = await db.Projects.filter({ archived: true }, '-updated_date', 50);
          for (const p of archived) {
            const ctx = {
              env, user: system, db,
              keys: makeKeyResolver(env, system),
              waitUntil: (x: Promise<unknown>) => exec.waitUntil(x),
            } as Ctx;
            const { deleted } = await sweepArchivedProject(ctx, p.id);
            if (deleted.length) {
              console.log(`[sweep] archived project ${p.id}: freed ${deleted.length} asset(s)`);
            }
          }
        } catch (e: any) {
          console.error('[sweep] archive failed:', e?.message || e);
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * Replaces `base44.integrations.Core.UploadFile`. Returns the same `{ file_url }`
 * shape the frontend already reads (see src/lib/directApi.js).
 */
async function handleUpload(req: Request, ctx: Ctx): Promise<{ file_url: string; key: string }> {
  const form = await req.formData();
  // Duck-typed rather than `instanceof File`: workers-types does not expose File as a
  // value, and FormDataEntryValue is `string | File` at runtime either way.
  const file = form.get('file') as unknown as {
    name?: string; type?: string; stream(): ReadableStream;
  } | null;
  if (!file || typeof file.stream !== 'function') throw new Error('No file in request');

  // 'durable': callers persist this URL (project rows, transcripts) and read it back from
  // it, so it outlives the request. Only the export-time proxy cache is ephemeral.
  const stored = await putMedia(ctx, file.stream(), {
    tier: 'durable',
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    prefix: 'uploads',
  });

  return { file_url: stored.url, key: stored.key };
}
