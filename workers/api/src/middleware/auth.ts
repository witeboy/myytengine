// Auth middleware — replaces the original platform's `createClientFromRequest(req).auth.me()`.
//
// The SPA sends `Authorization: Bearer <Neon Auth access token>`. We verify the JWT
// against the issuer's JWKS and hand the router a `User`. Every ported function then
// receives `ctx.user` already populated, so the old
//     const user = await the hosted auth SDK; if (!user) return 401
// prologue is deleted from all ~274 handlers.

import { HttpError, unauthorized } from '../lib/http';
import { currentUser } from '../lib/session';
import type { Env, User } from '../types';

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  [k: string]: unknown;
}

// Module-scope cache: survives across requests on a warm isolate.
let jwksCache: { url: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

const b64urlToBytes = (s: string) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const b64urlToJson = (s: string) =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getJwks(url: string, force = false): Promise<Jwk[]> {
  const fresh = jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache!.keys;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HttpError(503, `JWKS fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys || [];
  jwksCache = { url, keys, fetchedAt: Date.now() };
  return keys;
}

const ALGS: Record<
  string,
  {
    importAlgorithm: string | SubtleCryptoImportKeyAlgorithm;
    verifyAlgorithm: string | SubtleCryptoSignAlgorithm;
  }
> = {
  EdDSA: {
    importAlgorithm: { name: 'Ed25519' },
    verifyAlgorithm: { name: 'Ed25519' },
  },
  RS256: {
    importAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyAlgorithm: 'RSASSA-PKCS1-v1_5',
  },
  RS384: {
    importAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
    verifyAlgorithm: 'RSASSA-PKCS1-v1_5',
  },
  RS512: {
    importAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    verifyAlgorithm: 'RSASSA-PKCS1-v1_5',
  },
  ES256: {
    importAlgorithm: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
  },
};

async function verifyJwt(token: string, env: Env): Promise<Record<string, any>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('Malformed token');
  const [h, p, s] = parts;

  let header: any;
  let payload: any;
  try {
    header = b64urlToJson(h);
    payload = b64urlToJson(p);
  } catch {
    throw unauthorized('Malformed token');
  }

  const spec = ALGS[header.alg];
  if (!spec) throw unauthorized(`Unsupported token algorithm: ${header.alg}`);

  // Look up the signing key; refetch once in case of rotation.
  let keys = await getJwks(env.NEON_AUTH_JWKS_URL);
  let jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(env.NEON_AUTH_JWKS_URL, true);
    jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  }
  if (!jwk) throw unauthorized('Token signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    spec.importAlgorithm,
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    spec.verifyAlgorithm,
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw unauthorized('Invalid token signature');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 30) {
    throw unauthorized('Token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now + 30) {
    throw unauthorized('Token not yet valid');
  }
  if (env.NEON_AUTH_ISSUER && payload.iss !== env.NEON_AUTH_ISSUER) {
    throw unauthorized('Unexpected token issuer');
  }
  if (env.NEON_AUTH_AUDIENCE) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.NEON_AUTH_AUDIENCE)) throw unauthorized('Unexpected token audience');
  }

  return payload;
}

export async function authenticate(req: Request, env: Env): Promise<User> {
  // Self-hosted session first: an opaque token in an httpOnly cookie, the same
  // model the other rcinc.app apps use. Only reachable once AUTH_DATABASE_URL is
  // configured, so this is inert until the cutover.
  if (env.AUTH_DATABASE_URL) {
    const session = await currentUser(env, req).catch(() => null);
    if (session) {
      return { id: session.id, email: session.email, name: session.name };
    }
  }

  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw unauthorized('Missing bearer token');

  const claims = await verifyJwt(token, env);
  const id = claims.sub;
  if (!id) throw unauthorized('Token has no subject');

  return {
    id: String(id),
    email: String(claims.email || claims.primary_email || ''),
    name: claims.name || claims.display_name || undefined,
  };
}
