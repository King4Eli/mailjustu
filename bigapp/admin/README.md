# Postmaster Admin

A responsive React dashboard for the mail server Compose stack: live service health (real TCP checks), real Rspamd stats, mailbox/domain management, and per-domain limits. Talks to `../api/` -- nothing here reaches Docker or the mail stack directly.

Sign-in is a real mailbox login (same IMAP-backed check as webUI), not a shared secret. What you get access to depends on the account:

- Listed in `../.env/api.env`'s `SUPER_ADMIN_EMAILS` -> full access: every domain/mailbox/alias, plus Services/health/stats.
- `virtual_users.is_admin` set for that mailbox -> domain admin: scoped to that one domain, Services/health/stats hidden entirely.
- Anything else -> rejected, no admin access.

See `../.test.credentials.txt` for the seeded super-admin and domain-admin test accounts.

## Run locally

Requires Node.js 20 or newer, and the `api` container (or `node api/src/index.js`) running.

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

Configuration is loaded from `../.env/admin.env`. Variables beginning with
`VITE_` are exposed to the browser and therefore must never contain secrets.
