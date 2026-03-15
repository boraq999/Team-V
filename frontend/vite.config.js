import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // استمع على كل الواجهات (شبكة محلية وإنترنت)
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: ['v.jree.com.ly'], // السماح بفتح الموقع من الدومين الخاص بك
  },
})
