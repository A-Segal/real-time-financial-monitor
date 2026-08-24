import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.dirname(fileURLToPath(import.meta.url))

// When VITE_API_URL is set at dev-time, the frontend talks directly to that
// backend (bypassing the Vite proxy).  Without it, the proxy is used so
// `npm run dev` works out of the box against a single backend on port 5120.
const apiUrl = process.env.VITE_API_URL

const proxyTarget = apiUrl ?? 'http://127.0.0.1:5120'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@testing-library': path.join(clientRoot, 'node_modules/@testing-library'),
      react: path.join(clientRoot, 'node_modules/react'),
      'react-dom': path.join(clientRoot, 'node_modules/react-dom'),
      '@microsoft/signalr': path.join(clientRoot, 'node_modules/@microsoft/signalr'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'jsdom',
    setupFiles: ['../tests/FinancialMonitor.Client.Tests/setup.ts'],
    include: ['../tests/FinancialMonitor.Client.Tests/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/hubs': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
