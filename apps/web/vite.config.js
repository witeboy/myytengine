import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  server: {
    proxy: {
      // Keep the Better Auth session cookie first-party in local development, just
      // as the Vercel rewrite does in production.
      '/api/auth': {
        target: 'https://ep-red-sunset-axfihokp.neonauth.c-4.us-east-2.aws.neon.tech',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/neondb/auth'),
      },
    },
  },
  plugins: [react()],
  resolve: {
    // The retired hosting plugin used to provide this. `@/...` is used by every import in the app.
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
