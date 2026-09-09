import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: true,
      wrangler: { configPath: './wrangler.test.remote.toml' },
    }),
  ],
  test: {
    fileParallelism: false,
    include: ['test/**/*.spec.ts'],
    testTimeout: 120_000,
  },
});
