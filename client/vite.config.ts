import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API requests to the backend dev server.
      // The client refers to the API by the relative "/api" path; the proxy
      // maps it onto the backend running on plain HTTP.
      '/api': {
        target: 'http://localhost:5120',
        changeOrigin: true,
      },
    },
  },
})
