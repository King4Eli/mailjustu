import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Browser-facing VITE_ values live in a file shared with webmail/ -- see
// .env/public.vite.env. PUBLIC: everything in that file ships to the browser.
const viteEnv = dotenv.config({ path: path.resolve(__dirname, '../../.env/public.vite.env') }).parsed || {}

const define = Object.fromEntries(
  Object.entries(viteEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
)

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  define,
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
