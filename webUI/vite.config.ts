import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = dotenv.config({ path: path.resolve(__dirname, '../.env/webui.env') }).parsed || {}

// Only VITE_-prefixed keys are meant for the browser bundle; everything else
// (WEBUI_DEV_*, WEBUI_PREVIEW_*) configures the dev/preview server itself.
const define = Object.fromEntries(
  Object.entries(env)
    .filter(([key]) => key.startsWith('VITE_'))
    .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define,
  server: {
    host: env.WEBUI_DEV_HOST || '0.0.0.0',
    port: Number(env.WEBUI_DEV_PORT) || 5173,
  },
  preview: {
    host: env.WEBUI_PREVIEW_HOST || '0.0.0.0',
    port: Number(env.WEBUI_PREVIEW_PORT) || 4173,
  },
})
