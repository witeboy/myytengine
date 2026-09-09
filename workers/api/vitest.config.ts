import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.toml' },
    }),
  ],
  test: {
    fileParallelism: false,
    include: ['test/**/*.spec.ts'],
    testTimeout: 30_000,
  },
});
