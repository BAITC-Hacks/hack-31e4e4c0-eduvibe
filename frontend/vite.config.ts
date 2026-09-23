import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxy = { '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, proxy },
  preview: { host: '0.0.0.0', port: 5173, proxy },
})
