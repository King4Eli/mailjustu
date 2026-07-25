# Mailbox

A webmail client (React + TypeScript + Vite + Tailwind): folders, message
list, reading pane, compose, reply/forward, star/archive/delete. Backed by
real IMAP/SMTP through `../api/` -- sign in with a mailbox created via the
admin dashboard (or the API directly) and it's a real inbox, not a demo.

## Run locally

Requires Node.js 20 or newer, and the `api` container (or `node
api/src/index.js`) running against a Dovecot/Postfix that actually has the
account you're signing in with.

```bash
npm install
npm run dev
```

Configuration (dev/preview ports, where to find the API) is loaded from
`../.env/webui.env`.
