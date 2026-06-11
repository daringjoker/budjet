import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/trpc': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'recharts'
            if (
              id.includes('react-router-dom') ||
              id.includes('@tanstack/react-query') ||
              id.includes('@trpc') ||
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('react/jsx-runtime') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
})
