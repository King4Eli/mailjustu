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
migration step. Each mailbox also gets a real, Dovecot-enforced storage
quota (`quota_mb`, per-domain, see below).

Mailboxes are managed through the admin dashboard's "Mailboxes" tab, or
directly via the API once you're logged in as an admin:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mail.example.com","password":"..."}' | jq -r .token)

curl -X POST http://localhost:4000/api/admin/mailboxes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"you@mail.example.com","password":"..."}'
```

### Admin access is real login, not a shared secret

There's no static admin token. Signing into the admin dashboard is the
same IMAP-backed login as webUI; what you get access to depends on the
account:

- **Super admin** -- email listed in `./.env/api.env`'s
  `SUPER_ADMIN_EMAILS`. Full access: every domain, mailbox, and alias,
  plus Services/health/stats. Bootstrapping the first one has no
  self-serve flow (there's nobody to authorize it yet) -- insert it
  directly into `virtual_users` the first time, see
  `.test.credentials.txt` for how the seeded `admin@mail.example.com` was
  created.
- **Domain admin** -- a mailbox with `virtual_users.is_admin = true`
  (set by a super admin, from the Mailboxes tab or `PATCH
  /api/admin/mailboxes/:id`). Scoped to their own domain only --
  mailboxes, aliases, and domain limits for that one domain -- and never
  sees Services/health/stats.
- Anyone else gets 401 on every `/api/admin/*` route.

webUI shows an "Open admin dashboard" link automatically for accounts
that have either role.

### Aliases are self-service, domain-scoped

Any logged-in webUI user can create their own aliases ("Manage aliases"
in the sidebar) -- mail to the alias lands in their inbox, and Compose
lets them send *as* the alias. Aliases must be on the user's own domain
(`jordan@mail.example.com` can only create `whatever@mail.example.com`,
not another domain) -- that restriction is independent of admin role,
since it's a personal self-service feature, not an admin one.

### Per-domain limits + DNS records

The admin dashboard's Domains tab sets, per domain: max mailboxes, max
aliases per mailbox, and a storage quota (MB) per mailbox -- each falls
back to a global default in `./.env/api.env`
(`MAX_MAILBOXES_PER_DOMAIN`/`MAX_ALIASES_PER_MAILBOX`/`DEFAULT_MAILBOX_QUOTA_MB`)
when left unset. It also generates copy-pasteable MX/A/SPF/DMARC records
for the domain (DKIM is flagged as unavailable -- see Known follow-ups).
Only super admins can create/delete domains; domain admins can edit
limits for their own domain.

## Environment

Each component's configuration lives in its own file under `./.env/`
(`mysql.env`, `postfix.env`, `rspamd.env`, `api.env`, `admin.env`,
`webui.env`, ...) rather than one shared `.env`. Update the passwords in
there before any real deployment -- the checked-in values are placeholders.

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

Express server, no ORM. `src/routes/auth.js` verifies logins by actually
connecting to Dovecot over IMAP, then resolves a role (super/domain/user)
from `SUPER_ADMIN_EMAILS` + `virtual_users.is_admin` and stores it on the
session; `src/routes/mail.js` proxies folders/messages/send (with
attachments, via `multer`)/flags/move/delete over IMAP (imapflow) and SMTP
(nodemailer); `src/routes/aliases.js` is the self-service, domain-scoped
alias CRUD; `src/routes/mailboxes.js` and `src/routes/domains.js` are
role-scoped admin CRUD against MySQL; `src/routes/health.js` and
`src/routes/stats.js` (super-admin only) do live TCP checks and proxy
Rspamd's real controller stats. Webmail/admin sessions are an in-memory
token -> {email, password, role, domain} map with a TTL
(`SESSION_TTL_MINUTES`), not JWTs -- simple, and the password never
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

See `.todo.txt` for the full, organized list. Highlights:

- OpenDKIM ships in verify-only mode. Signing needs real per-domain keys
  and matching DNS TXT records, which only make sense for an owned domain.
- Admin's "Mail activity", "Mail queue", and "Security" views don't exist
  yet -- they'd need Postfix queue introspection and log parsing (queue
  access means either mounting the Docker socket or adding a small
  in-container helper; neither is wired up).
- Received attachments show name/size but there's no download endpoint
  yet -- only the compose-time upload path is wired up.
