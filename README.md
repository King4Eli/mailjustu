# mailserver

A self-hosted mail server (Postfix + Dovecot + MySQL, with optional spam
filtering, DKIM, and antivirus), a small API (`api/`) that provisions
mailboxes and speaks IMAP/SMTP on their behalf, and two React frontends:
`admin/` (an operator dashboard) and `webUI/` (a webmail client). Both
frontends are wired to the real API -- no mock data.

## Running the mail stack

`docker-compose.yml` is the minimum required to send and receive mail:
MySQL, Postfix, Dovecot, and the API. `docker-compose.override.yml` sits
next to it and is loaded automatically by plain `docker compose` -- it
adds dev-only ports and bind-mounts each service's config under
`./volumes` so it's visible and editable on the host.

```bash
docker compose up -d
```

Everything else is opt-in, one file per concern:

| File | Adds | Why it's separate |
| --- | --- | --- |
| `docker-compose.rspamd.yml` | Redis + Rspamd | Spam filtering -- useful, not required to send/receive mail |
| `docker-compose.opendkim.yml` | OpenDKIM | DKIM signing/verification -- improves deliverability, not required |
| `docker-compose.clamav.yml` | ClamAV | Antivirus scanning -- not required |

Layer in whichever you want with `-f`:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.rspamd.yml \
  -f docker-compose.opendkim.yml \
  -f docker-compose.clamav.yml \
  up -d
```

Postfix is already configured (`./.env/postfix.env`) to route mail through
the Rspamd and OpenDKIM milters if they're running; if you don't include
those files, Postfix just skips them (`milter_default_action=accept`).

For a production deploy, skip the dev override and supply your own:
`docker compose -f docker-compose.yml -f docker-compose.<yours>.yml up -d`.

## Mailboxes are real accounts

Virtual domains/users/aliases live in MySQL (`./schema.sql`) and are read
directly by Postfix (`mysql:` maps) and Dovecot (SQL passdb) -- so a
mailbox created through the admin dashboard (or the API) can immediately
send, receive, and log in over real SMTP/IMAP. The `api/` container
applies `schema.sql` on startup (idempotent), so there's no manual
migration step.

Create one from the command line:

```bash
curl -X POST http://localhost:4000/api/admin/mailboxes \
  -H "Authorization: Bearer $(grep ^ADMIN_TOKEN .env/api.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@mail.example.com","password":"..."}'
```

or through the admin dashboard's "Mailboxes" tab.

## Environment

Each component's configuration lives in its own file under `./.env/`
(`mysql.env`, `postfix.env`, `rspamd.env`, `api.env`, `admin.env`,
`webui.env`, ...) rather than one shared `.env`. Update the passwords in
there before any real deployment -- the checked-in values are placeholders.

`./.env/api.env`'s `ADMIN_TOKEN` gates the admin dashboard and the
`/api/admin/*` routes -- it's a shared secret typed into the dashboard's
token screen, never baked into the built frontend JS.

## Frontends

```bash
cd admin && npm install && npm run dev   # operator dashboard, :5173
cd webUI && npm install && npm run dev   # webmail client, :5174
```

Both read their dev/preview ports and public `VITE_` config (including
where to find the API) from `../.env/admin.env` and `../.env/webui.env`.
Neither talks to Docker or the mail stack directly -- everything goes
through `api/` (`:4000`).

## api/

Express server, no ORM. `src/routes/auth.js` verifies webmail logins by
actually connecting to Dovecot over IMAP; `src/routes/mail.js` proxies
folders/messages/send/flags/move/delete over IMAP (imapflow) and SMTP
(nodemailer); `src/routes/mailboxes.js` is the admin-only mailbox CRUD
against MySQL; `src/routes/health.js` does a live TCP check against each
container; `src/routes/stats.js` proxies Rspamd's real controller stats.
Webmail sessions are an in-memory token -> {email, password} map with a
TTL (`SESSION_TTL_MINUTES`), not JWTs -- simple, and the password never
touches the browser after login.

## Backing up / restoring

`./schema.sql` is the schema alone (what `api/` applies on boot).
`./dump.sql` is a full `mysqldump` snapshot (schema + data) taken at a
point in time -- regenerate it with:

```bash
docker exec mail-mysql mysqldump -u root -p"$(grep ^MYSQL_ROOT_PASSWORD .env/mysql.env | cut -d= -f2)" \
  --databases mail --routines --triggers > dump.sql
```

It contains bcrypt password hashes, not plaintext -- still, treat it as a
secret, same as the `.env/` files.

## Known follow-ups

- OpenDKIM ships in verify-only mode. Signing needs real per-domain keys
  and matching DNS TXT records, which only make sense for an owned domain.
- Admin's "Mail activity", "Mail queue", "Security", and "Storage" tabs
  are still placeholders -- they'd need Postfix queue introspection and
  log parsing (queue access means either mounting the Docker socket or
  adding a small in-container helper; neither is wired up yet).
- No quota/storage enforcement per mailbox.
