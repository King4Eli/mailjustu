import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Browser-facing VITE_ values live in a file shared with admin/ -- see
// .env/public.vite.env. PUBLIC: everything in that file ships to the browser.
const viteEnv = dotenv.config({ path: path.resolve(__dirname, '../../.env/public.vite.env') }).parsed || {}

const define = Object.fromEntries(
  Object.entries(viteEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
)

// https://vite.dev/config/
export default defineConfig({
  base: '/webmail/',
  plugins: [react(), tailwindcss()],
  define,
  server: {
    host: '0.0.0.0',
    port: 5174, // offset from admin/'s 5173 so both dev servers can run at once
  },
  preview: {
    host: '0.0.0.0',
    port: 4174, // offset from admin/'s 4173 so both preview servers can run at once
  },
})
