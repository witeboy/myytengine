// Ported from base44/functions/uploadToR2.ts — HAND-WRITTEN, not codemod output.
//
// The original drove R2 through an S3-compatible HTTP client and four env vars.
// A Worker has R2 as a binding, so the SDK, the credentials, the endpoint and the
// signing all disappear. What must NOT change is the wire contract with the browser:
// src/lib/ExportContext.jsx:69-160 sends init -> chunk×N -> complete (or abort) and
// reads exactly these field names.
//
//   init     { action, filename, content_type, project_id, project_name,
//              total_chunks, total_size }              -> { success, upload_id, r2_key }
//   chunk    { action, upload_id, r2_key, part_number,
//              chunk_base64 }                          -> { success, etag }
//   complete { action, upload_id, r2_key, parts:[{part_number, etag}] }
//                                                      -> { success, url, key }
//   abort    { action, upload_id, r2_key }             -> { success }
//   (none)   { file_base64, filename, ... }            -> { success, url, key }   legacy <5MB
//
// R2 multipart rule the client already satisfies: every part except the last must be
// the same size and >= 5 MiB. ExportContext uses a fixed 5MB CHUNK_SIZE, so do not
// change that constant on either side without changing both.

import { HttpError, badRequest } from '../lib/http';
import type { Ctx, FnHandler } from '../types';

// Finished exports stay on R2, not Bunny, for two reasons: R2's binding has native
// multipart (Bunny Storage does not, and the browser sends 5MB chunks), and these are
// DURABLE — the user's finished video. The `ephemeral/` sweeper in lib/storage.ts never
// looks at this bucket prefix, so nothing here is ever auto-deleted.
function buildKey(ctx: Ctx, filename?: string, projectId?: string) {
  const safeEmail = (ctx.user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const timestamp = Date.now();
  const safeFilename = (filename || 'export.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `exports/${safeEmail}/${projectId || 'general'}/${timestamp}_${safeFilename}`;
}

const publicUrl = (ctx: Ctx, key: string) =>
  `${ctx.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;

/** base64 -> bytes. Chunks arrive ~6.7MB encoded; decode in one pass. */
function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const handler: FnHandler = async (body, ctx) => {
  const { action } = body || {};

  // ── INIT ────────────────────────────────────────────────────────────────────
  if (action === 'init') {
    const { filename, content_type, project_id, project_name, total_size } = body;
    const r2Key = buildKey(ctx, filename, project_id);

    const mpu = await ctx.env.MEDIA.createMultipartUpload(r2Key, {
      httpMetadata: { contentType: content_type || 'video/mp4' },
      customMetadata: {
        'project-id': project_id || '',
        'project-name': project_name || '',
        'uploaded-by': ctx.user.email || '',
        'uploaded-at': new Date().toISOString(),
        'total-size': String(total_size || 0),
      },
    });

    console.log(`☁️ Multipart init: ${r2Key}`);
    return { success: true, upload_id: mpu.uploadId, r2_key: r2Key };
  }

  // ── CHUNK ───────────────────────────────────────────────────────────────────
  if (action === 'chunk') {
    const { upload_id, r2_key, part_number, chunk_base64 } = body;
    if (!upload_id || !r2_key || !part_number || !chunk_base64) {
      throw badRequest('Missing required fields for chunk');
    }

    const mpu = ctx.env.MEDIA.resumeMultipartUpload(r2_key, upload_id);
    const part = await mpu.uploadPart(Number(part_number), decodeBase64(chunk_base64));

    // The browser stores this and sends it back in `complete`.
    return { success: true, etag: part.etag };
  }

  // ── COMPLETE ────────────────────────────────────────────────────────────────
  if (action === 'complete') {
    const { upload_id, r2_key, parts } = body;
    if (!upload_id || !r2_key || !parts?.length) {
      throw badRequest('Missing required fields for complete');
    }

    const mpu = ctx.env.MEDIA.resumeMultipartUpload(r2_key, upload_id);
    await mpu.complete(
      parts.map((p: any) => ({ partNumber: Number(p.part_number), etag: p.etag })),
    );

    const url = publicUrl(ctx, r2_key);
    console.log(`✅ Multipart complete: ${url} (${parts.length} parts)`);
    return { success: true, url, key: r2_key };
  }

  // ── ABORT ───────────────────────────────────────────────────────────────────
  if (action === 'abort') {
    const { upload_id, r2_key } = body;
    if (upload_id && r2_key) {
      try {
        await ctx.env.MEDIA.resumeMultipartUpload(r2_key, upload_id).abort();
        console.log(`🗑️ Multipart aborted: ${r2_key}`);
      } catch (e: any) {
        // The client aborts on a failed chunk and ignores the result. An upload that
        // was never created must not turn into a 500 here.
        console.warn(`Abort failed (ignored): ${e?.message || e}`);
      }
    }
    return { success: true };
  }

  // ── LEGACY single-shot (<5MB) ───────────────────────────────────────────────
  const { file_base64, filename, content_type, project_id } = body;
  if (!file_base64 || !filename) {
    throw badRequest('Provide action or file_base64+filename');
  }

  const r2Key = buildKey(ctx, filename, project_id);
  await ctx.env.MEDIA.put(r2Key, decodeBase64(file_base64), {
    httpMetadata: { contentType: content_type || 'application/octet-stream' },
  });

  const url = publicUrl(ctx, r2Key);
  console.log(`✅ Uploaded: ${url}`);
  return { success: true, url, key: r2Key };
};

export default handler;
