import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.ELECTRON_BUILD === 'true' ? './' : '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all'
  }
})
