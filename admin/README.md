# Postmaster Admin

A responsive React dashboard for the mail server Compose stack. It provides an interface for service health, mail traffic, delivery metrics, security events, and container resource usage.

The current dashboard uses clearly marked demo data. Connect it to a protected backend API before using service controls or displaying production metrics; browsers should not access the Docker socket directly.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

Configuration is loaded from `../.env/admin.env`. Variables beginning with
`VITE_` are exposed to the browser and therefore must never contain secrets.
