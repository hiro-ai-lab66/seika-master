import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // dev/Vercelでは '/'、GitHub Pages等の本番ビルドでは '/seika-master/' を使用する
  base: command === 'serve' || process.env.VERCEL ? "/" : "/seika-master/",
  plugins: [react()],
}))
