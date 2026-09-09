import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: true,
      wrangler: { configPath: './wrangler.phase5.remote.toml' },
    }),
  ],
  test: {
    fileParallelism: false,
    include: ['test/**/*.remote.spec.ts'],
    testTimeout: 180_000,
  },
});
