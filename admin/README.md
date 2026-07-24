# Postmaster Admin

A responsive React dashboard for the mail server Compose stack: live service health (real TCP checks), real Rspamd stats, and mailbox management. Talks to `../api/` -- nothing here reaches Docker or the mail stack directly.

On load it asks for the API's `ADMIN_TOKEN` (see `../.env/api.env`) and keeps it in memory/localStorage; it's never bundled into the built JS, unlike `VITE_`-prefixed values.

## Run locally

Requires Node.js 20 or newer, and the `api` container (or `node api/src/index.js`) running.

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

Configuration is loaded from `../.env/admin.env`. Variables beginning with
`VITE_` are exposed to the browser and therefore must never contain secrets.
