import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = 'http://127.0.0.1:8000'
const AUTH_EMULATOR_TARGET = 'http://127.0.0.1:9099'

// Shared server/preview configuration: allow ngrok tunnel hostnames and reverse-proxy
// backend + Firebase Auth Emulator through one origin so remote viewers need only one link.
const shareProxyConfig = {
  allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'],
  proxy: {
    '/api': {
      target: API_TARGET,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api/, ''),
    },
    '/identitytoolkit.googleapis.com': { target: AUTH_EMULATOR_TARGET, changeOrigin: true },
    '/securetoken.googleapis.com': { target: AUTH_EMULATOR_TARGET, changeOrigin: true },
    '/emulator': { target: AUTH_EMULATOR_TARGET, changeOrigin: true },
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: shareProxyConfig,
  preview: shareProxyConfig,
})
