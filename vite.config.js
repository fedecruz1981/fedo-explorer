// ============================================================
//  fedo~explorer — configuracion de Vite
//  Build del renderer React + servidor de desarrollo
//  Firmado: fedo soft
// ============================================================
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Soporte JSX/React Fast Refresh
  plugins: [react()],
  // Rutas relativas: permite cargar el build desde file:// en Electron
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1'
  },
  build: {
    outDir: 'dist'
  }
})
