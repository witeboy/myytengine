import { describe, expect, it } from 'vitest';

import { corsHeaders } from '../src/lib/http';
import type { Env } from '../src/types';

const env = {
  ALLOWED_ORIGINS: 'http://localhost:5173,https://myytengine.vercel.app',
} as Env;

describe('corsHeaders', () => {
  it('echoes an exact configured origin', () => {
    const headers = corsHeaders(
      new Request('https://api.example.test/api/health', {
        headers: { Origin: 'https://myytengine.vercel.app' },
      }),
      env,
    );

    expect(headers['Access-Control-Allow-Origin']).toBe('https://myytengine.vercel.app');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('omits the allow-origin header for unconfigured or absent origins', () => {
    const unconfigured = corsHeaders(
      new Request('https://api.example.test/api/health', {
        headers: { Origin: 'https://example.invalid' },
      }),
      env,
    );
    const absent = corsHeaders(new Request('https://api.example.test/api/health'), env);

    expect(unconfigured).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(absent).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(JSON.stringify([unconfigured, absent])).not.toContain('*');
  });
});
