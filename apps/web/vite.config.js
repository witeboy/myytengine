import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  server: {
    // The visual style catalogue lives outside this app so the Worker shares the same file.
    fs: { allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../../shared')] },
    proxy: {
      // The session cookie is httpOnly and host-only, so the API has to look
      // same-origin in development too. Mirrors the Vercel rewrite.
      '/api': {
        target: 'https://myytengine-api.tolu-adebisi.workers.dev',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    // The the original platform plugin used to provide this. `@/...` is used by every import in the app.
    alias: {
      '@': path.resolve(__dirname, './src'),
      // One definition of the visual styles, shared with workers/api.
      '@shared': path.resolve(__dirname, '../../shared'),
    },
  },
});
