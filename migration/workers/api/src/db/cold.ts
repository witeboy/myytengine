// D1-hot / R2-cold offload. See MIGRATION-PLAN.md C-4.
//
// D1 caps a row at ~1MB. Several columns in this app routinely exceed that
// (timeline clip arrays, caption data, full scripts, word timings). Fields marked
// `cold` in registry.ts are transparently moved to R2 above COLD_THRESHOLD; the
// column then holds a sentinel `{"__r2":"<key>"}`.
//
// Calling code never sees the sentinel — client.ts rehydrates on every read.

import { COLD_THRESHOLD } from './registry';

const SENTINEL = '__r2';

interface Sentinel {
  __r2: string;
  bytes: number;
}

export const coldKey = (entity: string, id: string, field: string) =>
  `cold/${entity}/${id}/${field}.json`;

export function isSentinel(v: unknown): v is Sentinel {
  return (
    typeof v === 'object' && v !== null && typeof (v as any)[SENTINEL] === 'string'
  );
}

/**
 * Decide whether `serialized` needs offloading. Returns the string to store in the
 * column — either the original value or a sentinel — writing to R2 as a side effect.
 */
export async function maybeOffload(
  bucket: R2Bucket,
  entity: string,
  id: string,
  field: string,
  serialized: string,
): Promise<string> {
  if (serialized.length <= COLD_THRESHOLD) return serialized;
  const key = coldKey(entity, id, field);
  await bucket.put(key, serialized, {
    httpMetadata: { contentType: 'application/json' },
  });
  return JSON.stringify({ [SENTINEL]: key, bytes: serialized.length } satisfies Sentinel);
}

/** Inverse of maybeOffload. Returns the original serialized string. */
export async function rehydrate(
  bucket: R2Bucket,
  stored: string,
): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored; // not JSON, therefore not a sentinel
  }
  if (!isSentinel(parsed)) return stored;

  const obj = await bucket.get(parsed.__r2);
  if (!obj) {
    // The blob is gone but the row survives. Fail loudly rather than silently
    // handing back a sentinel that the frontend would render as garbage.
    throw new Error(`Cold blob missing: ${parsed.__r2}`);
  }
  return await obj.text();
}

/** Called on delete so R2 does not accumulate orphans. */
export async function purge(bucket: R2Bucket, entity: string, id: string): Promise<void> {
  const prefix = `cold/${entity}/${id}/`;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
