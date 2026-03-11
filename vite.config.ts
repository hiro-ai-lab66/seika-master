import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // VERCEL環境では '/' を使用し、それ以外（GitHub Pages等）では '/seika-master/' を使用する
  base: process.env.VERCEL ? "/" : "/seika-master/",
  plugins: [react()],
})
