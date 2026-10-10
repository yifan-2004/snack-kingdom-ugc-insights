import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: '/workbench/',
  plugins: [react()],
  define: { 'import.meta.env.VITE_HOSTED_SITE': JSON.stringify('true') },
  server: { proxy: { '/api': 'http://localhost:3000', '/login': 'http://localhost:3000' } },
  build: { outDir: '../backend/public/workbench', emptyOutDir: true },
})
