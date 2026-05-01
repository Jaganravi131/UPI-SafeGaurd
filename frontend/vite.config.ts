import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // In production builds (e.g. Render static site) the API base URL is baked
  // in at build time via VITE_API_BASE_URL. When that var is set, skip the
  // local proxy because API calls go directly to the backend domain.
  const useProxy = !env.VITE_API_BASE_URL

  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
      proxy: useProxy
        ? {
            '/api': {
              target: 'http://localhost:8000',
              changeOrigin: true,
            },
          }
        : undefined,
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
