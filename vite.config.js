import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Si estamos en un GitHub Action, usamos la base del repo, sino la raíz (para Vercel o local).
  base: process.env.GITHUB_ACTIONS ? '/phtoboothVicky/' : '/',
})
