import { afterEach, describe, expect, it, vi } from 'vitest';

import { authenticate } from '../src/middleware/auth';
import type { Env } from '../src/types';

const encode = (value: string | Uint8Array) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Managed Better Auth JWT verification', () => {
  it('accepts the EdDSA/Ed25519 tokens issued by Neon Auth', async () => {
    const issuer = 'https://phase3-auth.example';
    const kid = 'phase3-ed25519';
    const keys = (await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    Object.assign(jwk, { kid, alg: 'EdDSA', use: 'sig' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );

    const header = encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid }));
    const payload = encode(
      JSON.stringify({
        sub: 'phase3-user',
        email: 'phase3@example.invalid',
        name: 'Phase 3',
        iss: issuer,
        aud: issuer,
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const signature = await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(unsigned));
    const token = `${unsigned}.${encode(new Uint8Array(signature))}`;

    const env = {
      NEON_AUTH_JWKS_URL: `${issuer}/.well-known/jwks.json`,
      NEON_AUTH_ISSUER: issuer,
      NEON_AUTH_AUDIENCE: issuer,
    } as Env;
    const req = new Request('https://worker.example/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await expect(authenticate(req, env)).resolves.toEqual({
      id: 'phase3-user',
      email: 'phase3@example.invalid',
      name: 'Phase 3',
    });
  });
});

