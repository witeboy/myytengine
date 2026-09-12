// Ported from the original hosted proxyFetchAsset function — HAND-WRITTEN.
//
// Downloads a CORS-blocked provider URL server-side so the browser exporter can use it.
// Small files come back as inline base64; large ones are re-hosted in R2.
//
// The caller (src/components/timeline/useVideoExport.jsx:299) reads:
//     pd.success && pd.data  -> atob(pd.data)          small file
//     pd.success && pd.file_url                        large file
// Both shapes are preserved exactly.
//
// Changed from the original: the S3 SDK is gone (R2 is a binding) and the base64
// encoder no longer uses String.fromCharCode.apply on a subarray — that spreads the
// chunk across the argument stack and throws RangeError on larger inputs in a Worker.
// Same output, safe at 12MB.

import { HttpError, badRequest } from '../lib/http';
import { ownMediaHosts } from '../lib/storage';
import type { FnHandler } from '../types';

const INLINE_MAX_BYTES = 12 * 1024 * 1024; // 12MB -> inline base64

// Substring match, exactly as the original. These are provider CDNs whose URLs are
// short-lived and/or CORS-blocked.
const ALLOWED = [
  'aiquickdraw.com',
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'api.kie.ai',
  'kie-asset',
  'kie.ai',
  'suno',
  'ideogram.ai',
  'image.pollinations.ai',
  'oaidalleapiprodscus.blob.core.windows.net',
  'replicate.delivery',
  'cdn.openai.com',
  'fal.media',
  'fal.ai',
  'r2.cloudflarestorage.com',
  'myvoicify.app',
  'pexels.com',
  'pixabay.com',
  'freepik.com',
  'cloudinary.com',
];

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    // Explicit loop rather than fromCharCode.apply(null, slice): apply() pushes every
    // element onto the argument stack and blows up on large buffers.
    let s = '';
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    binary += s;
  }
  return btoa(binary);
}

const handler: FnHandler = async (body, ctx) => {
  const { url } = body || {};
  if (!url || !String(url).startsWith('http')) throw badRequest('Invalid URL');

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw badRequest('Malformed URL');
  }
  // Our own storage host (R2 custom domain / Bunny CDN) is trusted alongside the
  // original provider list — the exporter proxies durable scene media through here.
  if (![...ALLOWED, ...ownMediaHosts(ctx.env)].some((d) => hostname.includes(d))) {
    throw new HttpError(403, `Domain not allowed: ${hostname}`);
  }

  console.log(`📥 Proxy fetching: ${String(url).substring(0, 100)}...`);

  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new HttpError(response.status, `Fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sizeKB = (bytes.length / 1024).toFixed(1);
  console.log(`✓ Downloaded: ${sizeKB}KB (${contentType})`);

  // Small files -> inline base64. Avoids public-bucket CORS entirely.
  if (bytes.length <= INLINE_MAX_BYTES) {
    console.log(`✅ Returning inline base64 (${sizeKB}KB)`);
    return {
      success: true,
      data: toBase64(bytes),
      content_type: contentType,
      size: bytes.length,
    };
  }

  // Large files -> R2.
  const ext = contentType.includes('video') ? 'mp4'
    : contentType.includes('png') ? 'png'
    : contentType.includes('webp') ? 'webp'
    : 'jpg';
  const key = `proxy/${Date.now()}.${ext}`;

  await ctx.env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });

  const fileUrl = `${ctx.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  console.log(`✅ Re-uploaded to R2: ${fileUrl}`);

  return {
    success: true,
    file_url: fileUrl,
    content_type: contentType,
    size: bytes.length,
  };
};

export default handler;
