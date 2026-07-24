import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = dotenv.config({ path: path.resolve(__dirname, '../.env/admin.env') }).parsed || {}

// Only VITE_-prefixed keys are meant for the browser bundle; everything else
// (ADMIN_DEV_*, ADMIN_PREVIEW_*) configures the dev/preview server itself.
const define = Object.fromEntries(
  Object.entries(env)
    .filter(([key]) => key.startsWith('VITE_'))
    .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
)

export default defineConfig({
  plugins: [react()],
  define,
  server: {
    host: env.ADMIN_DEV_HOST || '0.0.0.0',
    port: Number(env.ADMIN_DEV_PORT) || 5173,
  },
  preview: {
    host: env.ADMIN_PREVIEW_HOST || '0.0.0.0',
    port: Number(env.ADMIN_PREVIEW_PORT) || 4173,
  },
})
