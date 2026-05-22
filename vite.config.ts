import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Set SPOOLMAN_URL in .env.local for local dev (see .env.example)
        target: process.env.SPOOLMAN_URL ?? 'http://localhost:7912',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
      },
      '/spoolmansync-api': {
        // Set SPOOLMANSYNC_URL in .env.local for local dev
        target: process.env.SPOOLMANSYNC_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spoolmansync-api/, '/api'),
      },
    },
  },
})
