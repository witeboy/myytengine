import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      visualEditAgent: true
    }),
    react(),
  ]
});
